import asyncio
import os
import shutil
import tempfile
from unittest.mock import MagicMock, patch
from src.pipeline.analyzer import PRAnalyzer, FileChange
from contextlib import asynccontextmanager

# Mock ephemeral_clone to prevent real git ops and seed dgignore
@asynccontextmanager
async def mock_ephemeral_clone_with_ignore(*args, **kwargs):
    tmp_dir = tempfile.mkdtemp()
    try:
        # Create .dgignore
        with open(os.path.join(tmp_dir, ".dgignore"), "w") as f:
            f.write("src/secret.py\n")
            f.write("tests/*\n")
            
        # Create some files
        os.makedirs(os.path.join(tmp_dir, "src"), exist_ok=True)
        os.makedirs(os.path.join(tmp_dir, "tests"), exist_ok=True)
        
        with open(os.path.join(tmp_dir, "src", "public.py"), "w") as f:
            f.write("def public(): pass")
            
        with open(os.path.join(tmp_dir, "src", "secret.py"), "w") as f:
            f.write("def secret(): pass")
            
        with open(os.path.join(tmp_dir, "tests", "test_stuff.py"), "w") as f:
            f.write("def test(): pass")
            
        yield Path(tmp_dir)
    finally:
        shutil.rmtree(tmp_dir)

from pathlib import Path

async def test_dgignore():
    analyzer = PRAnalyzer()
    
    # Mock _analyze_file_changes to capture what was filtered
    analyzer._analyze_file_changes = MagicMock(return_value=[])
    
    # Files to check
    files_to_check = [
        FileChange(path="src/public.py", status="modified"),
        FileChange(path="src/secret.py", status="modified"),
        FileChange(path="tests/test_stuff.py", status="modified"),
    ]
    
    print("Testing .dgignore support...")
    
    with patch("src.pipeline.analyzer.ephemeral_clone", side_effect=mock_ephemeral_clone_with_ignore):
        await analyzer.analyze_pr(
            owner="me",
            repo="repo",
            pr_number=1,
            base_sha="abc",
            head_sha="def",
            changed_files=files_to_check,
            installation_token="token",
            tenant_id="tenant"
        )
        
    # Check what was passed to _analyze_file_changes
    call_args = analyzer._analyze_file_changes.call_args
    if not call_args:
        print("❌ _analyze_file_changes was NOT called!")
        return

    # changed_files is argument index 2 (repo_path, base_sha, changed_files...) or keyword
    filtered_files = call_args.kwargs.get('changed_files')
    if not filtered_files:
        # Try args
        # Signature: _analyze_file_changes(self, repo_path, base_sha, changed_files, base_ref=None)
        # 0: repo_path, 1: base_sha, 2: changed_files
        if len(call_args.args) > 2:
            filtered_files = call_args.args[2]

    file_paths = [f.path for f in filtered_files]
    print(f"Files passed to analysis: {file_paths}")
    
    # verification
    assert "src/public.py" in file_paths, "Public file should be kept"
    assert "src/secret.py" not in file_paths, "Secret file should be ignored"
    assert "tests/test_stuff.py" not in file_paths, "Tests should be ignored"
    
    print("✅ .dgignore logic verified successfully!")

if __name__ == "__main__":
    asyncio.run(test_dgignore())
