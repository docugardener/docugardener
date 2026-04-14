import asyncio
import os
import sys
from github import Github
from src.github.app import get_installation_client
from src.pipeline.handler import process_pull_request

async def run_trace():
    print("🔍 Starting Manual Trace for PR #56...")
    
    installation_id = 105889743
    repo_name = "alexeykopachev/root"
    pr_number = 56
    
    # 1. Fetch PR details for SHAs
    client = await get_installation_client(installation_id)
    repo = client.get_repo(repo_name)
    pr = repo.get_pull(pr_number)
    
    print(f"HEAD: {pr.head.sha}")
    print(f"BASE: {pr.base.sha}")
    
    # 2. Run Analysis
    try:
        result = await process_pull_request(
            installation_id=installation_id,
            owner=repo_name.split("/")[0],
            repo=repo_name.split("/")[1],
            pr_number=pr_number,
            action="opened",
            base_sha=pr.base.sha,
            head_sha=pr.head.sha,
            changed_files=[], # Handler will fetch
            base_ref=pr.base.ref
        )
        print("\n✅ Analysis Result:")
        print(f"Score: {result.drift_score}")
        print(f"Updates: {len(result.documentation_updates)}")
        if result.error:
            print(f"Error: {result.error}")
    except Exception as e:
        print(f"\n❌ Trace Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_trace())
