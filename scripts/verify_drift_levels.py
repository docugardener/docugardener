"""
Script to systematically verify drift classification levels.
Usage: python scripts/verify_drift_levels.py [minor|moderate|high|critical]
"""
import argparse
import asyncio
import time
from dotenv import load_dotenv
from src.github.app import get_installation_client

INSTALLATION_ID = 105889743
REPO_NAME = "alexeykopachev/root"

# Unique ID for this run
UNIQUE_ID = int(time.time())

SCENARIOS = {
    "minor": {
        "title": f"Verify: Minor Drift (Docstring) {UNIQUE_ID}",
        "file": f"src/drift_minor_{UNIQUE_ID}.py",
        "old_content": 'def process_data(data):\n    """Process the input data."""\n    return data * 2',
        "new_content": 'def process_data(data):\n    """Process the input data with enhanced precision."""\n    return data * 2',
        "description": "Updates docstring only. Expected score: 5-15."
    },
    "moderate": {
        "title": f"Verify: Moderate Drift (Logic) {UNIQUE_ID}",
        "file": f"src/drift_moderate_{UNIQUE_ID}.py",
        "old_content": 'def calculate_score(val):\n    # Basic calculation\n    return val * 1.5',
        "new_content": 'def calculate_score(val):\n    # Adjusted multiplier\n    return val * 1.75',
        "description": "Updates internal logic. Expected score: 30-60."
    },
    "high": {
        "title": f"Verify: High Drift (Added Feature) {UNIQUE_ID}",
        "file": f"src/drift_high_{UNIQUE_ID}.py",
        "old_content": 'def base_feature():\n    return True',
        "new_content": 'def base_feature():\n    return True\n\ndef new_complex_feature(x, y):\n    """New feature implementation."""\n    return x + y * 2',
        "description": "Adds new meaningful entity. Expected score: 61-80."
    },
    "critical": {
        "title": f"Verify: Critical Drift (Breaking API) {UNIQUE_ID}",
        "file": f"src/drift_critical_{UNIQUE_ID}.py",
        "old_content": 'def api_endpoint(request):\n    return {"status": "ok"}',
        "new_content": 'def api_endpoint(request, api_key):\n    if not api_key:\n        raise ValueError("Missing key")\n    return {"status": "ok"}',
        "description": "Changes function signature (breaking). Expected score: 81-100."
    }
}

async def run_scenario(scenario_key: str):
    load_dotenv()
    if scenario_key not in SCENARIOS:
        print(f"Error: Unknown scenario '{scenario_key}'. Choose from: {list(SCENARIOS.keys())}")
        return

    scenario = SCENARIOS[scenario_key]
    client = await get_installation_client(INSTALLATION_ID)
    repo = client.get_repo(REPO_NAME)
    base_branch = repo.default_branch
    
    print(f"🚀 Launching Verification Scenario: {scenario_key.upper()}")
    print(f"📄 Using file: {scenario['file']}")
    print(f"🎯 Description: {scenario['description']}")

    # 1. Seed file to base branch
    print(f"🌱 Seeding base file to {base_branch}...")
    repo.create_file(
        path=scenario['file'],
        message=f"Seed {scenario_key} test",
        content=scenario['old_content'],
        branch=base_branch
    )
    
    # 2. Wait explicitly for propagation
    print("⏳ Waiting 15s for GitHub consistency...")
    await asyncio.sleep(15)
    
    # 3. Create feature branch from FRESH tip
    sb = repo.get_branch(base_branch)
    branch_name = f"verify-{scenario_key}-{UNIQUE_ID}"
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    
    # 4. Modify file
    print(f"✏️ Modifying file on {branch_name}...")
    contents = repo.get_contents(scenario['file'], ref=branch_name)
    repo.update_file(
        path=scenario['file'],
        message=f"Apply {scenario_key} drift",
        content=scenario['new_content'],
        sha=contents.sha,
        branch=branch_name
    )
    
    # 5. Create PR
    print("⏳ Waiting 2s before PR creation...")
    await asyncio.sleep(2)
    
    pr = repo.create_pull(
        title=scenario['title'],
        body=f"Verification run for {scenario_key} drift.\n{scenario['description']}",
        head=branch_name,
        base=base_branch
    )
    print(f"✅ PR Created: {pr.html_url}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("scenario", help="Drift scenario to verify")
    args = parser.parse_args()
    asyncio.run(run_scenario(args.scenario))
