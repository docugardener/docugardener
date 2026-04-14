import asyncio
import os
import sys

# Ensure src is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.storage.weaviate_db import WeaviateDB
from src.api.middleware import set_tenant_id, tenant_id_context
from src.storage.vectordb import DocumentRecord

async def test_multi_tenancy():
    print("🧪 Testing Multi-Tenancy Isolation...")
    
    db = WeaviateDB()
    await db.initialize()
    
    try:
        # 1. Test without context (should fail)
        print("\n1. Testing without context...")
        try:
            await db.search(query_vector=[0.1]*1536)
            print("❌ Error: Search succeeded without context!")
        except RuntimeError as e:
            print(f"✅ Success: Caught expected error: {e}")

        # 2. Test with Tenant A
        print("\n2. Testing with Tenant A...")
        set_tenant_id("tenant-a")
        record_a = DocumentRecord(id="doc-a", content="Content for A", vector=[0.1]*1536, metadata={})
        await db.upsert([record_a])
        
        results_a = await db.search(query_vector=[0.1]*1536)
        print(f"Found {len(results_a)} results for Tenant A")
        if any(r.id == "doc-a" for r in results_a):
            print("✅ Success: Found record for Tenant A")
        else:
            print("❌ Error: Could not find record for Tenant A")

        # 3. Test with Tenant B (should NOT see A)
        print("\n3. Testing with Tenant B...")
        set_tenant_id("tenant-b")
        results_b = await db.search(query_vector=[0.1]*1536)
        print(f"Found {len(results_b)} results for Tenant B")
        if any(r.id == "doc-a" for r in results_b):
            print("❌ Error: Tenant B saw record from Tenant A!")
        else:
            print("✅ Success: Tenant B is isolated from Tenant A")

    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(test_multi_tenancy())
