import unittest
from unittest.mock import MagicMock, patch, mock_open
from src.github.committer import GitCommitter
from src.pipeline.analyzer import PRAnalysisResult, DocumentationDraft, DriftAnalysis
from pathlib import Path

class TestWorkflow(unittest.TestCase):
    
    @patch("src.github.committer.git.Repo")
    @patch("src.github.committer.Github")
    @patch("src.github.committer.shutil.rmtree")
    def test_apply_and_push(self, mock_rmtree, mock_github, mock_repo_cls):
        print("🔄 Testing GitCommitter Flow...")
        
        # Setup Mocks
        mock_repo = MagicMock()
        mock_repo_cls.clone_from.return_value = mock_repo
        
        mock_github_instance = MagicMock()
        mock_github.return_value = mock_github_instance
        mock_gh_repo = MagicMock()
        mock_github_instance.get_repo.return_value = mock_gh_repo
        
        # Setup Data
        draft = DocumentationDraft(
            entity_name="Foo",
            file_path="docs/foo.md",
            content="# Foo Documentation"
        )
        
        result = PRAnalysisResult(
            pr_number=123,
            repo_full_name="org/repo",
            documentation_updates=[draft]
        )
        
        # Initialize Committer
        committer = GitCommitter("fake-token", "org", "repo")
        
        # Test apply_and_push
        with patch("builtins.open", mock_open()) as mock_file:
            # We mock Path.mkdir to avoid filesystem errors
            with patch.object(Path, "mkdir") as mock_mkdir:
                branch = committer.apply_and_push(result, "head-sha")
        
        # Verify Clone
        mock_repo_cls.clone_from.assert_called()
        print("✅ Cloned repository")
        
        # Verify Checkout
        mock_repo.git.checkout.assert_any_call("head-sha")
        print("✅ Checked out head SHA")
        
        # Verify File Write (mock_open)
        mock_file().write.assert_called_with("# Foo Documentation")
        print("✅ Wrote documentation file")
        
        # Verify Git Add/Commit/Push
        mock_repo.index.add.assert_called()
        mock_repo.index.commit.assert_called()
        mock_repo.remote().push.assert_called()
        print("✅ Committed and Pushed changes")
        
        # Test Create PR
        pr_url = committer.create_pr(branch, 123, "main")
        
        # Verify PR Creation
        mock_gh_repo.create_pull.assert_called()
        print("✅ Created Pull Request")

if __name__ == "__main__":
    unittest.main()
