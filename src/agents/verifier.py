# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Two-stage RAG verification agent.

Implements the core DocuGardener verification pipeline:
1. Generator: Creates documentation update drafts
2. Verifier: Checks drafts against code for hallucinations

This ensures deterministic, reliable documentation suggestions.
"""

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any

from src.agents.llm import (
    LLMClient,
    LLMConfig,
    LLMProvider,
    LLMResponse,
    check_llm_rate_limit,
    create_llm_client,
)
from src.agents.prompts import (
    DRAFT_GENERATION_PROMPT,
    DRIFT_PROPOSAL_PROMPT,
    DRIFT_VERIFICATION_PROMPT,
    VERIFICATION_PROMPT,
)
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.scorer import DriftScorer
from src.api.middleware import get_tenant_id
from src.core.config import settings
from src.core.logging import get_logger
from src.monitoring.metrics import record_llm_request
from src.pipeline.job_manager import get_db
from src.security.crypto import decrypt
from src.storage.prompt_manager import prompt_manager
from src.storage.sql_models import Tenant
from src.storage.vectordb import SearchResult

logger = get_logger(__name__)

# LLM-05: Per-provider cost tables (USD per 1M tokens).
# Ollama = 0 (self-hosted).  OpenAI prices are approximate averages for gpt-4o.
# These are used for informational reporting only — billing is not based on them.
_PROVIDER_COSTS: dict[str, dict[str, float]] = {
    "gemini": {"input": 0.10, "output": 0.40},
    "openai": {"input": 2.50, "output": 10.00},  # gpt-4o tier (approximate)
    "ollama": {"input": 0.00, "output": 0.00},
    # EPIC-04-02: Anthropic Claude Sonnet 4.6 pricing ($3/$15 per 1M; cache reads = 10% of input)
    "anthropic": {"input": 3.00, "output": 15.00, "cache_read": 0.30},
}

# Legacy names kept for backward compatibility
_GEMINI_COST_PER_M_INPUT = _PROVIDER_COSTS["gemini"]["input"]
_GEMINI_COST_PER_M_OUTPUT = _PROVIDER_COSTS["gemini"]["output"]


@dataclass
class VerificationResult:
    """
    Result from the verification stage.

    Attributes:
        verdict: ACCURATE or HALLUCINATION
        confidence: Confidence score (0-1)
        issues: List of issues found
        suggestions: Optional improvement suggestions
    """

    verdict: str
    confidence: float
    issues: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)

    @property
    def is_accurate(self) -> bool:
        """Check if documentation passed verification."""
        return self.verdict.upper() == "ACCURATE"

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "VerificationResult":
        """Create from parsed JSON response."""
        return cls(
            verdict=data.get("verdict", "HALLUCINATION"),
            confidence=float(data.get("confidence", 0.0)),
            issues=data.get("issues", []),
            suggestions=data.get("suggestions", []),
        )


@dataclass
class DocumentationDraft:
    """
    A generated documentation draft.

    Attributes:
        entity_name: Name of the documented entity
        file_path: Path where the docs should be saved (e.g., docs/api/utils.md)
        content: Generated documentation content
        verification: Verification result (after verification stage)
        attempts: Number of generation attempts
    """

    entity_name: str
    file_path: str
    content: str
    verification: VerificationResult | None = None
    attempts: int = 1

    @property
    def is_verified(self) -> bool:
        """Check if draft has been verified as accurate."""
        return self.verification is not None and self.verification.is_accurate


@dataclass
class DriftAnalysis:
    """
    Result of drift severity analysis.

    Attributes:
        drift_score: Severity score (0-100)
        severity: Category (minor/moderate/significant/critical)
        required_updates: List of required doc updates
        block_merge: Whether to block PR merge
        summary: Brief explanation
        confidence_score: Verifier confidence in the analysis (0.0–1.0).
            When below GRACE_THRESHOLD the merge block is lifted automatically
            so low-confidence analyses never gate human code review.
    """

    drift_score: int
    severity: str
    required_updates: list[dict[str, str]]
    block_merge: bool
    summary: str
    confidence_score: float = 1.0

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "DriftAnalysis":
        """Create from parsed JSON response."""
        return cls(
            drift_score=int(data.get("drift_score", 50)),
            severity=data.get("severity", "moderate"),
            required_updates=data.get("required_updates", []),
            block_merge=data.get("block_merge", False),
            summary=data.get("summary", ""),
            confidence_score=float(data.get("confidence_score", 1.0)),
        )


# SCALE-05: Confidence Intervals / Grace Mode
# When the verifier's confidence in its own analysis drops below this threshold,
# DocuGardener lifts the merge block automatically.  The comment still appears
# on the PR so the team can review, but CI is never gated by a low-confidence
# result.
_GRACE_THRESHOLD: float = 0.5


class VerificationAgent:
    """
    Two-stage RAG verification agent.

    Stage 1 (Generator): Creates documentation drafts based on code changes
    Stage 2 (Verifier): Validates drafts against actual code

    Only verified documentation makes it to the PR.
    """

    def __init__(
        self,
        generator_client: LLMClient | None = None,
        verifier_client: LLMClient | None = None,
        max_retries: int = 2,
        tone: str = "Strict",
    ):
        """
        Initialize the verification agent.

        Args:
            generator_client: LLM for generating drafts
            verifier_client: LLM for verification (can be same or different)
            max_retries: Max retries on hallucination detection
            tone: Bot personality tone (Strict, Friendly, Detailed)
        """
        tenant_id = get_tenant_id()
        llm_kwargs = {}
        llm_provider = None

        # Load custom Tenant llmConfig overrides from postgres
        try:
            db_session = next(get_db())
            tenant = db_session.query(Tenant).filter(Tenant.id == tenant_id).first()
            if (
                tenant
                and tenant.llmConfig
                and dict(tenant.llmConfig).get("provider") != "platform_default"
            ):
                llm_config = dict(tenant.llmConfig)
                provider_str = llm_config.get("provider", "").lower()

                # Per-provider maps (current storage format from settings API)
                _models_map = llm_config.get("models") or {}
                _keys_map = llm_config.get("keys") or {}
                # Legacy flat fields as fallback
                _legacy_model = llm_config.get("modelName")
                _legacy_key = llm_config.get("apiKey")

                def _get_model(provider: str, default: str) -> str:
                    return _models_map.get(provider) or _legacy_model or default

                def _get_encrypted_key(provider: str) -> str | None:
                    return _keys_map.get(provider) or _legacy_key or None

                if provider_str == "ollama":
                    llm_provider = LLMProvider.OLLAMA
                    llm_kwargs["model"] = _get_model("ollama", "llama3")
                    base_url = llm_config.get("baseUrls", {}).get("ollama") or llm_config.get(
                        "baseUrl"
                    )
                    if base_url:
                        llm_kwargs["url"] = base_url
                    # LLM-03: persist wire format per tenant to skip auto-detection
                    if llm_config.get("wireFormat") in ("ollama", "openai"):
                        llm_kwargs["wire_format"] = llm_config["wireFormat"]
                elif provider_str == "gemini":
                    llm_provider = LLMProvider.GEMINI
                    llm_kwargs["model"] = _get_model("gemini", "gemini-2.0-flash")
                    _enc_key = _get_encrypted_key("gemini")
                    if _enc_key:
                        try:
                            llm_kwargs["api_key"] = decrypt(_enc_key)
                        except Exception as e:
                            logger.error(
                                "Failed to decrypt custom API key",
                                error=str(e),
                                tenant_id=tenant_id,
                            )
                elif provider_str == "openai":
                    llm_provider = LLMProvider.OPENAI
                    llm_kwargs["model"] = _get_model("openai", "gpt-4o")
                    _enc_key = _get_encrypted_key("openai")
                    if _enc_key:
                        try:
                            llm_kwargs["api_key"] = decrypt(_enc_key)
                        except Exception as e:
                            logger.error(
                                "Failed to decrypt custom API key",
                                error=str(e),
                                tenant_id=tenant_id,
                            )
        except Exception as e:
            logger.warning("Failed to load tenant LLM config", error=str(e), tenant_id=tenant_id)

        # Zero-Config fallback (UX-03): if the tenant has no LLM config and the
        # operator has set a bundled key, use it so users see the product work on
        # Day 0 without touching Settings. The bundled key is an operator-level
        # secret read from env — it never goes through encrypt()/decrypt().
        if llm_provider is None and settings.bundled_gemini_key:
            llm_provider = LLMProvider.GEMINI
            llm_kwargs["api_key"] = settings.bundled_gemini_key
            llm_kwargs["model"] = settings.bundled_gemini_model
            logger.warning(
                "No tenant LLM config — using bundled free-tier key. "
                "Configure your own key in Settings for higher rate limits.",
                tenant_id=tenant_id,
            )

        self.generator = generator_client or create_llm_client(provider=llm_provider, **llm_kwargs)
        self.verifier = verifier_client or self.generator  # Can use same client
        self.max_retries = max_retries
        self.tone = tone
        self.scoring_model = "basic"  # Default; overridden below from tenant config if available
        self._session_tokens: dict[str, int] = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cache_read_tokens": 0,  # EPIC-04-02: Anthropic cache read tokens
            "cache_creation_tokens": 0,  # EPIC-04-02: Anthropic cache write tokens
        }
        self._session_provider: str = llm_provider.value if llm_provider else "gemini"
        self._session_model: str = llm_kwargs.get(
            "model", settings.bundled_gemini_model or "gemini-2.0-flash"
        )

        # Read scoring model preference from tenant config
        try:
            db_session = next(get_db())
            tenant = db_session.query(Tenant).filter(Tenant.id == tenant_id).first()
            if (
                tenant
                and tenant.llmConfig
                and dict(tenant.llmConfig).get("provider") != "platform_default"
            ):
                self.scoring_model = dict(tenant.llmConfig).get("scoringModel", "basic")
        except Exception:
            pass  # Already warned above

        # Deterministic config for both stages.
        # max_tokens=16384: reasoning/thinking models (e.g. gemini-2.5-flash) consume
        # thinking tokens within the max_output_tokens budget.  2048 was too small —
        # thinking could exhaust the budget before the actual JSON response was complete.
        self.config = LLMConfig(
            temperature=0.0,  # Deterministic output
            max_tokens=16384,
        )

        logger.info(
            "VerificationAgent initialized",
            max_retries=max_retries,
            scoring_model=self.scoring_model,
        )

    def _accumulate_usage(self, response: LLMResponse) -> None:
        usage = getattr(response, "usage", None)
        if usage:
            self._session_tokens["prompt_tokens"] += usage.get("prompt_tokens", 0)
            self._session_tokens["completion_tokens"] += usage.get("completion_tokens", 0)
            # EPIC-04-02: accumulate Anthropic prompt-cache token counts (setdefault guards
            # against pre-existing VerificationAgent instances without these keys)
            self._session_tokens["cache_read_tokens"] = self._session_tokens.get(
                "cache_read_tokens", 0
            ) + usage.get("cache_read_tokens", 0)
            self._session_tokens["cache_creation_tokens"] = self._session_tokens.get(
                "cache_creation_tokens", 0
            ) + usage.get("cache_creation_tokens", 0)

    @property
    def session_llm_usage(self) -> dict:
        pt = self._session_tokens["prompt_tokens"]
        ct = self._session_tokens["completion_tokens"]
        crt = self._session_tokens.get("cache_read_tokens", 0)
        cct = self._session_tokens.get("cache_creation_tokens", 0)
        # LLM-05: use per-provider cost table; unknown providers default to 0
        rates = _PROVIDER_COSTS.get(self._session_provider, {"input": 0.0, "output": 0.0})
        # EPIC-04-02: cache reads billed at cache_read rate (10% of input for Anthropic)
        cache_read_rate = rates.get("cache_read", rates["input"])
        cost = (
            (pt / 1_000_000) * rates["input"]
            + (ct / 1_000_000) * rates["output"]
            + (crt / 1_000_000) * cache_read_rate
        )
        # cache_hit_rate = reads / (reads + creations); 0 if no cache activity
        total_cache = crt + cct
        cache_hit_rate = round(crt / total_cache, 4) if total_cache > 0 else 0.0
        return {
            "provider": self._session_provider,
            "model": self._session_model,
            "prompt_tokens": pt,
            "completion_tokens": ct,
            "total_tokens": pt + ct,
            "cache_read_tokens": crt,
            "cache_creation_tokens": cct,
            "cache_hit_rate": cache_hit_rate,
            "estimated_cost_usd": round(cost, 6),
        }

    async def generate_documentation(
        self,
        change: EntityChange,
        existing_docs: str = "",
        related_docs: list[SearchResult] | None = None,
    ) -> DocumentationDraft:
        """
        Generate and verify documentation for a code change.

        Args:
            change: The code change to document
            existing_docs: Current documentation (if any)
            related_docs: Related documentation from vector search

        Returns:
            Verified documentation draft
        """
        entity = change.entity

        # Format related docs
        related_docs_text = ""
        if related_docs:
            related_docs_text = "\n\n".join(
                [
                    f"### {r.metadata.get('section_title', 'Section')}\n{r.content}"
                    for r in related_docs[:3]  # Top 3 most relevant
                ]
            )

        # Detect language from file
        language = self._detect_language(entity.file_path)

        # Build generation prompt
        prompt = DRAFT_GENERATION_PROMPT.format(
            entity_name=entity.qualified_name,
            entity_type=entity.entity_type,
            file_path=entity.file_path,
            language=language,
            change_type=change.change_type.value,
            change_details=json.dumps(change.details or {}, indent=2),
            old_code=change.old_content or "# (New entity)",
            new_code=change.new_content or entity.content,
            existing_docs=existing_docs or "(No existing documentation)",
            related_docs=related_docs_text or "(No related documentation found)",
        )

        # Generate with retries
        draft = None
        for attempt in range(1, self.max_retries + 1):
            # Stage 1: Generate
            tenant_id = get_tenant_id()
            _t0 = time.monotonic()
            try:
                response = await self.generator.generate(
                    prompt=prompt,
                    system_prompt=prompt_manager.get_prompt(tenant_id, "GENERATOR_SYSTEM_PROMPT"),
                    config=self.config,
                )
                record_llm_request(
                    self._session_provider, self._session_model, "generate", time.monotonic() - _t0
                )
            except Exception as _exc:
                record_llm_request(
                    self._session_provider,
                    self._session_model,
                    "generate",
                    time.monotonic() - _t0,
                    error_type=type(_exc).__name__,
                )
                raise
            self._accumulate_usage(response)

            # Determine doc path (simple heuristic for now)
            # e.g., src/utils.py -> docs/src/utils.md
            doc_path = f"docs/{entity.file_path.replace('.py', '.md').replace('.ts', '.md').replace('.js', '.md')}"

            draft = DocumentationDraft(
                entity_name=entity.qualified_name,
                file_path=doc_path,
                content=response.content,
                attempts=attempt,
            )

            # Stage 2: Verify
            verification = await self._verify_documentation(
                code=entity.content,
                documentation=response.content,
                language=language,
            )

            draft.verification = verification

            if verification.is_accurate:
                logger.info(
                    "Documentation verified",
                    entity=entity.qualified_name,
                    attempts=attempt,
                )
                return draft

            # Log hallucination and retry
            logger.warning(
                "Hallucination detected, retrying",
                entity=entity.qualified_name,
                attempt=attempt,
                issues=verification.issues,
            )

            # Add feedback for next attempt
            prompt += f"\n\n[Previous attempt had issues: {', '.join(verification.issues)}. Please correct.]"

        # Return last draft even if not fully verified
        logger.warning(
            "Max retries reached, returning best draft",
            entity=entity.qualified_name,
            verified=draft.is_verified if draft else False,
        )

        return draft

    async def _verify_documentation(
        self,
        code: str,
        documentation: str,
        language: str = "python",
    ) -> VerificationResult:
        """
        Verify documentation against code.

        Args:
            code: The actual code
            documentation: Generated documentation
            language: Programming language

        Returns:
            Verification result
        """
        prompt = VERIFICATION_PROMPT.format(
            language=language,
            code=code,
            documentation=documentation,
        )

        tenant_id = get_tenant_id()
        response = await self.verifier.generate(
            prompt=prompt,
            system_prompt=prompt_manager.get_prompt(tenant_id, "VERIFIER_SYSTEM_PROMPT"),
            config=self.config,
        )
        self._accumulate_usage(response)

        # Parse JSON response
        try:
            # Extract JSON from response (may be wrapped in markdown)
            json_text = self._extract_json(response.content)
            data = json.loads(json_text)
            return VerificationResult.from_json(data)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("Failed to parse verification response", error=str(e))
            return VerificationResult(
                verdict="HALLUCINATION",
                confidence=0.5,
                issues=["Could not parse verification response"],
            )

    async def analyze_drift(
        self,
        changes: list[EntityChange],
        doc_status: str = "",
    ) -> DriftAnalysis:
        """
        Analyze overall documentation drift using 2-Stage Deterministic Verification (2SDV).

        If the tenant is configured for the Holistic Scoring Model, this method will:
          - Use DriftScorer.calculate_holistic_score() for the deterministic baseline.
          - Inject the "Holistic Impact Profile" into the LLM proposal prompt to
            leverage Directory Weights and Blast Radius context for richer reasoning.
        """
        if not changes:
            return DriftAnalysis(0, "none", [], False, "No changes detected")

        # SCALE-01: Fast Path — skip LLM entirely for purely cosmetic diffs
        # Cosmetic changes (whitespace/formatting) score 0 and never require doc updates.
        # Bypassing the LLM here cuts latency and token usage for the common case.
        if all(c.change_type == ChangeType.COSMETIC for c in changes):
            logger.info(
                "SCALE-01 Fast Path: all changes cosmetic, skipping LLM",
                change_count=len(changes),
            )
            return DriftAnalysis(
                0,
                "none",
                [],
                False,
                "Fast path: only formatting/whitespace changes detected — no documentation update required.",
            )

        # 1. Deterministic Baseline (Standard or Holistic)
        use_holistic = self.scoring_model == "holistic"
        if use_holistic:
            calculated_score = DriftScorer.calculate_holistic_score(changes)
            logger.info("Using Holistic Scoring Model (v3.0)", score=calculated_score)
        else:
            calculated_score = DriftScorer.calculate_score(changes)
            logger.info("Using Standard Scoring Model (v2.1)", score=calculated_score)

        # 2. Stage 1: Proposal (Generator)
        changes_summary = "\n".join(
            [
                f"- {c.entity.qualified_name} ({c.entity.entity_type}, public={c.entity.is_public}): {c.change_type.value}"
                for c in changes
            ]
        )
        affected_files = list(set(c.entity.file_path for c in changes))

        # Build the optional Holistic Impact Profile block for the LLM
        holistic_context_block = ""
        if use_holistic:
            kern_lines = []
            for c in changes:
                tier = (
                    "Kernel"
                    if c.directory_weight >= 2.0
                    else ("Leaf" if c.directory_weight <= 0.5 else "Feature")
                )
                kern_lines.append(
                    f"  - `{c.entity.qualified_name}` in `{c.entity.file_path}`: "
                    f"**{tier} tier** (weight={c.directory_weight}x), "
                    f"referenced by **{c.blast_radius} file(s)** across the repo."
                )
            holistic_context_block = (
                "\n\n### Holistic Impact Profile (Architectural Context)\n"
                "The following Kern context was extracted from the repository AST. "
                "Use it to assess true architectural severity beyond the raw diff:\n"
                + "\n".join(kern_lines)
            )

        # Map tone to instructions
        tone_map = {
            "Friendly": "Adopt an encouraging and emoji-rich style. Be slightly lenient but accurate.",
            "Detailed": "Be extremely thorough and educational. Explain WHY the score is what it is in depth.",
            "Strict": "Be concise and strictly factual. Focus only on the most critical impact.",
        }
        tone_instructions = tone_map.get(self.tone, tone_map["Strict"])

        proposal_prompt = DRIFT_PROPOSAL_PROMPT.format(
            calculated_score=calculated_score,
            changes_summary=changes_summary + holistic_context_block,
            affected_files="\n".join(f"- {f}" for f in affected_files),
            doc_status=doc_status or "(Unknown)",
            tone_instructions=tone_instructions,
        )

        tenant_id = get_tenant_id()
        # LLM-06: Rate limit check before each LLM call
        await check_llm_rate_limit(tenant_id)
        _t0 = time.monotonic()
        try:
            proposal_response = await self.generator.generate(
                prompt=proposal_prompt,
                system_prompt=prompt_manager.get_prompt(tenant_id, "DRIFT_ANALYSIS_SYSTEM_PROMPT"),
                config=self.config,
            )
            record_llm_request(
                self._session_provider,
                self._session_model,
                "drift_proposal",
                time.monotonic() - _t0,
            )
        except Exception as _exc:
            record_llm_request(
                self._session_provider,
                self._session_model,
                "drift_proposal",
                time.monotonic() - _t0,
                error_type=type(_exc).__name__,
            )
            raise
        self._accumulate_usage(proposal_response)

        proposal_data = {
            "summary": "(Unable to generate summary)",
            "required_updates": [],
            "nuance_adjustment": 0,
        }
        try:
            extracted = self._extract_json(proposal_response.content)
            if extracted:
                proposal_data.update(json.loads(extracted))
        except (json.JSONDecodeError, ValueError):
            logger.warning("Failed to parse drift proposal", content=proposal_response.content)

        # SCR-01: Guard against a None score (defensive — DriftScorer is typed as int
        # but external callers may pass unexpected changes; log loudly so it's noticed).
        if calculated_score is None:
            logger.warning(
                "SCR-01: drift_score is None after calculation — defaulting to 50. "
                "Check DriftScorer.calculate_score() for unexpected input.",
                changes_count=len(changes),
            )
            calculated_score = 50

        # SCR-02: Narrative conflict detection.
        # If the LLM summary claims "no issues" / "up to date" but the deterministic
        # score is high (≥ 40), the narrative contradicts the math. Log a warning so
        # on-call can investigate whether the prompt is hallucinating optimism.
        _NO_ISSUE_PATTERNS = (
            "no issues",
            "no documentation",
            "no changes needed",
            "no drift",
            "no update",
            "documentation is current",
            "up to date",
            "no action required",
            "already documented",
        )
        _summary_lower = str(proposal_data.get("summary", "")).lower()
        if any(p in _summary_lower for p in _NO_ISSUE_PATTERNS) and calculated_score >= 40:
            logger.warning(
                "SCR-02: Narrative conflict — LLM summary suggests no issues "
                "but drift score is elevated. Possible LLM optimism bias.",
                drift_score=calculated_score,
                summary_excerpt=_summary_lower[:120],
            )

        # Force strict determinism: LLMs explain the math, but they do NOT alter it.
        proposed_score = calculated_score

        # 3. Stage 2: Verification (Auditor)
        # Prepare diff summary for audit
        diff_summary = "\n".join(
            [
                f"--- {c.entity.file_path} ---\n{c.new_content or c.entity.content}"
                for c in changes[:5]  # Limit context
            ]
        )

        verification_prompt = DRIFT_VERIFICATION_PROMPT.format(
            diff_summary=diff_summary,
            proposed_score=proposed_score,
            proposed_analysis=proposal_response.content,
        )

        verification_response = await self.verifier.generate(
            prompt=verification_prompt,
            system_prompt="You are a strict auditor verifying drift analysis accuracy.",
            config=self.config,
        )
        self._accumulate_usage(verification_response)

        final_score = proposed_score
        confidence_score: float = 1.0  # default: high confidence
        try:
            extracted_verification = self._extract_json(verification_response.content)
            if extracted_verification:
                verification_data = json.loads(extracted_verification)
                if verification_data.get("verdict") == "DISSENT":
                    logger.warning(
                        "Drift verification dissent on text, but score remains deterministic",
                        score=final_score,
                        issues=verification_data.get("issues"),
                    )
                # SCALE-05: read verifier confidence (0.0–1.0); absent → 1.0
                raw_conf = verification_data.get("confidence")
                if raw_conf is not None:
                    try:
                        confidence_score = max(0.0, min(1.0, float(raw_conf)))
                    except (TypeError, ValueError):
                        pass
        except (json.JSONDecodeError, ValueError):
            pass

        # Final Alignment: Ensure the summary doesn't contradict the final_score
        summary = str(proposal_data.get("summary", "Analysis complete"))

        # Regex to replace "X/100" with "FinalScore/100"
        summary = re.sub(r"\d+/100", f"{int(final_score)}/100", summary)

        # Ensure the summary mentions the score or provide a standard preamble
        score_pattern = rf"{int(final_score)}\s*/\s*100"
        has_score = re.search(score_pattern, summary)

        preamble = f"The documentation drift is scored at {int(final_score)}/100 because"
        # If it doesn't have the score AND doesn't look like it started with reasoning or persona
        is_reasoning_start = any(
            summary.lower().startswith(x)
            for x in ["why:", "reasoning:", "because", "the documentation drift"]
        )
        is_persona_start = any(
            summary.lower().startswith(x) for x in ["arrr", "ahoy", "matey", "yo-ho", "welcome"]
        )

        if not has_score and not is_reasoning_start and not is_persona_start:
            summary = f"{preamble} {summary.lstrip()}"

        # Determine initial block_merge from score
        block_merge = final_score >= 60

        # SCALE-05: Grace Mode — lift merge block when verifier is not confident.
        # Low confidence means the LLM was uncertain; we warn but never gate CI.
        if block_merge and confidence_score < _GRACE_THRESHOLD:
            block_merge = False
            grace_note = (
                f" (Grace mode: merge block lifted — verifier confidence "
                f"{confidence_score:.0%} is below threshold.)"
            )
            summary = summary + grace_note
            logger.info(
                "SCALE-05 Grace Mode: merge block lifted due to low confidence",
                confidence=confidence_score,
                drift_score=final_score,
            )

        return DriftAnalysis(
            drift_score=int(final_score),
            severity=DriftScorer.get_severity(int(final_score)),
            required_updates=proposal_data.get("required_updates", []),
            block_merge=block_merge,
            summary=summary,
            confidence_score=confidence_score,
        )

    def _detect_language(self, file_path: str) -> str:
        """Detect programming language from file path."""
        if file_path.endswith(".py"):
            return "python"
        elif file_path.endswith((".js", ".jsx")):
            return "javascript"
        elif file_path.endswith((".ts", ".tsx")):
            return "typescript"
        return "text"

    def _extract_json(self, text: str) -> str:
        """Extract JSON from text that may contain markdown."""
        import re

        # 1. Try to find JSON in code block
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if match:
            return match.group(1).strip()

        # 2. Find anything between the first { and the last }
        # This handles nested objects better than the simple regex
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start : end + 1]

        return text.strip()
