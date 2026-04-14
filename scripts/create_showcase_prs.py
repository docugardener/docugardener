"""
DocuGardener Semantic Showcase Generator.
Creates 5 PRs to demonstrate different drift levels and capabilities.
"""

import asyncio
import os
import time
from github import Github
from dotenv import load_dotenv
from src.github.app import get_installation_client

INSTALLATION_ID = 105889743
REPO_NAME = "alexeykopachev/root"

SCENARIOS = [
    {
        "id": "cosmetic",
        "title": "Showcase: Cosmetic Change (Severity: None)",
        "file": "src/core_logic.py",
        "old_content": "def run_task(name):\n    print(f\"Running {name}\")\n    return True",
        "new_content": "def run_task( name ):\n    # This is a cosmetic change with just whitespace\n    print(f\"Running {name}\")\n    return True  ",
        "description": "Demonstrates that DocuGardener ignores whitespace and code-only comments."
    },
    {
        "id": "docstring",
        "title": "Showcase: Docstring Update (Severity: Minor)",
        "file": "src/api_client.py",
        "old_content": "def get_data(id):\n    '''Fetch data by ID.'''\n    return {'id': id}",
        "new_content": "def get_data(id):\n    '''\n    Fetch item data by unique identifier.\n    \n    Args:\n        id (int): The unique ID of the item.\n    \n    Returns:\n        dict: JSON data for the item.\n    '''\n    return {'id': id}",
        "description": "Demonstrates detection of internal docstring changes without logic modification."
    },
    {
        "id": "logic",
        "title": "Showcase: Internal Logic Change (Severity: Moderate)",
        "file": "src/processor.py",
        "old_content": "def validate_email(email):\n    return '@' in email",
        "new_content": "def validate_email(email):\n    # Improved regex-less validation\n    if not email or '@' not in email:\n        return False\n    parts = email.split('@')\n    return len(parts) == 2 and '.' in parts[1]",
        "description": "Demonstrates detection of functional logic changes while keeping the same signature."
    },
    {
        "id": "breaking",
        "title": "Showcase: Breaking API Change (Severity: Critical)",
        "file": "src/auth.py",
        "old_content": "def login(user, password):\n    return user == \"admin\"",
        "new_content": "def login(user, password, mfa_token=None, provider=\"local\"):\n    '''Login with mandatory user/password and optional MFA.'''\n    if provider == \"local\":\n        return user == \"admin\" and mfa_token is not None\n    return False",
        "description": "Demonstrates blocking level drift for API signature changes."
    },
    {
        "id": "feature",
        "title": "Showcase: New Feature Addition (Severity: Significant)",
        "file": "src/new_module.py",
        "old_content": None,
        "new_content": "class DataStream:\n    '''High-performance async data stream processor.'''\n    def __init__(self, source):\n        self.source = source\n    \n    async def start(self):\n        '''Initialize the stream connection.'''\n        pass",
        "description": "Demonstrates how DocuGardener handles completely new code entities."
    }
]

async def create_showcase():
    load_dotenv()
    client = await get_installation_client(INSTALLATION_ID)
    repo = client.get_repo(REPO_NAME)
    base_branch = repo.default_branch
    sb = repo.get_branch(base_branch)

    print(f"🚀 Launching DocuGardener Semantic Showcase on {REPO_NAME}...")

    # Preliminary Step: Ensure base files exist in the default branch
    # This allows 'modified' tests to actually be modifications
    for scenario in SCENARIOS:
        if scenario['old_content']:
            try:
                repo.get_contents(scenario['file'], ref=base_branch)
            except:
                print(f"🌱 Seeding {scenario['file']} to {base_branch}...")
                repo.create_file(
                    path=scenario['file'],
                    message=f"Showcase seed: {scenario['file']}",
                    content=scenario['old_content'],
                    branch=base_branch
                )
    
    if any(s['old_content'] for s in SCENARIOS):
        print("⏳ Waiting 10s for GitHub to sync seed commits...")
        await asyncio.sleep(10)
        # Update the base branch tip
        sb = repo.get_branch(base_branch)

    for scenario in SCENARIOS:
        print(f"\n🎬 Scenario: {scenario['id'].upper()} - {scenario['title']}")
        
        branch_name = f"showcase-{scenario['id']}-{int(time.time())}"
        repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
        
        try:
            # Create/Update file
            try:
                contents = repo.get_contents(scenario['file'], ref=branch_name)
                repo.update_file(
                    path=scenario['file'],
                    message=f"Showcase: {scenario['id']} change",
                    content=scenario['new_content'],
                    sha=contents.sha,
                    branch=branch_name
                )
            except:
                repo.create_file(
                    path=scenario['file'],
                    message=f"Showcase: add {scenario['file']}",
                    content=scenario['new_content'],
                    branch=branch_name
                )
            
            # Create PR
            pr = repo.create_pull(
                title=scenario['title'],
                body=f"### DocuGardener Showcase: {scenario['id'].upper()}\n\n{scenario['description']}\n\n--- \n*Generated automatically for product demonstration.*",
                head=branch_name,
                base=base_branch
            )
            print(f"✅ PR Created: {pr.html_url}")
            
            # Small delay to keep webhooks happy
            await asyncio.sleep(2)
            
        except Exception as e:
            print(f"❌ Failed scenario {scenario['id']}: {e}")

    print("\n✨ All showcase PRs have been triggered. Wait for the bot to comment!")

if __name__ == "__main__":
    asyncio.run(create_showcase())
