import logging
import structlog
import sys
import os
import json
import asyncio
import re

# Ensure src is in path if running directly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

logging.basicConfig(stream=sys.stderr, level=logging.INFO)
structlog.configure(
    logger_factory=structlog.PrintLoggerFactory(sys.stderr),
)

from src.agents.verifier import VerificationAgent, DriftAnalysis
from src.analysis.diff import EntityChange, ChangeType, SemanticDiff
from src.analysis.parser import CodeEntity, get_parser, SupportedLanguage
from src.api.middleware import set_tenant_id

def parse_unified_diff(diff_text: str):
    """Robust parser for unified diff to extract old and new content."""
    old_lines = []
    new_lines = []
    
    lines = diff_text.splitlines()
    # Check for actual prefixes
    has_minus = any(l.startswith('-') for l in lines if not l.startswith('---'))
    has_plus = any(l.startswith('+') for l in lines if not l.startswith('+++'))
    
    if (not has_minus or not has_plus) and re.search(r'^@@', diff_text, re.MULTILINE):
        # Clean the block of common unified diff headers first
        clean_lines = [l for l in lines if not l.startswith(('---', '+++', '@@'))]
        
        # Lazy diff detection: try to split by function/class definitions
        defs = [i for i, l in enumerate(clean_lines) if re.match(r'^\s*(def|class|function|export|async)\s+', l)]
        if len(defs) >= 2:
            split_idx = defs[1]
            return "\n".join(clean_lines[:split_idx]), "\n".join(clean_lines[split_idx:])
        
        return None, "\n".join(clean_lines)

    # Standard diff parsing
    for line in lines:
        if line.startswith('---') or line.startswith('+++') or line.startswith('@@'):
            continue
        if line.startswith('-'):
            old_lines.append(line[1:])
        elif line.startswith('+'):
            new_lines.append(line[1:])
        else:
            old_lines.append(line)
            new_lines.append(line)
            
    return "\n".join(old_lines), "\n".join(new_lines)

async def simulate(diff_text: str, filename: str, tone: str = "Strict", tenant_id: str = "default"):
    # Set tenant context
    set_tenant_id(tenant_id)
    
    # 1. Parse diff if applicable
    old_content, new_content = parse_unified_diff(diff_text)
    
    # 2. Get parser for language detection
    parser = get_parser()
    lang = parser.detect_language(filename)
    dummy_path = "simulation.py" if not filename else filename
    
    # 3. Extract entities with language fallback
    diff_tool = SemanticDiff(parser)
    changes = []
    
    def try_parse(content, path, primary_lang):
        """Try parsing with primary language, fallback to common ones."""
        # Try primary first
        entities = parser.parse_content(content, path, primary_lang)
        if entities:
            return entities, primary_lang
            
        # Fallback loop
        for l in [SupportedLanguage.PYTHON, SupportedLanguage.TYPESCRIPT, SupportedLanguage.JAVASCRIPT]:
            if l == primary_lang:
                continue
            entities = parser.parse_content(content, path, l)
            if entities:
                return entities, l
        return [], primary_lang

    if old_content and old_content != new_content:
        old_entities, _ = try_parse(old_content, dummy_path, lang)
        new_entities, actual_lang = try_parse(new_content, dummy_path, lang)
        
        changes = diff_tool.compare_entities(old_entities, new_entities, actual_lang.value if actual_lang else "python")
        meaningful = diff_tool.filter_meaningful_changes(changes)
        
        if meaningful:
            change_list = meaningful
        else:
            # Fallback if no semantic change detected (e.g. only comments)
            change_list = [EntityChange(
                entity=new_entities[0] if new_entities else CodeEntity("sim", "function", dummy_path, 1, 1, new_content),
                change_type=ChangeType.COSMETIC,
                old_content=old_content,
                new_content=new_content
            )]
    else:
        # Just new code provided - treat as ADDED
        new_entities, actual_lang = try_parse(new_content, dummy_path, lang)
        fallback_name = "snippet"
        name_match = re.search(r'(?:def|class|function)\s+([a-zA-Z_][a-zA-Z0-9_]*)', new_content)
        if name_match:
            fallback_name = name_match.group(1)

        entity = new_entities[0] if new_entities else CodeEntity(
            name=fallback_name,
            entity_type="function",
            file_path=dummy_path,
            start_line=1,
            end_line=len(new_content.splitlines()), 
            content=new_content,
            signature=f"def {fallback_name}():",
            docstring=None
        )
        change_list = [EntityChange(
            entity=entity,
            change_type=ChangeType.ADDED,
            old_content="",
            new_content=new_content,
            details={"simulation": True}
        )]
    
    # 3. Initialize Verifier
    agent = VerificationAgent(tone=tone)
    
    # 4. Analyze Drift
    result: DriftAnalysis = await agent.analyze_drift(
        changes=change_list,
        doc_status="(Simulation)"
    )
    
    # Format output
    output = {
        "score": result.drift_score,
        "analysis": result.summary,
        "reasoning": f"Simulation processed by VerificationAgent (Type: {result.severity})."
    }
    
    return output

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)
            
        data = json.loads(input_data)
        diff = data.get("diff", "")
        filename = data.get("filename", "example.py")
        tone = data.get("tone", "Strict")
        tenant_id = data.get("tenantId", "default")
        
        # Run simulation
        result = asyncio.run(simulate(diff, filename, tone, tenant_id))
        print(json.dumps(result))
        
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(error_msg, file=sys.stderr)
        print(json.dumps({"error": str(e), "traceback": error_msg}))
        sys.exit(1)
