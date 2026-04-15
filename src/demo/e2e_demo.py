# SPDX-License-Identifier: AGPL-3.0-or-later
"""
DocuGardener E2E Demo Script.
Runs the full pipeline manually to demonstrate intermediate artifacts.
"""

import asyncio
import json
from dataclasses import asdict
from pathlib import Path

from src.agents.verifier import VerificationAgent
from src.analysis.diff import SemanticDiff
from src.analysis.parser import CodeParser, SupportedLanguage
from src.core.logging import get_logger

logger = get_logger(__name__)

# Sample Code for Demo
OLD_CODE = """
def process_data(data):
    \"\"\"Process the input data list.\"\"\"
    result = [x * 2 for x in data]
    return result
"""

NEW_CODE = """
def process_data(data, scale=2):
    \"\"\"
    Process the input data list with an optional scale factor.
    
    Args:
        data: List of numbers
        scale: Factor to multiply by (default: 2)
    \"\"\"
    result = [x * scale for x in data]
    return result
"""


async def run_demo():
    print("🚀 Starting DocuGardener E2E Demo...")

    # 1. Parsing
    print("\n--- [Step 1: Parsing] ---")
    parser = CodeParser()
    old_entities = parser.parse_content(OLD_CODE, "demo.py", SupportedLanguage.PYTHON)
    new_entities = parser.parse_content(NEW_CODE, "demo.py", SupportedLanguage.PYTHON)
    print(f"✅ Extracted {len(new_entities)} entities from updated code.")

    # 2. Semantic Diffing
    print("\n--- [Step 2: Semantic Diffing] ---")
    diff = SemanticDiff(parser)
    changes = diff.compare_entities(old_entities, new_entities)
    change = changes[0]
    print(f"✅ Detected Change: {change.change_type.value}")
    print(f"🔍 Details: {json.dumps(change.details, indent=2)}")

    # 3. RAG Verification (Simulated with Agent)
    print("\n--- [Step 3: RAG Analysis] ---")
    agent = VerificationAgent()

    # Note: We simulate the "Retrieved Docs" since we aren't running vector DB search here
    related_docs_mock = []

    print("🤖 Generating and Verifying Documentation Draft...")
    draft = await agent.generate_documentation(
        change=change,
        existing_docs="process_data(data): Processes data.",
        related_docs=related_docs_mock,
    )

    print(f"📝 Draft Content:\n{draft.content}")
    print(f"⚖️ Verification Verdict: {draft.verification.verdict}")
    print(f"🎯 Confidence: {draft.verification.confidence}")

    # 4. Drift Analysis
    print("\n--- [Step 4: Drift Analysis] ---")
    analysis = await agent.analyze_drift(changes, "Basic processing docs exist.")
    print(f"⚠️ Drift Score: {analysis.drift_score} ({analysis.severity})")
    print(f"🏛️ Block Merge: {analysis.block_merge}")
    print(f"📖 Summary: {analysis.summary}")

    # Save artifacts for the walkthrough
    demo_artifacts = {
        "step_1_parser_results": [asdict(e) for e in new_entities],
        "step_2_semantic_diff": {"type": change.change_type.value, "details": change.details},
        "step_3_documentation_draft": {
            "content": draft.content,
            "verification": asdict(draft.verification),
        },
        "step_4_drift_analysis": asdict(analysis),
    }

    artifacts_path = Path("build/demo_artifacts.json")
    artifacts_path.parent.mkdir(exist_ok=True)
    with open(artifacts_path, "w") as f:
        json.dump(demo_artifacts, f, indent=2)

    print(f"\n✅ Demo Complete! Artifacts saved to {artifacts_path}")


if __name__ == "__main__":
    # Ensure env is loaded
    from dotenv import load_dotenv

    load_dotenv()
    asyncio.run(run_demo())
