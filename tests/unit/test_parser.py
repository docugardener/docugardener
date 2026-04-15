"""Unit tests for the code parser."""

import pytest

from src.analysis.parser import (
    CodeEntity,
    CodeParser,
    SupportedLanguage,
    get_parser,
)


@pytest.fixture
def parser() -> CodeParser:
    """Create a code parser instance."""
    return CodeParser()


class TestLanguageDetection:
    """Tests for language detection from file paths."""

    def test_detect_python(self, parser: CodeParser):
        """Test Python file detection."""
        assert parser.detect_language("test.py") == SupportedLanguage.PYTHON
        assert parser.detect_language("/path/to/module.py") == SupportedLanguage.PYTHON

    def test_detect_javascript(self, parser: CodeParser):
        """Test JavaScript file detection."""
        assert parser.detect_language("app.js") == SupportedLanguage.JAVASCRIPT
        assert parser.detect_language("component.jsx") == SupportedLanguage.JAVASCRIPT
        assert parser.detect_language("module.mjs") == SupportedLanguage.JAVASCRIPT

    def test_detect_typescript(self, parser: CodeParser):
        """Test TypeScript file detection."""
        assert parser.detect_language("app.ts") == SupportedLanguage.TYPESCRIPT
        assert parser.detect_language("component.tsx") == SupportedLanguage.TYPESCRIPT

    def test_unsupported_extension(self, parser: CodeParser):
        """Test that unsupported extensions return None."""
        assert parser.detect_language("file.txt") is None
        assert parser.detect_language("file.java") is None
        assert parser.detect_language("Makefile") is None


class TestPythonParsing:
    """Tests for Python code parsing."""

    def test_parse_simple_function(self, parser: CodeParser):
        """Test parsing a simple Python function."""
        content = '''
def hello_world():
    """Say hello."""
    print("Hello, World!")
'''
        entities = parser.parse_content(content, "test.py", SupportedLanguage.PYTHON)

        assert len(entities) == 1
        entity = entities[0]
        assert entity.name == "hello_world"
        assert entity.entity_type == "function"
        assert entity.docstring == "Say hello."

    def test_parse_class_with_methods(self, parser: CodeParser):
        """Test parsing a Python class with methods."""
        content = '''
class Calculator:
    """A simple calculator."""
    
    def __init__(self, value=0):
        self.value = value
    
    def add(self, x):
        """Add x to the value."""
        self.value += x
        return self.value
'''
        entities = parser.parse_content(content, "test.py", SupportedLanguage.PYTHON)

        # Should find class + 2 methods
        assert len(entities) >= 1

        # Check class
        classes = [e for e in entities if e.entity_type == "class"]
        assert len(classes) == 1
        assert classes[0].name == "Calculator"

        # Check methods
        methods = [e for e in entities if e.entity_type == "method"]
        assert len(methods) >= 1

    def test_parse_function_with_type_hints(self, parser: CodeParser):
        """Test parsing function with type hints."""
        content = '''
def greet(name: str, times: int = 1) -> str:
    """Greet someone multiple times."""
    return (f"Hello, {name}! " * times).strip()
'''
        entities = parser.parse_content(content, "test.py", SupportedLanguage.PYTHON)

        assert len(entities) == 1
        entity = entities[0]
        assert entity.name == "greet"
        assert "str" in entity.signature or "name" in entity.signature


class TestJavaScriptParsing:
    """Tests for JavaScript code parsing."""

    def test_parse_function_declaration(self, parser: CodeParser):
        """Test parsing a JavaScript function declaration."""
        content = """
function greet(name) {
    console.log("Hello, " + name);
}
"""
        entities = parser.parse_content(content, "test.js", SupportedLanguage.JAVASCRIPT)

        assert len(entities) >= 1
        funcs = [e for e in entities if e.entity_type == "function"]
        assert any(f.name == "greet" for f in funcs)

    def test_parse_arrow_function(self, parser: CodeParser):
        """Test parsing an arrow function."""
        content = """
const add = (a, b) => {
    return a + b;
};
"""
        entities = parser.parse_content(content, "test.js", SupportedLanguage.JAVASCRIPT)

        assert len(entities) >= 1
        funcs = [e for e in entities if e.entity_type == "function"]
        assert any(f.name == "add" for f in funcs)

    def test_parse_class(self, parser: CodeParser):
        """Test parsing a JavaScript class."""
        content = """
class Person {
    constructor(name) {
        this.name = name;
    }
    
    greet() {
        console.log("Hello, " + this.name);
    }
}
"""
        entities = parser.parse_content(content, "test.js", SupportedLanguage.JAVASCRIPT)

        classes = [e for e in entities if e.entity_type == "class"]
        assert len(classes) >= 1
        assert classes[0].name == "Person"


class TestCodeEntity:
    """Tests for CodeEntity dataclass."""

    def test_qualified_name_no_parent(self):
        """Test qualified name without parent."""
        entity = CodeEntity(
            name="my_func",
            entity_type="function",
            file_path="test.py",
            start_line=1,
            end_line=5,
            content="def my_func(): pass",
        )
        assert entity.qualified_name == "my_func"

    def test_qualified_name_with_parent(self):
        """Test qualified name with parent class."""
        entity = CodeEntity(
            name="my_method",
            entity_type="method",
            file_path="test.py",
            start_line=5,
            end_line=10,
            content="def my_method(self): pass",
            parent="MyClass",
        )
        assert entity.qualified_name == "MyClass.my_method"

    def test_line_count(self):
        """Test line count calculation."""
        entity = CodeEntity(
            name="func",
            entity_type="function",
            file_path="test.py",
            start_line=10,
            end_line=25,
            content="...",
        )
        assert entity.line_count == 16


class TestGetParser:
    """Tests for singleton parser access."""

    def test_get_parser_returns_instance(self):
        """Test that get_parser returns a CodeParser."""
        parser = get_parser()
        assert isinstance(parser, CodeParser)

    def test_get_parser_returns_same_instance(self):
        """Test that get_parser returns the same instance."""
        parser1 = get_parser()
        parser2 = get_parser()
        assert parser1 is parser2
