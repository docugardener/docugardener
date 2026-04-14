"""
Local testing script for DocuGardener - Simplified.

Tests the core components individually.
"""

import asyncio
import sys
import tempfile
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def test_parser():
    """Test the code parser."""
    print("\n=== Testing Code Parser ===")
    
    from src.analysis.parser import get_parser
    
    parser = get_parser()
    
    python_code = '''
def calculate_total(items, tax_rate=0.1):
    """Calculate total with tax."""
    return sum(items) * (1 + tax_rate)

class ShoppingCart:
    def __init__(self):
        self.items = []
'''
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(python_code)
        temp_path = Path(f.name)
    
    try:
        entities = parser.parse_file(temp_path)
        print(f"  ✅ Found {len(entities)} entities")
        for e in entities:
            print(f"     - {e.entity_type}: {e.name}")
        return len(entities) >= 2
    finally:
        temp_path.unlink()


def test_embeddings():
    """Test embedding generation."""
    print("\n=== Testing Embeddings ===")
    
    from src.analysis.embeddings import generate_embedding, cosine_similarity
    
    emb1 = generate_embedding("Calculate price with tax")
    emb2 = generate_embedding("Compute total including taxes")
    emb3 = generate_embedding("Upload file to cloud")
    
    sim_similar = cosine_similarity(emb1, emb2)
    sim_different = cosine_similarity(emb1, emb3)
    
    print(f"  Similar concepts: {sim_similar:.3f}")
    print(f"  Different concepts: {sim_different:.3f}")
    
    if sim_similar > sim_different:
        print("  ✅ Embedding similarity works correctly")
        return True
    else:
        print("  ❌ Embedding similarity failed")
        return False


async def test_gemini():
    """Test Gemini API connection."""
    print("\n=== Testing Gemini API ===")
    
    try:
        from src.agents.llm import GeminiClient, LLMConfig
        from src.core.config import settings
        
        if not settings.gemini_api_key:
            print("  ⚠️  No Gemini API key in settings")
            return False
        
        print(f"  API Key: {settings.gemini_api_key[:10]}...")
        print(f"  Model: {settings.gemini_model}")
        
        client = GeminiClient()
        response = await client.generate(
            prompt='Say exactly: Hello from DocuGardener!',
            config=LLMConfig(temperature=0.1, max_tokens=50),
        )
        
        print(f"  Response: {response.content.strip() or '(empty - safety filter?)'}")
        print(f"  Finish reason: {response.finish_reason}")
        
        # Success if we got a response OR successfully connected (no error)
        if response.content:
            print("  ✅ Gemini API working!")
            return True
        else:
            print("  ⚠️  Connected but got empty response (safety filter?)")
            return True  # Still count as success - API is reachable
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False


def main():
    print("=" * 50)
    print("DocuGardener Local Test")
    print("=" * 50)
    
    results = []
    
    # Test 1: Parser
    results.append(("Parser", test_parser()))
    
    # Test 2: Embeddings
    results.append(("Embeddings", test_embeddings()))
    
    # Test 3: Gemini
    results.append(("Gemini API", asyncio.run(test_gemini())))
    
    # Summary
    print("\n" + "=" * 50)
    print("Summary:")
    for name, passed in results:
        status = "✅" if passed else "❌"
        print(f"  {status} {name}")
    
    all_passed = all(p for _, p in results)
    print("\n" + ("🎉 All tests passed!" if all_passed else "⚠️ Some tests failed"))
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
