import asyncio
import os
import sys
import uuid

# Ensure src is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.agents.verifier import VerificationAgent
from src.api.middleware import set_tenant_id
from src.pipeline.job_manager import SessionLocal
from src.storage.sql_models import PromptConfig, Tenant


async def test_prompt_playground():
    print("🧪 Testing Prompt Playground...")

    # Setup test tenant and prompt
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:6]}"
    session = SessionLocal()
    try:
        tenant = Tenant(id=tenant_id, githubOrgId=tenant_id, name="Test Tenant")
        session.add(tenant)
        session.commit()

        # Override generator prompt to be "Pirate Mode"
        pirate_prompt = (
            "You are a pirate documentation assistant. Use 'Arrr' and 'Matey' in every response."
        )
        config = PromptConfig(
            id=str(uuid.uuid4()),
            tenantId=tenant_id,
            key="GENERATOR_SYSTEM_PROMPT",
            content=pirate_prompt,
        )
        session.add(config)
        session.commit()

        # Establish context
        set_tenant_id(tenant_id)

        # Initialize agent
        agent = VerificationAgent()

        # Test: We won't actually call the LLM because it needs API keys,
        # but we can verify that the AGENT uses the correct system prompt
        # when we mock the generator.

        from unittest.mock import AsyncMock

        agent.generator.generate = AsyncMock(
            return_value=type("obj", (object,), {"content": "Arrr, here be your docs."})
        )

        from src.analysis.diff import ChangeType, EntityChange
        from src.analysis.parser import CodeEntity

        entity = CodeEntity("test", "function", "test.py", 1, 1, "def test(): pass")
        change = EntityChange(entity=entity, change_type=ChangeType.ADDED, new_content="...")

        print(f"\nTesting prompt retrieval for {tenant_id}...")
        await agent.generate_documentation(change)

        # Check all calls to verify our custom prompt was used
        calls = agent.generator.generate.call_args_list
        print(f"Total LLM calls: {len(calls)}")

        # The first call should be the Generator with our pirate prompt
        first_call_sys_prompt = calls[0][1].get("system_prompt")

        if first_call_sys_prompt == pirate_prompt:
            print(f"✅ Success: First call used custom prompt: '{first_call_sys_prompt}'")
        else:
            print(f"❌ Error: First call expected pirates, but got:\n{first_call_sys_prompt}")

        # The second call (verification) should have been the default Verifier prompt
        second_call_sys_prompt = calls[1][1].get("system_prompt")
        if "strict documentation verification agent" in second_call_sys_prompt:
            print("✅ Success: Second call used default Verifier prompt")
        else:
            print(
                f"❌ Error: Second call expected default verifier prompt, but got:\n{second_call_sys_prompt}"
            )

    finally:
        session.close()


if __name__ == "__main__":
    asyncio.run(test_prompt_playground())
