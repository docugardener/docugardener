"""
DocuGardener Live Demo Trigger.
Pushes a signature change to the target repo to showcase real PR feedback.
"""

import os
import time
import uuid
from github import Github
from dotenv import load_dotenv

def trigger_demo():
    load_dotenv()
    
    token = os.getenv("GITHUB_TOKEN") # Uses the user's personal token if available, or app token
    repo_name = "alexeykopachev/root"
    
    print(f"🚀 Triggering Live Demo for {repo_name}...")
    
    # We'll use the Skill's utility if possible or just raw Github
    # Since I don't want to rely on tokens that might not be in .env, 
    # I'll check if I can use the same logic as run_cycle.py
    
    from src.github.app import get_installation_client
    installation_id = 105889743
    
    import asyncio
    
    async def run():
        client = await get_installation_client(installation_id)
        repo = client.get_repo(repo_name)
        
        # 1. Create a new branch
        branch_name = f"demo-signature-change-{int(time.time())}"
        base_branch = repo.default_branch
        sb = repo.get_branch(base_branch)
        repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
        print(f"🌿 Created branch: {branch_name}")
        
        # 2. Modify a file (adding a parameter to a dummy function)
        file_path = "src/math_utils.py"
        
        content = '''
def calculate_total(prices):
    """Calculate total price of items."""
    return sum(prices)
'''
        # New version with 'tax' parameter
        new_content = '''
def calculate_total(prices, tax_rate=0.0):
    """
    Calculate total price of items with an optional tax rate.
    
    Args:
        prices: List of floats
        tax_rate: Float representing tax (e.g., 0.05 for 5%)
    """
    total = sum(prices)
    return total * (1 + tax_rate)
'''
        try:
            # Check if file exists, if not create it
            try:
                contents = repo.get_contents(file_path, ref=branch_name)
                repo.update_file(
                    path=file_path,
                    message="DocuGardener Demo: Change function signature",
                    content=new_content,
                    sha=contents.sha,
                    branch=branch_name
                )
            except:
                repo.create_file(
                    path=file_path,
                    message="DocuGardener Demo: Add math_utils with signature change",
                    content=new_content,
                    branch=branch_name
                )
            
            print(f"📝 Committed signature change to {file_path}")
            
            # 3. Create PR
            pr = repo.create_pull(
                title="DocuGardener Live Demo: API Signature Change",
                body="This PR demonstrates DocuGardener's ability to detect semantic drift when a function signature changes.\n\n### Changes:\n- Added `tax_rate` parameter to `calculate_total`.",
                head=branch_name,
                base=base_branch
            )
            print(f"🎉 PR Created: {pr.html_url}")
            return pr.html_url
            
        except Exception as e:
            print(f"❌ Error: {e}")
            return None

    return asyncio.run(run())

if __name__ == "__main__":
    trigger_demo()
