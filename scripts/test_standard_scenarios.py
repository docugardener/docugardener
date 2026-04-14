
import asyncio
import os
import time
import random
import string
from dotenv import load_dotenv
from github import Github
from src.github.app import get_installation_client

load_dotenv()

INSTALLATION_ID = 105889743
REPO_NAME = "alexeykopachev/root"

def get_random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

async def create_simple_pr(repo):
    """Scenario 1: Simple change (Minor docstring/constant)"""
    branch_name = f"scenario-simple-{int(time.time())}"
    base_branch = repo.default_branch
    sb = repo.get_branch(base_branch)
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    
    file_path = "src/utils.py"
    content = "DEFAULT_TIMEOUT = 30\n\ndef get_status():\n    return 'OK'\n"
    
    try:
        repo.create_file(file_path, "Initial utils", content, branch=branch_name)
    except:
        sha = repo.get_contents(file_path, ref=branch_name).sha
        repo.update_file(file_path, "Update constant", content.replace("30", "60"), sha, branch=branch_name)
    
    pr = repo.create_pull(
        title="[SIMPLE] Update timeout constant",
        body="Minor change to a constant in utils.py. Drift should be low.",
        head=branch_name,
        base=base_branch
    )
    return pr

async def create_moderate_pr(repo):
    """Scenario 2: Moderate change (New function with some complexity)"""
    branch_name = f"scenario-moderate-{int(time.time())}"
    base_branch = repo.default_branch
    sb = repo.get_branch(base_branch)
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    
    file_path = "src/data_processor.py"
    content = """
def process_batch(items):
    \"\"\"Process a list of items.\"\"\"
    return [i.upper() for i in items]

def validate_config(config):
    # New complex validation logic
    if not config.get('version'):
        raise ValueError("Missing version")
    return True
"""
    try:
        repo.create_file(file_path, "Add data processor", content, branch=branch_name)
    except:
        sha = repo.get_contents(file_path, ref=branch_name).sha
        repo.update_file(file_path, "Add validation logic", content, sha, branch=branch_name)
    
    pr = repo.create_pull(
        title="[MODERATE] Add config validation",
        body="Added a new function validate_config with some logic. Drift should be moderate.",
        head=branch_name,
        base=base_branch
    )
    return pr

async def create_critical_pr(repo):
    """Scenario 3: Critical change (Refactor, signature change, removing docs)"""
    branch_name = f"scenario-critical-{int(time.time())}"
    base_branch = repo.default_branch
    sb = repo.get_branch(base_branch)
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    
    file_path = "src/api_core.py"
    # Old version had docstring
    old_content = """
def connect_to_db(host, port, user="admin"):
    \"\"\"
    Establish a connection to the database.
    
    Args:
        host: Database host
        port: Database port
        user: Database user
    \"\"\"
    print(f"Connecting to {host}:{port}")
"""
    # New version renames, changes params, removes docstring
    new_content = """
def establish_secure_connection(connection_string, timeout=30):
    # Docstring removed!
    print(f"Connecting with {connection_string}")
"""
    
    try:
        repo.create_file(file_path, "Initial API core", old_content, branch=branch_name)
    except:
        # If exists, we need to make sure we start from old_content in a clean way or just update
        pass 

    # In a real scenario we'd do this in two commits to show a real diff, 
    # but for simplicity we'll just update it in one for the PR comparison.
    # Actually, to show drift, we need the base (HEAD) to have old_content and the PR to have new_content.
    
    # We'll commit old_content to main first if not present, then branch.
    # For now, let's assume we update an existing file.
    
    pr = repo.create_pull(
        title="[CRITICAL] Secure Connection Refactor",
        body="Renamed connect_to_db to establish_secure_connection and changed params. Removed docs.",
        head=branch_name,
        base=base_branch
    )
    
    # After PR creation, update the file to the "breaking" version
    sha = repo.get_contents(file_path, ref=branch_name).sha
    repo.update_file(file_path, "Refactor and remove docs", new_content, sha, branch=branch_name)
    
    return pr

async def run_scenarios():
    client = await get_installation_client(INSTALLATION_ID)
    repo = client.get_repo(REPO_NAME)
    
    print("🚀 Running [SIMPLE] scenario...")
    pr1 = await create_simple_pr(repo)
    print(f"✅ Simple PR: {pr1.html_url}")
    
    print("🚀 Running [MODERATE] scenario...")
    pr2 = await create_moderate_pr(repo)
    print(f"✅ Moderate PR: {pr2.html_url}")
    
    print("🚀 Running [CRITICAL] scenario...")
    pr3 = await create_critical_pr(repo)
    print(f"✅ Critical PR: {pr3.html_url}")

if __name__ == "__main__":
    asyncio.run(run_scenarios())
