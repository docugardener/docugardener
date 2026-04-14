"""
DocuGardener Diagnostic Showcase.
Executes ONLY the cosmetic PR scenario for deep debugging.
"""
import asyncio
import os
import time
from github import Github
from dotenv import load_dotenv
from src.github.app import get_installation_client

INSTALLATION_ID = 105889743
REPO_NAME = "alexeykopachev/root"

# Use a unique filename to avoid collisions with previous runs
UNIQUE_ID = int(time.time())
FILENAME = f"src/diagnostic_cosmetic_{UNIQUE_ID}.py"

SCENARIO = {
    "id": "diagnostic-cosmetic",
    "title": f"Diagnostic: Cosmetic Change {UNIQUE_ID}",
    "file": FILENAME,
    "old_content": "def run_task(name):\n    print(f\"Running {name}\")\n    return True",
    "new_content": "def run_task( name ):\n    # Cosmetic whitespace change\n    print(f\"Running {name}\")\n    return True  ",
    "description": "Diagnostic run to verifying base version fetching."
}

async def run_diagnostic():
    load_dotenv()
    client = await get_installation_client(INSTALLATION_ID)
    repo = client.get_repo(REPO_NAME)
    base_branch = repo.default_branch
    
    print(f"🚀 Launching Diagnostic Run on {REPO_NAME}...")
    print(f"📄 Using file: {FILENAME}")

    # 1. Seed file to base branch
    print(f"🌱 Seeding {FILENAME} to {base_branch}...")
    repo.create_file(
        path=SCENARIO['file'],
        message=f"Diagnostic seed: {SCENARIO['file']}",
        content=SCENARIO['old_content'],
        branch=base_branch
    )
    
    # 2. Wait explicitly for propagation
    print("⏳ Waiting 15s for generic GitHub consistency...")
    await asyncio.sleep(15)
    
    # 3. Create feature branch from FRESH tip
    sb = repo.get_branch(base_branch)
    print(f"📌 Base SHA is now: {sb.commit.sha}")
    
    branch_name = f"diag-{UNIQUE_ID}"
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    
    # 4. Modify file
    print(f"✏️ Modifying file on {branch_name}...")
    contents = repo.get_contents(SCENARIO['file'], ref=branch_name)
    repo.update_file(
        path=SCENARIO['file'],
        message=f"Diagnostic change",
        content=SCENARIO['new_content'],
        sha=contents.sha,
        branch=branch_name
    )
    
    # 5. Create PR (Wait a bit before creating PR to ensure refs are ready?)
    print("⏳ Waiting 2s before PR creation...")
    await asyncio.sleep(2)
    
    pr = repo.create_pull(
        title=SCENARIO['title'],
        body="Diagnostic run.",
        head=branch_name,
        base=base_branch
    )
    print(f"✅ PR Created: {pr.html_url}")

if __name__ == "__main__":
    asyncio.run(run_diagnostic())
