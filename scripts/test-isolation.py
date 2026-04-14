
import asyncio
import os
from src.core.config import settings
from src.storage.factory import create_vector_db
from src.worker.context import get_tenant_context, TenantContext
from src.storage.vectordb import DocumentRecord
import numpy as np
import uuid

# Mock Settings for Testing
os.environ["SQL_DATABASE_URL"] = settings.sql_database_url # Ensure it's passed if script runs standalone
# ENCRYPTION_KEY must be set in env

async def test_isolation():
    print("🔒 Testing Weaviate Multi-Tenancy Isolation...")
    
    # Init DB
    db = await create_vector_db()
    
    # Data Setup
    tenant_a = "tenant_a_123"
    tenant_b = "tenant_b_456"
    
    vector_a = np.random.rand(384).tolist() # dimension depends on model, using default
    # Note: Weaviate implementation currently has vectorizer=none, so we provide vectors.
    # In real app we generate them. Here we use random for structure test.
    
    print(f"1. Inserting detailed secret into Tenant A ({tenant_a})...")
    await db.upsert(
        records=[
            DocumentRecord(
                id="secret-doc",
                content="This is a secret document for Tenant A",
                metadata={"file_path": "top_secret.md", "doc_type": "documentation"},
                vector=vector_a
            )
        ],
        namespace=tenant_a
    )
    
    print(f"2. Querying Tenant B ({tenant_b})... Should be empty.")
    # We query with the EXACT SAME VECTOR to check if it matches
    results_b = await db.search(
        query_vector=vector_a,
        namespace=tenant_b,
        top_k=5
    )
    
    if len(results_b) == 0:
        print("✅ Tenant B saw 0 results. Isolation Confirmed!")
    else:
        print(f"❌ LEAK DETECTED! Tenant B saw: {results_b}")
        exit(1)
        
    print(f"3. Querying Tenant A ({tenant_a})... Should find doc.")
    results_a = await db.search(
        query_vector=vector_a,
        namespace=tenant_a,
        top_k=5
    )
    
    if len(results_a) > 0 and results_a[0].content == "This is a secret document for Tenant A":
        print("✅ Tenant A found the secret doc.")
    else:
        print(f"❌ Tenant A could NOT find its own doc. Result: {results_a}")
        exit(1)

    # Cleanup
    await db.delete_namespace(tenant_a)
    await db.delete_namespace(tenant_b) # attempt to delete even if empty
    await db.close()

if __name__ == "__main__":
    asyncio.run(test_isolation())
