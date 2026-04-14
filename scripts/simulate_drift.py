
import asyncio
import json
import os
import sys
from pathlib import Path
from dataclasses import dataclass
from src.analysis.parser import CodeParser, CodeEntity, SupportedLanguage
from src.agents.llm import create_llm_client, LLMProvider
from src.analysis.diff import SemanticDiff, EntityChange, ChangeType
from src.agents.verifier import VerificationAgent
from src.analysis.scorer import DriftScorer

@dataclass
class Scenario:
    name: str
    file_path: str
    old_code: str
    new_code: str

SCENARIOS = [
    Scenario(
        name="Simple Constant Change",
        file_path="src/config.py",
        old_code="TIMEOUT = 30\n\ndef get_val():\n    return 42\n",
        new_code="TIMEOUT = 60\n\ndef get_val():\n    return 42\n",
    ),
    Scenario(
        name="Internal Function Addition",
        file_path="src/utils.py",
        old_code="def public_api():\n    return _internal()\n\ndef _internal():\n    return 1",
        new_code="def public_api():\n    return _internal() + _helper()\n\ndef _internal():\n    return 1\n\ndef _helper():\n    return 2",
    ),
    Scenario(
        name="API Signature Change (Public)",
        file_path="src/api.py",
        old_code="def connect(host, port):\n    \"\"\"Docstring.\"\"\"\n    pass",
        new_code="def connect(connection_string, timeout=30):\n    # Documentation removed!\n    pass",
    ),
    Scenario(
        name="Docstring-only Update",
        file_path="src/logic.py",
        old_code="def calc():\n    \"\"\"Old docs.\"\"\"\n    return 1",
        new_code="def calc():\n    \"\"\"New updated documentation and refined logic description.\"\"\"\n    return 1",
    ),
    Scenario(
        name="Private API Refactor",
        file_path="src/hidden.py",
        old_code="def _private_func(a, b):\n    return a + b",
        new_code="def _private_func(a, b, c=0):\n    # Private signature changed\n    return a + b + c",
    ),
    Scenario(
        name="Large Feature Addition",
        file_path="src/processor.py",
        old_code="def process(data):\n    return data",
        new_code="""
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
        """
    )
]

async def run_simulation(provider_name: str = "gemini", model_name: str | None = None):
    provider = LLMProvider(provider_name)
    llm_client = create_llm_client(provider=provider, model=model_name)
    
    parser = CodeParser()
    diff_tool = SemanticDiff(parser)
    agent = VerificationAgent(generator_client=llm_client)
    
    print(f"🧪 Starting Headless Drift Simulation ({provider_name.upper()})\n" + "="*40)
    
    log_filename = f"drift_simulation_{provider_name}_log.txt"
    log_file = Path(log_filename)
    with open(log_file, "w") as f:
        f.write(f"=== Drift Scoring Alignment Log ({provider_name.upper()}) ===\n\n")

    for scenario in SCENARIOS:
        print(f"▶️ Running: {scenario.name}...")
        
        # 1. Parse and Diff
        lang = parser.detect_language(scenario.file_path) or SupportedLanguage.PYTHON
        old_entities = parser.parse_content(scenario.old_code, scenario.file_path, lang)
        new_entities = parser.parse_content(scenario.new_code, scenario.file_path, lang)
        
        changes = diff_tool.compare_entities(old_entities, new_entities, lang.value)
        meaningful = diff_tool.filter_meaningful_changes(changes)
        
        # 2. Score and Analyze
        if not meaningful:
            print(f"ℹ️ No meaningful changes for {scenario.name}\n")
            continue
            
        analysis = await agent.analyze_drift(meaningful, doc_status="(Simulated)")
        
        # 3. Log results
        result_text = f"Scenario: {scenario.name}\n"
        result_text += f"Calculated Score: {DriftScorer.calculate_score(meaningful)}\n"
        result_text += f"Final Score (Verified): {analysis.drift_score}\n"
        result_text += f"Severity: {analysis.severity}\n"
        result_text += f"Summary: {analysis.summary}\n"
        result_text += "-"*20 + "\n"
        
        print(f"📊 Final Score: {analysis.drift_score} ({analysis.severity})")
        print(f"📝 Summary: {analysis.summary[:80]}...\n")
        
        with open(log_file, "a") as f:
            f.write(result_text)

    print(f"✅ Simulation complete. Results saved to {log_file}")

if __name__ == "__main__":
    provider = "gemini"
    model = None
    
    if len(sys.argv) > 1:
        provider = sys.argv[1]
    if len(sys.argv) > 2:
        model = sys.argv[2]
        
    asyncio.run(run_simulation(provider, model))
