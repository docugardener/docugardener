# SPDX-License-Identifier: AGPL-3.0-or-later
"""
PR analysis orchestrator.

Coordinates the full DocuGardener analysis pipeline:
1. Clone repository (ephemeral)
2. Parse changed files
3. Compute semantic diffs
4. Search related documentation
5. Generate and verify doc updates
6. Post results to GitHub
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import pathspec

from src.agents.llm import LLMProvider, create_llm_client
from src.agents.verifier import (
    DocumentationDraft,
    DriftAnalysis,
    VerificationAgent,
)
from src.analysis.diff import EntityChange, SemanticDiff
from src.analysis.parser import get_parser
from src.analysis.scorer import DriftScorer
from src.core.config import settings
from src.core.logging import get_logger
from src.github.clone import ephemeral_clone
from src.monitoring.metrics import record_cross_repo
from src.storage.factory import get_db_manager
from src.storage.indexer import DocumentIndexer, _repo_sub_namespace

logger = get_logger(__name__)


@dataclass
class FileChange:
    """
    Represents a changed file in a PR.

    Attributes:
        path: File path relative to repo root
        status: Change status (added, modified, removed)
        additions: Lines added
        deletions: Lines deleted
        patch: Unified diff patch
    """

    path: str
    status: str
    additions: int = 0
    deletions: int = 0
    patch: str | None = None


@dataclass
class PRAnalysisResult:
    """
    Result of analyzing a Pull Request.

    Attributes:
        pr_number: PR number
        repo_full_name: Full repository name (owner/repo)
        drift_analysis: Overall drift analysis
        documentation_updates: Generated doc updates
        entity_changes: Detected code changes
        processing_time_ms: Time taken to process
        error: Error message if failed
        policy_violations: DOCPOL-01 policy rule violations
        policy_blocks_merge: True when any blocking policy violation exists
    """

    pr_number: int
    repo_full_name: str
    drift_analysis: DriftAnalysis | None = None
    documentation_updates: list[DocumentationDraft] = field(default_factory=list)
    entity_changes: list[EntityChange] = field(default_factory=list)
    processing_time_ms: int = 0
    llm_usage: dict | None = None
    error: str | None = None
    policy_violations: list = field(default_factory=list)  # list[PolicyViolation]
    policy_blocks_merge: bool = False
    # EPIC-11: cross-repo impact findings (empty when disabled or no findings)
    cross_repo_findings: list[dict] = field(default_factory=list)

    @property
    def success(self) -> bool:
        """Check if analysis completed successfully."""
        return self.error is None

    @property
    def should_block(self) -> bool:
        """Check if PR should be blocked based on drift or policy."""
        if self.policy_blocks_merge:
            return True
        if self.drift_analysis is None:
            return False
        return self.drift_analysis.block_merge

    @property
    def drift_score(self) -> int:
        """Get the drift score."""
        if self.drift_analysis is None:
            return 0
        return self.drift_analysis.drift_score


def _build_cross_repo_diff_summary(changes: list[EntityChange]) -> str:
    """
    EPIC-11: Build a rich diff summary for the cross-repo LLM prompt.

    Includes old→new symbol names and signatures so the LLM understands
    what specifically changed, not just that something changed.

    Args:
        changes: Meaningful entity changes (already filtered by caller).

    Returns:
        Multi-line string describing the top-3 most impactful changes.
    """
    lines = []
    for ch in changes[:3]:
        ctx = ch.extra_context if isinstance(ch.extra_context, dict) else {}
        old_name = ctx.get("old_name") or ch.entity.qualified_name
        new_name = ctx.get("new_name") or ch.entity.qualified_name
        old_sig = ctx.get("old_signature", "")
        new_sig = ctx.get("new_signature", "")

        line = (
            f"- {ch.change_type.value}: `{old_name}`"
            + (f" → `{new_name}`" if new_name != old_name else "")
            + (f"  (was: {old_sig})" if old_sig else "")
            + (f"  (now: {new_sig})" if new_sig else "")
            + f"  in {ch.entity.file_path}"
        )
        lines.append(line)

    return "\n".join(lines)


class PRAnalyzer:
    """
    Orchestrates the full PR analysis pipeline.

    Integrates all DocuGardener components to analyze
    Pull Requests and generate documentation feedback.
    """

    def __init__(
        self,
        verifier: VerificationAgent | None = None,
    ):
        """
        Initialize the analyzer.

        Args:
            verifier: Verification agent (created if not provided)
        """
        self.verifier = verifier
        self.parser = get_parser()
        self.diff = SemanticDiff(self.parser)

        logger.info("PRAnalyzer initialized")

    async def analyze_pr(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        base_sha: str,
        head_sha: str,
        changed_files: list[FileChange],
        installation_token: str,
        tenant_id: str,
        base_ref: str | None = None,
        llm_config: dict | None = None,
        repo_db_id: str | None = None,
        workflow_config: dict | None = None,
        plan: str = "FREE",
    ) -> PRAnalysisResult:
        """
        Analyze a Pull Request for documentation drift.

        Args:
            owner: Repository owner
            repo: Repository name
            pr_number: PR number
            base_sha: Base branch SHA
            head_sha: Head branch SHA
            changed_files: List of changed files
            installation_token: GitHub installation token
            tenant_id: Tenant Identifier (for isolation)
            base_ref: Base reference (branch name)
            llm_config: Optional LLM configuration override
            workflow_config: Tenant workflow configuration (cross_repo_siblings etc.)
            plan: Tenant plan ("FREE" | "PRO" | "TEAM" | "ENTERPRISE") — controls
                  cross-repo tier limits. Defaults to "FREE" (cross-repo disabled).

        Returns:
            Analysis result
        """
        start_time = datetime.utcnow()
        repo_full_name = f"{owner}/{repo}"

        # In Multi-Tenant mode, the "namespace" for Weaviate is the tenant_id.
        # We also pass repo_id or similar to filter within the tenant if needed,
        # but for isolation, tenant_id is the primary key.
        namespace = tenant_id

        logger.info(
            "Starting PR analysis",
            repo=repo_full_name,
            pr=pr_number,
            files=len(changed_files),
            tenant=tenant_id,
        )

        result = PRAnalysisResult(
            pr_number=pr_number,
            repo_full_name=repo_full_name,
        )

        try:
            # Filter to supported code files
            code_files = [
                f for f in changed_files if self.parser.detect_language(f.path) is not None
            ]

            if not code_files:
                logger.info("No supported code files changed", pr=pr_number)
                result.drift_analysis = DriftAnalysis(
                    drift_score=0,
                    severity="none",
                    required_updates=[],
                    block_merge=False,
                    summary="No supported code files changed",
                )
                return result

            # Clone repository ephemerally
            clone_url = f"https://github.com/{owner}/{repo}.git"

            async with ephemeral_clone(
                clone_url=clone_url, access_token=installation_token, ref=head_sha
            ) as repo_path:
                # Apply .dgignore filtering
                final_files = code_files
                dgignore_path = repo_path / ".dgignore"

                if dgignore_path.exists():
                    try:
                        with open(dgignore_path) as f:
                            ignore_spec = pathspec.PathSpec.from_lines("gitwildmatch", f)

                        final_files = []
                        for file_change in code_files:
                            if ignore_spec.match_file(file_change.path):
                                logger.info(
                                    "Ignoring file based on .dgignore", file=file_change.path
                                )
                            else:
                                final_files.append(file_change)

                        logger.info(
                            "Applied .dgignore", original=len(code_files), filtered=len(final_files)
                        )
                    except Exception as e:
                        logger.warning("Failed to process .dgignore", error=str(e))

                # Analyze changes
                all_changes = await self._analyze_file_changes(
                    repo_path=repo_path,
                    base_sha=base_sha,
                    changed_files=final_files,
                    base_ref=base_ref,
                )

                # --- AST Context Builder (Holistic Scoring Kern) ---
                # Annotate every change with its Directory Weight + Blast Radius.
                # Done once per change, fast: bounded git grep on the ephemeral clone.
                for ch in all_changes:
                    ch.directory_weight = DriftScorer.get_directory_weight(ch.entity.file_path)
                    ch.blast_radius = await self._estimate_blast_radius(
                        repo_path=repo_path,
                        entity_name=ch.entity.name,
                    )
                    logger.debug(
                        "Kern context computed",
                        entity=ch.entity.qualified_name,
                        dir_weight=ch.directory_weight,
                        blast_radius=ch.blast_radius,
                    )

                result.entity_changes = all_changes

                # Filter to meaningful changes
                meaningful_changes = self.diff.filter_meaningful_changes(all_changes)

                if not meaningful_changes:
                    result.drift_analysis = DriftAnalysis(
                        drift_score=0,
                        severity="none",
                        required_updates=[],
                        block_merge=False,
                        summary="Only cosmetic code changes detected",
                    )
                    return result

                # Initialize verifier lazily with custom config if provided
                if self.verifier is None:
                    client = None
                    if llm_config:
                        provider_str = llm_config.get("provider")
                        if provider_str:
                            try:
                                provider = LLMProvider(provider_str)
                                # DB format stores per-provider values under nested keys:
                                # keys.{provider}, models.{provider}, baseUrls.{provider}
                                # Flat keys (apiKey/baseUrl/modelName) are legacy fallbacks.
                                api_key = (llm_config.get("keys") or {}).get(
                                    provider_str
                                ) or llm_config.get("apiKey")
                                url = (llm_config.get("baseUrls") or {}).get(
                                    provider_str
                                ) or llm_config.get("baseUrl")
                                model = (llm_config.get("models") or {}).get(
                                    provider_str
                                ) or llm_config.get("modelName")
                                client = create_llm_client(
                                    provider=provider, api_key=api_key, url=url, model=model
                                )
                                logger.info("Initialized custom LLM client", provider=provider_str)
                            except Exception as e:
                                logger.warning(
                                    "Failed to create custom LLM client, falling back", error=str(e)
                                )

                    self.verifier = VerificationAgent(
                        generator_client=client,
                        tone=llm_config.get("promptTone", "Strict") if llm_config else "Strict",
                    )

                # Analyze drift severity
                result.drift_analysis = await self.verifier.analyze_drift(
                    changes=meaningful_changes,
                )

                # Generate documentation updates whenever drift is detected.
                # The drift_score_threshold is used for blocking PRs, not for
                # deciding whether to generate docs — those are independent concerns.
                if meaningful_changes:
                    # Get vector DB for related docs
                    async with get_db_manager() as db:
                        indexer = DocumentIndexer(db)

                        # BUG-5: index repo into Weaviate on first analysis so that
                        # find_related_docs() below actually returns context for the LLM.
                        if repo_db_id:
                            from src.pipeline.job_manager import job_manager as _jm

                            if _jm.get_repo_last_indexed_at(repo_db_id) is None:
                                try:
                                    # Always index into tenant_id — keeps find_related_docs working.
                                    await indexer.index_repository(
                                        repo_path, owner, repo, namespace=tenant_id
                                    )
                                    # EPIC-11: additionally index into sub-namespace for cross-repo
                                    # fan-out when the feature is active for this tenant.
                                    if (
                                        settings.cross_repo_beta
                                        and workflow_config
                                        and workflow_config.get("cross_repo_siblings")
                                    ):
                                        from src.storage.indexer import _repo_sub_namespace

                                        sub_ns = _repo_sub_namespace(tenant_id, f"{owner}/{repo}")
                                        await indexer.index_repository(
                                            repo_path, owner, repo, namespace=sub_ns
                                        )
                                        logger.info(
                                            "EPIC-11: dual-indexed into sub-namespace",
                                            sub_ns=sub_ns,
                                        )
                                    _jm.stamp_repo_indexed(repo_db_id)
                                    logger.info(
                                        "BUG-5: repository indexed into Weaviate",
                                        repo=f"{owner}/{repo}",
                                        tenant=tenant_id,
                                    )
                                except Exception as _idx_exc:
                                    logger.warning(
                                        "BUG-5: indexing failed (non-fatal, continuing without RAG context)",
                                        error=str(_idx_exc),
                                    )

                        # Doc-update loop (existing RAG path — always uses namespace=tenant_id)
                        async def _doc_update_loop() -> list:
                            updates = []
                            for change in meaningful_changes[:5]:  # Limit to top 5
                                related_docs = await indexer.find_related_docs(
                                    entity=change.entity,
                                    namespace=namespace,
                                )
                                draft = await self.verifier.generate_documentation(
                                    change=change,
                                    related_docs=related_docs,
                                    repo_path=repo_path,
                                )
                                if draft.is_verified:
                                    updates.append(draft)
                            return updates

                        # EPIC-11: cross-repo pass (parallel with doc-update loop).
                        # Gate on the global kill switch here; _find_cross_repo_context
                        # handles plan-tier limits and empty-sibling short-circuit.
                        sibling_repos: list[str] = (
                            (workflow_config or {}).get("cross_repo_siblings", [])
                            if settings.cross_repo_beta
                            else []
                        )

                        async def _cross_repo_pass() -> list[dict]:
                            return await self._find_cross_repo_context(
                                meaningful_changes=meaningful_changes,
                                tenant_id=tenant_id,
                                sibling_repos=sibling_repos,
                                plan=plan,
                            )

                        doc_task = asyncio.create_task(_doc_update_loop())
                        cross_task = asyncio.create_task(_cross_repo_pass())
                        gathered = await asyncio.gather(
                            doc_task, cross_task, return_exceptions=True
                        )

                        doc_result = gathered[0]
                        cross_result = gathered[1]

                        if isinstance(doc_result, Exception):
                            logger.warning("doc_update_loop failed", error=str(doc_result))
                        else:
                            result.documentation_updates = doc_result

                        if isinstance(cross_result, Exception):
                            logger.warning(
                                "cross_repo_pass failed (non-fatal)", error=str(cross_result)
                            )
                        else:
                            result.cross_repo_findings = cross_result

            # Calculate processing time
            processing_time = datetime.utcnow() - start_time
            result.processing_time_ms = int(processing_time.total_seconds() * 1000)
            result.llm_usage = self.verifier.session_llm_usage

            logger.info(
                "PR analysis complete",
                pr=pr_number,
                drift_score=result.drift_score,
                updates=len(result.documentation_updates),
                time_ms=result.processing_time_ms,
            )

        except Exception as e:
            logger.error("PR analysis failed", pr=pr_number, error=str(e))
            result.error = str(e)

        return result

    async def _find_cross_repo_context(
        self,
        meaningful_changes: list[EntityChange],
        tenant_id: str,
        sibling_repos: list[str],
        plan: str,
    ) -> list[dict]:
        """
        EPIC-11: Orchestrate the cross-repo retrieval + LLM analysis pass.

        Plan-tier limits (enforced here — not in the LLM call):
          FREE / PRO: disabled (returns [])
          TEAM:       max 3 siblings, top_k_per_ns=3, min_confidence=60
          ENTERPRISE: max 10 siblings, top_k_per_ns=5, min_confidence=50

        Args:
            meaningful_changes: Changes already filtered to relevant ones.
            tenant_id:          Calling tenant ID (for sub-namespace construction).
            sibling_repos:      List of "owner/repo" strings from workflowConfig.
            plan:               Tenant plan string.

        Returns:
            List of cross-repo finding dicts (empty when disabled or nothing found).
        """
        import time

        if not sibling_repos:
            return []

        # Plan-tier gate
        plan_upper = (plan or "FREE").upper()
        if plan_upper == "TEAM":
            max_siblings, top_k_per_ns, min_confidence = 3, 3, 60
        elif plan_upper == "ENTERPRISE":
            max_siblings, top_k_per_ns, min_confidence = 10, 5, 50
        else:
            return []  # FREE and PRO: disabled

        capped_siblings = sibling_repos[:max_siblings]
        sibling_namespaces = [_repo_sub_namespace(tenant_id, r) for r in capped_siblings]

        t_start = time.monotonic()
        try:
            async with get_db_manager() as db:
                indexer = DocumentIndexer(db)

                # Retrieve sibling docs for all meaningful changes
                all_chunks: list[dict] = []
                seen_ids: set[str] = set()
                for change in meaningful_changes[:3]:
                    results = await indexer.find_cross_repo_docs(
                        entity=change.entity,
                        sibling_namespaces=sibling_namespaces,
                        top_k_per_ns=top_k_per_ns,
                    )
                    for r in results:
                        if r.id not in seen_ids:
                            seen_ids.add(r.id)
                            all_chunks.append(
                                {
                                    "repo": r.metadata.get("repo", ""),
                                    "file": r.metadata.get("file_path", ""),
                                    "content": r.content or "",
                                    "source_namespace": r.metadata.get("source_namespace", ""),
                                }
                            )

            if not all_chunks:
                record_cross_repo("empty", 0, time.monotonic() - t_start)
                return []

            diff_summary = _build_cross_repo_diff_summary(meaningful_changes)
            findings = await self.verifier.analyze_cross_repo_impact(
                diff_summary=diff_summary,
                sibling_chunks=all_chunks,
                min_confidence=min_confidence,
                max_findings=5,
            )

            # Enrich findings with source_namespace for display
            ns_by_repo_file = {(c["repo"], c["file"]): c["source_namespace"] for c in all_chunks}
            for f in findings:
                f.setdefault(
                    "source_namespace",
                    ns_by_repo_file.get((f.get("repo", ""), f.get("file", "")), ""),
                )

            latency = time.monotonic() - t_start
            record_cross_repo(
                "ok" if findings else "empty",
                len(findings),
                latency,
            )
            logger.info(
                "EPIC-11: cross-repo analysis complete",
                findings=len(findings),
                latency_ms=int(latency * 1000),
            )
            return findings

        except Exception:
            record_cross_repo("error", 0, time.monotonic() - t_start)
            raise

    async def analyze_local(
        self,
        repo_path: Path,
        changed_files: list[str] | None = None,
    ) -> PRAnalysisResult:
        """
        Analyze local changes (Working Tree vs HEAD) for documentation drift.

        Args:
            repo_path: Path to local repository
            changed_files: Optional list of files to check (if None, checking all modified)

        Returns:
            Analysis result
        """
        start_time = datetime.utcnow()
        repo_name = repo_path.name

        logger.info("Starting Local Analysis", repo=repo_name)

        result = PRAnalysisResult(
            pr_number=0,  # 0 indicates local/CLI
            repo_full_name=f"local/{repo_name}",
        )

        try:
            import git

            repo = git.Repo(str(repo_path))

            # Identify changed files if not provided
            if changed_files is None:
                # Get modified and staged files
                changed_files = [item.a_path for item in repo.index.diff(None)]  # Modified
                changed_files.extend([item.a_path for item in repo.index.diff("HEAD")])  # Staged
                changed_files = list(set(changed_files))

            # Filter to supported code files
            code_files = [f for f in changed_files if self.parser.detect_language(f) is not None]

            if not code_files:
                logger.info("No supported code files changed locally")
                return result

            # Analyze changes
            all_changes = []

            for file_rel_path in code_files:
                file_path = repo_path / file_rel_path

                # New content (Working Tree)
                if file_path.exists():
                    content = file_path.read_text(encoding="utf-8")
                    new_entities = self.parser.parse_content(
                        content=content,
                        file_path=file_rel_path,
                        language=self.parser.detect_language(file_rel_path),
                    )
                else:
                    new_entities = []  # Deleted file

                # Old content (HEAD)
                old_entities = []
                try:
                    old_content = repo.git.show(f"HEAD:{file_rel_path}")
                    old_entities = self.parser.parse_content(
                        content=old_content,
                        file_path=file_rel_path,
                        language=self.parser.detect_language(file_rel_path),
                    )
                except git.GitCommandError:
                    logger.warning("Could not fetch HEAD content", file=file_rel_path)

                # Compare
                file_changes = self.diff.compare_entities(old_entities, new_entities)
                all_changes.extend(file_changes)

            result.entity_changes = all_changes
            meaningful_changes = self.diff.filter_meaningful_changes(all_changes)

            if not meaningful_changes:
                return result

            # Initialize verifier lazily
            if self.verifier is None:
                self.verifier = VerificationAgent()

            # Analyze drift
            result.drift_analysis = await self.verifier.analyze_drift(
                changes=meaningful_changes, doc_status="(Local Check)"
            )

            # Generate updates locally whenever drift is detected.
            if meaningful_changes:
                # In local mode, we might skip RAG context if vector DB isn't reachable
                # But we attempt it if configured.
                pass  # For CLI MVP, we skip VectorDB lookup to keep it lightweight/offline?
                # OR we can assume RAG is only for the online bot.
                # Let's verify without RAG documentation context for now (pass empty list)

                for change in meaningful_changes[:5]:
                    draft = await self.verifier.generate_documentation(
                        change=change,
                        related_docs=[],  # No RAG in local CLI for now
                        repo_path=repo_path,  # EPIC-13: enrich with local context
                    )
                    if draft.is_verified:
                        result.documentation_updates.append(draft)

            # Timing
            processing_time = datetime.utcnow() - start_time
            result.processing_time_ms = int(processing_time.total_seconds() * 1000)

        except Exception as e:
            logger.error("Local analysis failed", error=str(e))
            result.error = str(e)

        return result

    async def _process_one_file(
        self,
        repo_path: Path,
        base_sha: str,
        file_change: FileChange,
        semaphore: asyncio.Semaphore,
        base_ref: str | None = None,
    ) -> list[EntityChange]:
        """Process a single file change within the concurrency semaphore.

        Each invocation opens its own git.Repo handle to avoid sharing mutable
        GitPython state across threads (asyncio.to_thread uses a thread pool).
        All blocking git and filesystem calls are dispatched via asyncio.to_thread
        so the event loop remains unblocked.
        """
        import git

        async with semaphore:
            file_path = repo_path / file_change.path

            # ── Read new (head) version ───────────────────────────────────────
            new_entities = []
            file_exists = await asyncio.to_thread(file_path.exists)
            if file_exists:
                try:
                    content = await asyncio.to_thread(file_path.read_text, encoding="utf-8")
                    language = self.parser.detect_language(file_change.path)
                    if language:
                        new_entities = self.parser.parse_content(
                            content=content, file_path=file_change.path, language=language
                        )
                except Exception as e:
                    logger.warning(
                        "Failed to parse new content", file=file_change.path, error=str(e)
                    )

            # ── Read base (old) version via git ───────────────────────────────
            old_entities = []
            # Open a per-task Repo handle — cheap (no network) and thread-safe.
            repo = await asyncio.to_thread(git.Repo, str(repo_path))

            logger.info("Processing file change", file=file_change.path, status=file_change.status)

            try:
                logger.info(
                    "Attempting to fetch base version", base_sha=base_sha, file=file_change.path
                )
                try:
                    await asyncio.to_thread(repo.git.rev_parse, base_sha)
                except git.GitCommandError:
                    logger.info("Base SHA not found locally, fetching", base_sha=base_sha)
                    await asyncio.to_thread(repo.git.fetch, "origin", base_sha, depth=1)

                old_content = await asyncio.to_thread(
                    repo.git.show, f"{base_sha}:{file_change.path}"
                )
                logger.info(
                    "Successfully fetched base content",
                    file=file_change.path,
                    size=len(old_content),
                )
                old_entities = self.parser.parse_content(
                    content=old_content,
                    file_path=file_change.path,
                    language=self.parser.detect_language(file_change.path),
                )
            except git.GitCommandError as ge:
                # Fallback: Try base_ref (e.g. main) if base_sha was stale
                if base_ref:
                    try:
                        logger.info("Base SHA failed, trying base_ref fallback", ref=base_ref)
                        await asyncio.to_thread(repo.git.fetch, "origin", base_ref, depth=1)
                        old_content = await asyncio.to_thread(
                            repo.git.show, f"origin/{base_ref}:{file_change.path}"
                        )
                        old_entities = self.parser.parse_content(
                            content=old_content,
                            file_path=file_change.path,
                            language=self.parser.detect_language(file_change.path),
                        )
                        logger.info("Fallback to base_ref succeeded")
                    except Exception as e2:
                        logger.warning("Fallback failed", error=str(e2))

                if not old_entities:
                    logger.error(
                        "Base version fetch failed (GitError)",
                        file=file_change.path,
                        base_sha=base_sha,
                        error=str(ge),
                    )
            except Exception as e:
                logger.error(
                    "Base version fetch failed (General)", file=file_change.path, error=str(e)
                )

            # ── Semantic diff ─────────────────────────────────────────────────
            file_changes = self.diff.compare_entities(old_entities, new_entities)
            for ch in file_changes:
                logger.info(
                    "Detected entity change",
                    entity=ch.entity.qualified_name,
                    type=ch.change_type.value,
                    meaningful=ch.is_meaningful,
                    requires_docs=ch.requires_doc_update,
                )
            return file_changes

    async def _analyze_file_changes(
        self,
        repo_path: Path,
        base_sha: str,
        changed_files: list[FileChange],
        base_ref: str | None = None,
    ) -> list[EntityChange]:
        """Analyze changes in modified files — files processed concurrently.

        EPIC-09: Each file is processed in a separate coroutine dispatched via
        asyncio.gather(). A Semaphore caps concurrent git I/O at
        settings.max_concurrent_file_workers (default 5) to avoid overwhelming
        the thread pool or git subprocess limit.

        Order of returned EntityChanges mirrors the order of changed_files so
        that callers remain deterministic.
        """
        if not changed_files:
            return []

        semaphore = asyncio.Semaphore(settings.max_concurrent_file_workers)
        tasks = [
            self._process_one_file(
                repo_path=repo_path,
                base_sha=base_sha,
                file_change=fc,
                semaphore=semaphore,
                base_ref=base_ref,
            )
            for fc in changed_files
        ]

        # return_exceptions=True: a single file failure does not cancel siblings.
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_changes: list[EntityChange] = []
        for fc, result in zip(changed_files, results):
            if isinstance(result, BaseException):
                logger.error(
                    "File processing task failed unexpectedly",
                    file=fc.path,
                    error=str(result),
                )
            else:
                all_changes.extend(result)

        return all_changes

    async def _estimate_blast_radius(self, repo_path: "Path", entity_name: str) -> int:
        """
        Estimate how many files in the repository import or reference the given entity.

        Uses a fast, bounded `git grep` on the already-cloned ephemeral repo
        so no extra network calls are made. This is O(files) but runs in
        milliseconds on typical repo sizes (<50k files).

        Args:
            repo_path: Path to the ephemeral repository clone.
            entity_name: The entity name to search for cross-file references.

        Returns:
            Number of unique files that reference this entity (blast radius).
        """
        import asyncio

        if not entity_name or len(entity_name) < 3:  # Avoid noise for very short names
            return 0
        try:
            proc = await asyncio.create_subprocess_exec(
                "git",
                "grep",
                "-l",
                "--word-regexp",
                entity_name,
                cwd=str(repo_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10.0)
            if not stdout:
                return 0
            lines = [l for l in stdout.decode().splitlines() if l.strip()]
            return len(lines)
        except (TimeoutError, FileNotFoundError, OSError):
            logger.warning("Blast radius estimation failed", entity=entity_name)
            return 0
