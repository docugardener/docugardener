
import asyncio
import os
import time
from dotenv import load_dotenv
from src.github.app import get_installation_client

load_dotenv()

INSTALLATION_ID = 105889743
REPO_NAME = "alexeykopachev/root"

async def create_critical_test_pr():
    client = await get_installation_client(INSTALLATION_ID)
    repo = client.get_repo(REPO_NAME)
    base_branch = repo.default_branch
    
    timestamp = int(time.time())
    branch_name = f"test-dashboard-critical-{timestamp}"
    file_path = f"src/dashboard_test_{timestamp}.py"
    
    # 1. Base Content (Well documented)
    base_content = """
def process_payment(amount: float, currency: str = "USD") -> bool:
    \"\"\"
    Process a payment for the given amount.
    
    Args:
        amount: The transaction amount
        currency: The ISO 4217 currency code
        
    Returns:
        True if successful
    \"\"\"
    return True
"""
    
    print(f"🚀 Preparing Critical PR Test...")
    
    # Create file in main first (so it's a modification, not new file - though new file works too)
    try:
        repo.create_file(file_path, "Initial documented payment function", base_content, branch=base_branch)
        print(f"✅ Created base file: {file_path}")
    except Exception as e:
        print(f"⚠️ File might exist, proceeding: {e}")

    # 2. Create Branch
    sb = repo.get_branch(base_branch)
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    
    # 3. Critical Change: Rename params + Remove Docs + Change logic
    new_content = """
def process_transaction(val, curr="EUR", force=False):
    # Docs removed
    # API changed significantly
    if force:
        return True
    return False
"""
    
    # Update file on branch
    file = repo.get_contents(file_path, ref=branch_name)
    repo.update_file(file_path, "BREAKING: Rename payment to transaction", new_content, file.sha, branch=branch_name)
    
    # 4. Open PR
    pr = repo.create_pull(
        title=f"⚠️ [TEST] Critical Dashboard Verify {timestamp}",
        body="This PR introduces a breaking API change and removes documentation. It SHOULD score ~100/100 and block the merge.",
        head=branch_name,
        base=base_branch
    )
    
    print(f"🚨 Critical PR Created: {pr.html_url}")
    print("⏳ Waiting for Webhook analysis...")

if __name__ == "__main__":
    asyncio.run(create_critical_test_pr())
