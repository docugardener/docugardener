
import os
import shutil
import time
import jwt
from datetime import datetime
from dotenv import load_dotenv
from github import Auth, GithubIntegration
from git import Repo, Actor

load_dotenv()

# Configuration
APP_ID = os.environ["GITHUB_APP_ID"]
PRIVATE_KEY_PATH = os.environ["GITHUB_PRIVATE_KEY_PATH"]
REPO_NAME = "alexeykopachev/root"
TARGET_DIR = "/tmp/test_repo_clone"

def get_jwt_token(app_id, private_key_path):
    with open(private_key_path, 'r') as f:
        private_key = f.read()
    
    payload = {
        "iat": int(time.time()) - 60,
        "exp": int(time.time()) + (10 * 60),
        "iss": app_id,
    }
    return jwt.encode(payload, private_key, algorithm="RS256")

def main():
    print(f"🚀 Starting E2E Test for {REPO_NAME}")
    
    # Authenticate as App to find installation
    jwt_token = get_jwt_token(APP_ID, PRIVATE_KEY_PATH)
    auth = Auth.AppAuth(int(APP_ID), open(PRIVATE_KEY_PATH, 'r').read())
    gi = GithubIntegration(auth=auth)
    
    # Get installation
    print("🔍 Finding installation...")
    installation = gi.get_repo_installation("alexeykopachev", "root")
    print(f"✅ Found installation ID: {installation.id}")
    
    # Get access token
    token_obj = gi.get_access_token(installation.id)
    token = token_obj.token
    print(f"🔑 Generated installation token (Permissions: {token_obj.permissions})")
    print(f"   Repositories: {[r.name for r in token_obj.repositories] if token_obj.repositories else 'All'}")
    
    # Clone Repo
    if os.path.exists(TARGET_DIR):
        shutil.rmtree(TARGET_DIR)
    
    clone_url = f"https://x-access-token:{token}@github.com/{REPO_NAME}.git"
    print(f"📥 Cloning to {TARGET_DIR}...")
    repo = Repo.clone_from(clone_url, TARGET_DIR)
    
    # Create Branch
    branch_name = f"test-docugardener-{int(time.time())}"
    
    # Handle empty repo
    if not repo.heads:
        print("Empty repo detected. Creating initial commit.")
        readme_path = os.path.join(TARGET_DIR, "README.md")
        with open(readme_path, "w") as f:
            f.write("# Root Repo\n\nInitial content.")
        repo.index.add([readme_path])
        author = Actor("DocuGardener Bot", "bot@docugardener.com")
        repo.index.commit("Initial commit", author=author, committer=author)
        # Rename default branch to main
        repo.git.branch("-M", "main")
        origin = repo.remote(name='origin')
        origin.push("main")
        
    new_branch = repo.create_head(branch_name)
    new_branch.checkout()
    print(f"🌿 Created branch: {branch_name}")
    
    # Add Files
    code_file = os.path.join(TARGET_DIR, "math_utils.py")
    doc_file = os.path.join(TARGET_DIR, "docs.md")
    
    with open(code_file, "w") as f:
        f.write("def add(a, b):\n    return a + b\n")
        
    with open(doc_file, "w") as f:
        f.write("# Math Utils\n\nThis module provides basic math functions.\n")
        
    repo.index.add([code_file, doc_file])
    
    # Commit
    author = Actor("DocuGardener Bot", "bot@docugardener.com")
    repo.index.commit("Add math_utils and docs for testing", author=author, committer=author)
    print("Oc Committed changes")
    
    # Push
    print("Pc Pushing changes...")
    origin = repo.remote(name='origin')
    origin.push(branch_name)
    
    # Create PR via API (using PyGithub client)
    # We need to re-init Github client with installation token to act as the installation
    from github import Github
    gh = Github(auth=Auth.Token(token))
    gh_repo = gh.get_repo(REPO_NAME)
    
    print(f"cS Creating Pull Request against {gh_repo.default_branch}...")
    pr = gh_repo.create_pull(
        title=f"Test PR {datetime.now().isoformat()}",
        body="This is an automated test PR to verify DocuGardener deployment.",
        head=branch_name,
        base=gh_repo.default_branch
    )
    
    print(f"🎉 PR Created: {pr.html_url}")
    
    # Trigger a new event by closing and reopening
    time.sleep(2)
    print("🔄 Closing and reopening PR to trigger webhook (just in case)...")
    pr.edit(state="closed")
    time.sleep(2)
    pr.edit(state="open")
    print("✅ PR Reopened. Check logs.")

if __name__ == "__main__":
    main()
