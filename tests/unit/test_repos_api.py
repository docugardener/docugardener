from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.main import app
from src.storage.sql_models import Base, Tenant

# Setup test DB
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


def test_get_repo_file_contents_success(db_session):
    # Setup Tenant
    tenant = Tenant(id="tenant-123", githubOrgId="12345", name="Test Org")
    db_session.add(tenant)
    db_session.commit()

    # Override get_db dependency
    from src.pipeline.job_manager import get_db

    app.dependency_overrides[get_db] = lambda: db_session

    client = TestClient(app)

    with (
        patch("src.api.repos.get_installation_token") as mock_get_token,
        patch("src.api.repos.get_github_client") as mock_get_client,
    ):
        mock_get_token.return_value = "mock_token"

        mock_gh = MagicMock()
        mock_repo = MagicMock()
        mock_content = MagicMock()

        mock_content.decoded_content = b"console.log('Hello World');"
        mock_repo.get_contents.return_value = mock_content
        mock_gh.get_repo.return_value = mock_repo
        mock_get_client.return_value = mock_gh

        response = client.get(
            "/repos/TestOwner/TestRepo/contents/src/index.js?ref=main&tenant_id=tenant-123",
            headers={"X-Tenant-ID": "tenant-123"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["path"] == "src/index.js"
        assert data["ref"] == "main"
        assert data["content"] == "console.log('Hello World');"

        # Verify Github API was called correctly
        mock_gh.get_repo.assert_called_once_with("TestOwner/TestRepo")
        mock_repo.get_contents.assert_called_once_with("src/index.js", ref="main")

    # Clean up override
    app.dependency_overrides.clear()
