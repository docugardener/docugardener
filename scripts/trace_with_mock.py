import asyncio
import os
import sys
from unittest.mock import MagicMock, patch
from dotenv import load_dotenv

load_dotenv()

# Ensure we use the same Installation ID as the Trigger Script
INSTALLATION_ID = 105889743
REPO_OWNER = "alexeykopachev"
REPO_NAME = "root"

async def mock_get_client(install_id):
    print(f"Mocking Client for {install_id}")
    return MagicMock()

async def mock_get_token(client):
    print("Returning Real GITHUB_TOKEN for cloning")
    return os.getenv("GITHUB_TOKEN")

class MockReporter:
    def __init__(self, installation_id, notification_config=None):
        self.notification_config = notification_config
    
    async def report_to_pr(self, result, **kwargs):
        from src.pipeline.reporter import format_drift_report
        template = self.notification_config.get("prTemplate") if self.notification_config else None
        output = format_drift_report(result, template=template)
        print("\n" + "="*40)
        print("🚀 MOCKED REPORT TO GITHUB")
        print(f"Template Used: {bool(template)}")
        print("="*40)
        print(output)
        print("="*40 + "\n")
        return {"id": 123}

from contextlib import asynccontextmanager

@asynccontextmanager
async def mock_ephemeral_clone(*args, **kwargs):
    import tempfile
    import shutil
    
    # Create temp dir
    tmp_dir = tempfile.mkdtemp()
    
    # Seed file matching the triggered change
    # src/core_logic.py
    os.makedirs(os.path.join(tmp_dir, "src"), exist_ok=True)
    with open(os.path.join(tmp_dir, "src", "core_logic.py"), "w") as f:
        # Content causing drift (no docstring)
        f.write("def process_data_v2(data, strict_mode=True):\n    if strict_mode:\n        return [d * 2 for d in data]\n    return data\n")
        
    print(f"Mocked Clone Seeding to {tmp_dir}")
    try:
        yield tmp_dir
    finally:
        shutil.rmtree(tmp_dir)

async def run_trace(pr_number):
    # Import locally to avoid early init issues
    from src.pipeline.handler import process_pull_request
    
    print(f"[Trace] Analyzing PR #{pr_number}...")
    
    # We pass explicit changed files to avoid mocking GitHub API responses
    changed_files = [
        {"filename": "src/core_logic.py", "status": "modified", "patch": "..."}
    ]
    
    # Patch dependencies
    with patch('src.pipeline.handler.get_installation_client', side_effect=mock_get_client), \
         patch('src.pipeline.handler.get_installation_token', side_effect=mock_get_token), \
         patch('src.pipeline.handler.GitHubReporter', side_effect=MockReporter):
         
         # Note: We need accurate SHAs for the clone to work if we want real analysis.
         # But for ephemeral cloning using 'git clone', we usually clone the branch.
         # The analyzer uses `base_ref` and `head_sha`? 
         # Analyzer (ephemeral_clone) does:
         # git clone https://x-access-token:{token}@github.com/{owner}/{repo}.git
         # git checkout {head_sha}
         # If I pass dummy SHA, checkout fails.
         # So I need REAL output from trigger script.
         # I will accept arguments for SHAs.
         
         pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/trace_with_mock.py <PR_NUMBER>")
        sys.exit(1)
        
    pr_num = int(sys.argv[1])
    
    from src.github.app import get_installation_client
    from src.pipeline.handler import process_pull_request
    
    async def main():
        print(f"Fetching PR #{pr_num} details using App Client...")
        client = await get_installation_client(INSTALLATION_ID)
        repo = client.get_repo(f"{REPO_OWNER}/{REPO_NAME}")
        pr = repo.get_pull(pr_num)
        
        head_sha = pr.head.sha
        base_sha = pr.base.sha
        base_ref = pr.base.ref
        print(f"Resolved PR #{pr_num}: HEAD={head_sha}, BASE={base_ref}")
        
        # Patch dependencies
        print("Starting Trace with Mocks...")
        with patch('src.github.app.get_installation_client', side_effect=mock_get_client), \
             patch('src.pipeline.handler.get_installation_token', side_effect=mock_get_token), \
             patch('src.pipeline.analyzer.ephemeral_clone', side_effect=mock_ephemeral_clone), \
             patch('src.pipeline.handler.GitHubReporter', side_effect=MockReporter):
             
             await process_pull_request(
                installation_id=INSTALLATION_ID,
                owner=REPO_OWNER,
                repo=REPO_NAME,
                pr_number=pr_num,
                action="opened",
                base_sha=base_sha,
                head_sha=head_sha,
                base_ref=base_ref,
                changed_files=[{"filename": "src/core_logic.py", "status": "modified"}]
             )

    asyncio.run(main())
