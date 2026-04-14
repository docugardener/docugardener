
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

SCENARIOS = [
    {
        "name": "Internal Function Addition",
        "file_path": "src/utils_sim.py",
        "old_code": "def public_api():\n    return _internal()\n\ndef _internal():\n    return 1",
        "new_code": "def public_api():\n    return _internal() + _helper()\n\ndef _internal():\n    return 1\n\ndef _helper():\n    return 2",
        "title": "[SIM-1] Internal Function Addition",
        "body": "Simulation: Adding a private helper function and updating public logic."
    },
    {
        "name": "API Signature Change (Public)",
        "file_path": "src/api_sim.py",
        "old_code": "def connect(host, port):\n    \"\"\"Docstring.\"\"\"\n    pass",
        "new_code": "def connect(connection_string, timeout=30):\n    # Documentation removed!\n    pass",
        "title": "[SIM-2] API Signature Change",
        "body": "Simulation: Breaking change - signature update and docstring removal."
    },
    {
        "name": "Docstring-only Update",
        "file_path": "src/logic_sim.py",
        "old_code": "def calc():\n    \"\"\"Old docs.\"\"\"\n    return 1",
        "new_code": "def calc():\n    \"\"\"New updated documentation and refined logic description.\"\"\"\n    return 1",
        "title": "[SIM-3] Docstring Update",
        "body": "Simulation: Only docstrings changed, logic remains identical."
    },
    {
        "name": "Private API Refactor",
        "file_path": "src/hidden_sim.py",
        "old_code": "def _private_func(a, b):\n    return a + b",
        "new_code": "def _private_func(a, b, c=0):\n    # Private signature changed\n    return a + b + c",
        "title": "[SIM-4] Private Refactor",
        "body": "Simulation: Signature change on an internal/private function."
    },
    {
        "name": "Large Feature Addition",
        "file_path": "src/processor_sim.py",
        "old_code": "def process(data):\n    return data",
        "new_code": """
def process(data):
    return run_heavy_logic(data)

def run_heavy_logic(data):
    \"\"\"
    A very long and complex logic block
    that adds many lines of code
    making it a moderate to significant change.
    \"\"\"
    step1 = data * 2
    step2 = step1 / 3
    step3 = [i for i in range(int(step2))]
    step4 = [x for x in step3 if x % 2 == 0]
    return sum(step4)
        """,
        "title": "[SIM-5] Large Feature Addition",
        "body": "Simulation: Adding an entirely new complex function."
    }
]

async def submit_scenarios():
    client = await get_installation_client(INSTALLATION_ID)
    repo = client.get_repo(REPO_NAME)
    base_branch = repo.default_branch
    
    print(f"🚀 Submitting {len(SCENARIOS)} simulated scenarios to {REPO_NAME}...")
    
    for scenario in SCENARIOS:
        print(f"▶️ Scenario: {scenario['name']}...")
        
        # 1. Ensure file exists in main with old_code
        try:
            repo.get_contents(scenario['file_path'], ref=base_branch)
            # Update to old_code to ensure clean starting point
            file = repo.get_contents(scenario['file_path'], ref=base_branch)
            repo.update_file(scenario['file_path'], "Reset to old_code", scenario['old_code'], file.sha, branch=base_branch)
        except:
            # Create if not exists
            repo.create_file(scenario['file_path'], "Initial state", scenario['old_code'], branch=base_branch)
            
        # 2. Create branch
        branch_name = f"sim-{scenario['name'].lower().replace(' ', '-')}-{int(time.time())}"
        sb = repo.get_branch(base_branch)
        repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
        
        # 3. Update file with new_code on branch
        file = repo.get_contents(scenario['file_path'], ref=branch_name)
        repo.update_file(scenario['file_path'], f"Update for {scenario['name']}", scenario['new_code'], file.sha, branch=branch_name)
        
        # 4. Open PR
        pr = repo.create_pull(
            title=scenario['title'],
            body=scenario['body'],
            head=branch_name,
            base=base_branch
        )
        print(f"✅ PR Created: {pr.html_url}")
        
    print("✨ All scenarios submitted!")

if __name__ == "__main__":
    asyncio.run(submit_scenarios())
