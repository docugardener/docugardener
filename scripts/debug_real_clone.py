import asyncio
import os
import sys
from dotenv import load_dotenv
from src.pipeline.analyzer import PRAnalyzer, FileChange
from src.worker.context import get_tenant_context

load_dotenv()

INSTALLATION_ID = 105889743
REPO_OWNER = "alexeykopachev"
REPO_NAME = "root"

async def debug_analysis(pr_number):
    from src.github.app import get_installation_client, get_installation_token
    
    print(f"Fetching PR #{pr_number}...")
    client = await get_installation_client(INSTALLATION_ID)
    repo = client.get_repo(f"{REPO_OWNER}/{REPO_NAME}")
    pr = repo.get_pull(pr_number)
    
    token = get_installation_token(INSTALLATION_ID)
    
    analyzer = PRAnalyzer()
    
    # Fetch real files from PR
    files = pr.get_files()
    real_changed_files = [FileChange(path=f.filename, status=f.status) for f in files]
    print(f"Tracking {len(real_changed_files)} files: {[f.path for f in real_changed_files]}")

    print("Starting Analysis...")
    result = await analyzer.analyze_pr(
        owner=REPO_OWNER,
        repo=REPO_NAME,
        pr_number=pr_number,
        base_sha=pr.base.sha,
        head_sha=pr.head.sha,
        changed_files=real_changed_files,
        installation_token=token,
        tenant_id=str(INSTALLATION_ID), # Pass correct installation ID
        base_ref=pr.base.ref,
        llm_config={"provider": "ollama", "modelName": "llama3", "baseUrl": "http://host.docker.internal:11434"} # Force local config
    )
    
    print(f"Result Success: {result.success}")
    print(f"Result Error: {result.error}")
    print(f"Drift: {result.drift_analysis}")
    
    # Post to GitHub using Reporter
    if result.success:
        from src.pipeline.reporter import GitHubReporter
        # Fetch template from DB for this tenant
        tenant_ctx = get_tenant_context(str(INSTALLATION_ID)) # Use the correct installation ID
        reporter = GitHubReporter(INSTALLATION_ID, notification_config=tenant_ctx.notification_config)
        print("Posting comment to GitHub...")
        await reporter.report_to_pr(result)
        print("✅ Comment Posted!")

    if result.drift_analysis is None and result.success:
        print("❌ REPRODUCED: Success=True but Drift=None")
    elif result.drift_analysis:
        print("✅ Analysis Succeeded")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/debug_real_clone.py <PR_NUMBER>")
        sys.exit(1)
    asyncio.run(debug_analysis(int(sys.argv[1])))
