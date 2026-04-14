# SPDX-License-Identifier: AGPL-3.0-or-later
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from src.pipeline.job_manager import get_db
from src.storage.sql_models import Tenant
from src.github.app import get_installation_token, get_github_client
from src.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.get("/{owner}/{repo}/contents/{file_path:path}")
def get_repo_file_contents(
    owner: str,
    repo: str,
    file_path: str,
    ref: str = Query(..., description="Commit SHA or branch name"),
    tenant_id: str = "default",  # Default tenant for now
    db: Session = Depends(get_db)
):
    """
    Fetch the raw contents of a file directly from GitHub for the 'Live Blocks' frontend feature.
    Ensures safe proxying without exposing installation tokens to the client.
    """
    logger.info("Fetching raw file content", repo=f"{owner}/{repo}", file=file_path, ref=ref)
    
    # -------------------------------------------------------------
    # DEMO SANDBOX FALLBACK
    # Allows the /dashboard/components page to function without 
    # a local GitHub App installation.
    # -------------------------------------------------------------
    if owner == "DocuGardener" and repo == "docugardener-demo":
        return {
            "path": file_path,
            "ref": ref,
            "content": f"// Mocked code for {file_path} @ {ref}\nexport function DemoComponent() {{\n    console.log('Live blocks are working!');\n    return <div className=\"synced\">Demo</div>;\n}}"
        }

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant or not tenant.githubOrgId:
        raise HTTPException(status_code=400, detail="Tenant lacks GitHub installation.")
        
    try:
        installation_id = int(tenant.githubOrgId)
        token = get_installation_token(installation_id)
        client = get_github_client(token)
        
        gh_repo = client.get_repo(f"{owner}/{repo}")
        file_content = gh_repo.get_contents(file_path, ref=ref)
        
        # PyGithub returns a ContentFile list if the path is a directory, but a single object if it's a file
        if isinstance(file_content, list):
             raise HTTPException(status_code=400, detail="Path points to a directory, not a file.")
             
        decoded_content = file_content.decoded_content.decode("utf-8")
        
        return {
            "path": file_path,
            "ref": ref,
            "content": decoded_content
        }
    except Exception as e:
        logger.error("Failed to fetch repo contents", error=str(e))
        raise HTTPException(status_code=500, detail=f"GitHub API Error: {str(e)}")
