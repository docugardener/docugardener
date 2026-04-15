"""Unit tests for the RAG verification agent."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.llm import (
    LLMConfig,
    LLMResponse,
)
from src.agents.verifier import (
    DocumentationDraft,
    DriftAnalysis,
    VerificationAgent,
    VerificationResult,
)
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity


class TestLLMConfig:
    """Tests for LLM configuration."""

    def test_default_temperature_zero(self):
        """Test that default temperature is 0 for determinism."""
        config = LLMConfig()
        assert config.temperature == 0.0

    def test_default_max_tokens(self):
        """Test default max tokens."""
        config = LLMConfig()
        assert config.max_tokens == 2048

    def test_custom_config(self):
        """Test custom configuration."""
        config = LLMConfig(
            temperature=0.5,
            max_tokens=1000,
            top_p=0.9,
            stop_sequences=["END"],
        )

        assert config.temperature == 0.5
        assert config.max_tokens == 1000
        assert config.stop_sequences == ["END"]


class TestLLMResponse:
    """Tests for LLM response dataclass."""

    def test_create_response(self):
        """Test creating an LLM response."""
        response = LLMResponse(
            content="Generated text",
            model="gemini-2.0-flash",
            finish_reason="stop",
        )

        assert response.content == "Generated text"
        assert response.model == "gemini-2.0-flash"
        assert response.finish_reason == "stop"

    def test_response_with_usage(self):
        """Test response with token usage."""
        response = LLMResponse(
            content="Text",
            model="model",
            usage={"prompt_tokens": 100, "completion_tokens": 50},
        )

        assert response.usage["prompt_tokens"] == 100
        assert response.usage["completion_tokens"] == 50


class TestVerificationResult:
    """Tests for verification result."""

    def test_accurate_result(self):
        """Test creating an accurate verification result."""
        result = VerificationResult(
            verdict="ACCURATE",
            confidence=0.95,
            issues=[],
            suggestions=["Consider adding example"],
        )

        assert result.is_accurate
        assert result.confidence == 0.95

    def test_hallucination_result(self):
        """Test creating a hallucination result."""
        result = VerificationResult(
            verdict="HALLUCINATION",
            confidence=0.8,
            issues=["Parameter order wrong", "Missing return type"],
        )

        assert not result.is_accurate
        assert len(result.issues) == 2

    def test_from_json(self):
        """Test creating from JSON data."""
        data = {
            "verdict": "ACCURATE",
            "confidence": 0.9,
            "issues": [],
            "suggestions": ["Add docstring"],
        }

        result = VerificationResult.from_json(data)

        assert result.is_accurate
        assert result.confidence == 0.9


class TestDocumentationDraft:
    """Tests for documentation draft."""

    def test_unverified_draft(self):
        """Test draft without verification."""
        draft = DocumentationDraft(
            entity_name="my_function",
            file_path="docs/test/my_function.md",
            content="## my_function\n\nDoes something.",
        )

        assert not draft.is_verified
        assert draft.attempts == 1

    def test_verified_draft(self):
        """Test draft with successful verification."""
        draft = DocumentationDraft(
            entity_name="my_function",
            file_path="docs/test/my_function.md",
            content="## my_function\n\nDoes something.",
            verification=VerificationResult(
                verdict="ACCURATE",
                confidence=0.95,
            ),
            attempts=2,
        )

        assert draft.is_verified
        assert draft.attempts == 2


class TestDriftAnalysis:
    """Tests for drift analysis."""

    def test_minor_drift(self):
        """Test minor drift analysis."""
        analysis = DriftAnalysis(
            drift_score=15,
            severity="minor",
            required_updates=[],
            block_merge=False,
            summary="Cosmetic changes only",
        )

        assert analysis.drift_score == 15
        assert not analysis.block_merge

    def test_critical_drift(self):
        """Test critical drift analysis."""
        analysis = DriftAnalysis(
            drift_score=90,
            severity="critical",
            required_updates=[
                {"file": "docs/api.md", "section": "auth", "reason": "API changed"},
            ],
            block_merge=True,
            summary="Breaking API changes",
        )

        assert analysis.drift_score == 90
        assert analysis.block_merge
        assert len(analysis.required_updates) == 1

    def test_from_json(self):
        """Test creating from JSON data."""
        data = {
            "drift_score": 45,
            "severity": "moderate",
            "required_updates": [],
            "block_merge": False,
            "summary": "Some updates needed",
        }

        analysis = DriftAnalysis.from_json(data)

        assert analysis.drift_score == 45
        assert analysis.severity == "moderate"


class TestVerificationAgent:
    """Tests for the verification agent."""

    @pytest.fixture
    def mock_llm_client(self):
        """Create a mock LLM client."""
        client = MagicMock()
        client.generate = AsyncMock(
            return_value=LLMResponse(
                content='{"verdict": "ACCURATE", "confidence": 0.9, "issues": [], "suggestions": []}',
                model="test-model",
            )
        )
        return client

    @pytest.fixture
    def sample_entity(self):
        """Create a sample code entity."""
        return CodeEntity(
            name="calculate",
            entity_type="function",
            file_path="math.py",
            start_line=1,
            end_line=5,
            content="def calculate(x: int) -> int:\n    return x * 2",
            signature="def calculate(x: int) -> int",
        )

    @pytest.fixture
    def sample_change(self, sample_entity):
        """Create a sample entity change."""
        return EntityChange(
            entity=sample_entity,
            change_type=ChangeType.MODIFIED,
            old_content="def calculate(x): return x",
            new_content="def calculate(x: int) -> int:\n    return x * 2",
        )

    def test_agent_initialization(self, mock_llm_client):
        """Test agent initialization."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.get_db", side_effect=lambda: iter([mock_db])),
        ):
            agent = VerificationAgent(
                generator_client=mock_llm_client,
                max_retries=3,
            )

        assert agent.max_retries == 3
        assert agent.config.temperature == 0.0

    def test_detect_language_python(self):
        """Test language detection for Python files."""
        agent = VerificationAgent.__new__(VerificationAgent)

        assert agent._detect_language("test.py") == "python"
        assert agent._detect_language("module/utils.py") == "python"

    def test_detect_language_javascript(self):
        """Test language detection for JavaScript files."""
        agent = VerificationAgent.__new__(VerificationAgent)

        assert agent._detect_language("app.js") == "javascript"
        assert agent._detect_language("component.jsx") == "javascript"

    def test_detect_language_typescript(self):
        """Test language detection for TypeScript files."""
        agent = VerificationAgent.__new__(VerificationAgent)

        assert agent._detect_language("service.ts") == "typescript"
        assert agent._detect_language("component.tsx") == "typescript"

    def test_extract_json_from_markdown(self):
        """Test JSON extraction from markdown code block."""
        agent = VerificationAgent.__new__(VerificationAgent)

        text = """Here's the result:
```json
{"verdict": "ACCURATE", "confidence": 0.9}
```
"""

        json_str = agent._extract_json(text)
        assert '"verdict": "ACCURATE"' in json_str

    def test_extract_json_raw(self):
        """Test JSON extraction from raw text."""
        agent = VerificationAgent.__new__(VerificationAgent)

        text = 'The result is {"verdict": "HALLUCINATION", "confidence": 0.5}'

        json_str = agent._extract_json(text)
        assert "HALLUCINATION" in json_str
