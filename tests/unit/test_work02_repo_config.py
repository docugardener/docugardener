"""
WORK-02: Tests for repository-level configuration loading.

Covers:
  1. Successfully loading .github/docugardener.yml via GitHub API.
  2. Falling back to .yaml extension when .yml is absent.
  3. Gracefully returning {} when no config file exists.
  4. Returning {} on invalid YAML (non-mapping root).
  5. Returning {} on HTTP errors (connection failure, 500).
  6. apply_ignore_patterns — filters matching files.
  7. apply_ignore_patterns — keeps all files when no patterns given.
  8. apply_ignore_patterns — glob wildcards work correctly.
"""

import base64
import json
import pytest
from unittest.mock import MagicMock, patch

from src.pipeline.repo_config import apply_ignore_patterns, load_repo_config


# ── Helpers ───────────────────────────────────────────────────────────────────

def _github_contents_response(raw_yaml: str) -> dict:
    """Build a fake GitHub API /contents response for the given YAML text."""
    encoded = base64.b64encode(raw_yaml.encode()).decode()
    return {"content": encoded, "encoding": "base64"}


def _make_http_response(status_code: int, json_body: dict | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_body or {}
    resp.raise_for_status.return_value = None
    return resp


# ── load_repo_config ──────────────────────────────────────────────────────────

class TestLoadRepoConfig:

    @patch("src.pipeline.repo_config.httpx")
    def test_loads_yml_file_successfully(self, mock_httpx):
        """
        When .github/docugardener.yml exists and contains valid YAML,
        load_repo_config returns the parsed dict.
        """
        yaml_text = "ignore_patterns:\n  - 'docs/legacy/**'\ndrift_threshold: 70\n"
        body = _github_contents_response(yaml_text)
        mock_httpx.get.return_value = _make_http_response(200, body)

        config = load_repo_config("acme", "api", "token-abc")

        assert config["drift_threshold"] == 70
        assert config["ignore_patterns"] == ["docs/legacy/**"]

    @patch("src.pipeline.repo_config.httpx")
    def test_falls_back_to_yaml_extension(self, mock_httpx):
        """
        When .yml returns 404 but .yaml exists, the .yaml file is used.
        """
        yaml_text = "block_merge_above: 90\n"
        body = _github_contents_response(yaml_text)

        not_found = _make_http_response(404)
        found = _make_http_response(200, body)
        mock_httpx.get.side_effect = [not_found, found]

        config = load_repo_config("acme", "api", "token-abc")

        assert config["block_merge_above"] == 90
        assert mock_httpx.get.call_count == 2

    @patch("src.pipeline.repo_config.httpx")
    def test_returns_empty_dict_when_no_config(self, mock_httpx):
        """
        When both .yml and .yaml return 404, load_repo_config returns {}.
        """
        mock_httpx.get.return_value = _make_http_response(404)

        config = load_repo_config("acme", "api", "token-abc")

        assert config == {}

    @patch("src.pipeline.repo_config.httpx")
    def test_returns_empty_dict_for_non_mapping_yaml(self, mock_httpx):
        """
        If the YAML root is not a dict (e.g. a bare list), load_repo_config
        returns {} rather than crashing.
        """
        yaml_text = "- foo\n- bar\n"
        body = _github_contents_response(yaml_text)
        mock_httpx.get.return_value = _make_http_response(200, body)

        config = load_repo_config("acme", "api", "token-abc")

        assert config == {}

    @patch("src.pipeline.repo_config.httpx")
    def test_returns_empty_dict_on_http_error(self, mock_httpx):
        """
        Network / server errors must be caught; load_repo_config returns {}.
        """
        mock_httpx.get.return_value.status_code = 500
        mock_httpx.get.return_value.raise_for_status.side_effect = RuntimeError("Server error 500")

        config = load_repo_config("acme", "api", "token-abc")

        assert config == {}

    @patch("src.pipeline.repo_config.httpx")
    def test_empty_yaml_file_returns_empty_dict(self, mock_httpx):
        """An empty .github/docugardener.yml should produce {}."""
        body = _github_contents_response("")
        mock_httpx.get.return_value = _make_http_response(200, body)

        config = load_repo_config("acme", "api", "token-abc")

        assert config == {}

    @patch("src.pipeline.repo_config.httpx")
    def test_ref_is_forwarded_to_github_api(self, mock_httpx):
        """
        The ref parameter (branch/SHA) must be passed as a query param to the
        GitHub contents API so we read config from the correct commit.
        """
        body = _github_contents_response("drift_threshold: 55\n")
        mock_httpx.get.return_value = _make_http_response(200, body)

        load_repo_config("acme", "api", "token-abc", ref="feature/my-branch")

        call_kwargs = mock_httpx.get.call_args
        assert call_kwargs.kwargs["params"]["ref"] == "feature/my-branch"


# ── apply_ignore_patterns ─────────────────────────────────────────────────────

class TestApplyIgnorePatterns:

    def test_no_patterns_keeps_all_files(self):
        files = ["src/foo.py", "docs/README.md", "tests/test_foo.py"]
        result = apply_ignore_patterns(files, [])
        assert result == files

    def test_exact_match_removes_file(self):
        files = ["src/foo.py", "src/bar.py"]
        result = apply_ignore_patterns(files, ["src/foo.py"])
        assert result == ["src/bar.py"]

    def test_wildcard_pattern_removes_matching_files(self):
        files = ["docs/legacy/old.md", "docs/current/new.md", "src/main.py"]
        result = apply_ignore_patterns(files, ["docs/legacy/*"])
        assert "docs/legacy/old.md" not in result
        assert "docs/current/new.md" in result
        assert "src/main.py" in result

    def test_extension_glob_filters_correctly(self):
        files = ["foo.test.ts", "bar.test.ts", "main.ts", "utils.ts"]
        result = apply_ignore_patterns(files, ["*.test.ts"])
        assert result == ["main.ts", "utils.ts"]

    def test_multiple_patterns_applied(self):
        files = ["docs/old.md", "tests/e2e/spec.ts", "src/core.py"]
        result = apply_ignore_patterns(files, ["docs/*", "tests/e2e/*"])
        assert result == ["src/core.py"]

    def test_empty_file_list_returns_empty(self):
        assert apply_ignore_patterns([], ["*.py"]) == []
