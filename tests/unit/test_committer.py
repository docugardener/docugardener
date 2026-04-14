import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from src.github.committer import GitCommitter
from src.pipeline.analyzer import PRAnalysisResult
from src.agents.verifier import DocumentationDraft

@pytest.fixture
def committer():
    return GitCommitter(
        installation_token="mock_token",
        owner="TestOwner",
        repo="TestRepo"
    )

def test_sanitize_branch_name(committer):
    assert committer._sanitize_branch_name("feature/cool_stuff!!") == "feature-cool_stuff"
    assert committer._sanitize_branch_name("  spaces  and  dots.  ") == "spaces-and-dots"
    assert committer._sanitize_branch_name("PR-123+update") == "PR-123-update"
    assert committer._sanitize_branch_name("---weird----dashes---") == "weird-dashes"

@patch("src.github.committer.git.Repo.clone_from")
@patch("src.github.committer.shutil.rmtree")
@patch("src.github.committer.Path.exists")
def test_apply_and_push_success(mock_exists, mock_rmtree, mock_clone, committer):
    # Setup
    mock_exists.return_value = False
    mock_repo = MagicMock()
    mock_clone.return_value = mock_repo
    
    result = PRAnalysisResult(pr_number=42, repo_full_name="TestOwner/TestRepo")
    result.documentation_updates = [
        DocumentationDraft(entity_name="test", file_path="docs/test.md", content="new content")
    ]
    
    # Execute
    with patch("builtins.open", MagicMock()):
        branch = committer.apply_and_push(result, "base_sha")
    
    # Verify
    assert branch.startswith("docugardener-fix-42-")
    mock_clone.assert_called_once()
    mock_repo.git.checkout.assert_any_call("base_sha")
    mock_repo.git.checkout.assert_any_call("-b", branch)
    mock_repo.index.add.assert_called_once()
    mock_repo.index.commit.assert_called_once()
    mock_repo.remote().push.assert_called_once_with(branch)

@patch("src.github.committer.Github")
def test_create_pr_success(mock_github, committer):
    # Setup
    mock_gh_instance = MagicMock()
    mock_github.return_value = mock_gh_instance
    mock_repo = MagicMock()
    mock_gh_instance.get_repo.return_value = mock_repo
    mock_pr = MagicMock()
    mock_pr.html_url = "https://github.com/PR/URL"
    mock_repo.create_pull.return_value = mock_pr
    
    # Execute
    url = committer.create_pr("fix-branch", 42, "main")
    
    # Verify
    assert url == "https://github.com/PR/URL"
    mock_repo.create_pull.assert_called_once()
    args, kwargs = mock_repo.create_pull.call_args
    assert kwargs["head"] == "fix-branch"
    assert kwargs["base"] == "main"
    assert "documentation drift from #42" in kwargs["title"]

def test_apply_and_push_no_updates(committer):
    result = PRAnalysisResult(pr_number=42, repo_full_name="TestOwner/TestRepo")
    result.documentation_updates = []

    branch = committer.apply_and_push(result, "base_sha")
    assert branch is None


@patch("src.github.committer.Github")
def test_create_pr_includes_ai_signal_in_body(mock_github, committer):
    """MOAT-02: ai_signal is rendered as a labelled row in the PR body metadata table."""
    mock_pr = MagicMock()
    mock_pr.html_url = "https://github.com/PR/URL"
    mock_repo = MagicMock()
    mock_repo.create_pull.return_value = mock_pr
    mock_github.return_value.get_repo.return_value = mock_repo

    committer.create_pr("fix-branch", 42, "main", ai_signal="branch_prefix")

    _, kwargs = mock_repo.create_pull.call_args
    assert "AI Authorship Signal" in kwargs["body"]
    assert "Branch prefix" in kwargs["body"]


@patch("src.github.committer.Github")
def test_create_pr_no_ai_signal_omits_ai_row(mock_github, committer):
    """MOAT-02: when ai_signal is None the AI row is absent from the PR body."""
    mock_pr = MagicMock()
    mock_pr.html_url = "https://github.com/PR/URL"
    mock_repo = MagicMock()
    mock_repo.create_pull.return_value = mock_pr
    mock_github.return_value.get_repo.return_value = mock_repo

    committer.create_pr("fix-branch", 42, "main", ai_signal=None)

    _, kwargs = mock_repo.create_pull.call_args
    assert "AI Authorship Signal" not in kwargs["body"]


@patch("src.github.committer.Github")
def test_create_pr_ai_signal_all_known_labels(mock_github, committer):
    """MOAT-02: each known signal key maps to a human-readable label."""
    expected = {
        "bot_suffix": "Bot sender",
        "branch_prefix": "Branch prefix",
        "body_marker": "Attribution marker",
        "custom_pattern": "Tenant custom",
    }
    for signal, fragment in expected.items():
        mock_pr = MagicMock()
        mock_pr.html_url = "https://github.com/PR/URL"
        mock_repo = MagicMock()
        mock_repo.create_pull.return_value = mock_pr
        mock_github.return_value.get_repo.return_value = mock_repo

        committer.create_pr("fix-branch", 42, "main", ai_signal=signal)

        _, kwargs = mock_repo.create_pull.call_args
        assert fragment in kwargs["body"], f"Signal '{signal}' label not found in body"
