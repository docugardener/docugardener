# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Tree-sitter based code parsing for multiple languages.

Provides language-agnostic AST parsing for extracting code entities
like functions, classes, and methods.
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import re
import tree_sitter
from tree_sitter import Language, Parser

from src.core.logging import get_logger

logger = get_logger(__name__)


class SupportedLanguage(Enum):
    """Supported programming languages for parsing."""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    HTML = "html"
    CSS = "css"


# Language-specific node types for entity extraction
ENTITY_NODE_TYPES: dict[SupportedLanguage, dict[str, list[str]]] = {
    SupportedLanguage.PYTHON: {
        "function": ["function_definition"],
        "class": ["class_definition"],
        "method": ["function_definition"],  # Methods are functions inside classes
    },
    SupportedLanguage.JAVASCRIPT: {
        "function": ["function_declaration", "arrow_function", "function"],
        "class": ["class_declaration"],
        "method": ["method_definition"],
    },
    SupportedLanguage.TYPESCRIPT: {
        "function": ["function_declaration", "arrow_function", "function"],
        "class": ["class_declaration"],
        "method": ["method_definition"],
    },
}

# File extension to language mapping
EXTENSION_LANGUAGE_MAP: dict[str, SupportedLanguage] = {
    ".py": SupportedLanguage.PYTHON,
    ".js": SupportedLanguage.JAVASCRIPT,
    ".jsx": SupportedLanguage.JAVASCRIPT,
    ".ts": SupportedLanguage.TYPESCRIPT,
    ".tsx": SupportedLanguage.TYPESCRIPT,
    ".mjs": SupportedLanguage.JAVASCRIPT,
    ".cjs": SupportedLanguage.JAVASCRIPT,
    ".html": SupportedLanguage.HTML,
    ".htm": SupportedLanguage.HTML,
    ".css": SupportedLanguage.CSS,
}


@dataclass
class CodeEntity:
    """
    Represents a code entity (function, class, method) extracted from source.
    
    Attributes:
        name: Entity name (e.g., function name)
        entity_type: Type of entity (function, class, method)
        file_path: Path to source file
        start_line: Starting line number (1-indexed)
        end_line: Ending line number (1-indexed)
        content: Full source code of the entity
        signature: Function/method signature if applicable
        parent: Parent entity name (e.g., class name for methods)
        docstring: Extracted docstring if present
    """
    name: str
    entity_type: str
    file_path: str
    start_line: int
    end_line: int
    content: str
    signature: str = ""
    parent: str | None = None
    docstring: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    
    @property
    def qualified_name(self) -> str:
        """Get fully qualified name including parent."""
        if self.parent:
            return f"{self.parent}.{self.name}"
        return self.name
    
    @property
    def is_public(self) -> bool:
        """Heuristic to determine if entity is public-facing."""
        # Python/JS/TS convention: leading underscore means private
        if self.name.startswith("_") and not (self.name.startswith("__") and self.name.endswith("__")):
            return False
        
        # Check parent visibility if it's a method
        # (Actually, we'll keep it simple for now: if name is _, it's internal)
        return True

    @property
    def line_count(self) -> int:
        """Number of lines in this entity."""
        return self.end_line - self.start_line + 1


class CodeParser:
    """
    Multi-language code parser using tree-sitter.
    
    Extracts structured information about functions, classes, and methods
    from source code files.
    """
    
    def __init__(self):
        """Initialize parser with language support."""
        self._parsers: dict[SupportedLanguage, Parser] = {}
        self._languages: dict[SupportedLanguage, Language] = {}
        self._init_languages()
    
    def _init_languages(self) -> None:
        """Initialize tree-sitter languages using official packages."""
        logger.info("Initializing tree-sitter language bindings")
        
        try:
            import tree_sitter_python
            self._languages[SupportedLanguage.PYTHON] = Language(tree_sitter_python.language())
            logger.debug("Loaded tree-sitter-python")
        except ImportError:
            logger.warning("tree-sitter-python not installed, falling back to regex")
            
        try:
            import tree_sitter_javascript
            self._languages[SupportedLanguage.JAVASCRIPT] = Language(tree_sitter_javascript.language())
            logger.debug("Loaded tree-sitter-javascript")
        except ImportError:
            logger.warning("tree-sitter-javascript not installed, falling back to regex")
            
        try:
            import tree_sitter_typescript
            # TypeScript package usually provides both typescript and tsx
            self._languages[SupportedLanguage.TYPESCRIPT] = Language(tree_sitter_typescript.language_typescript())
            logger.debug("Loaded tree-sitter-typescript")
        except (ImportError, AttributeError):
            logger.warning("tree-sitter-typescript not installed or incompatible, falling back to regex")
    
    def _get_parser(self, language: SupportedLanguage) -> Parser | None:
        """Get or create parser for a language."""
        if language in self._parsers:
            return self._parsers[language]
        
        if language not in self._languages:
            return None
            
        # Create new parser
        try:
            parser = Parser(self._languages[language])
            self._parsers[language] = parser
            return parser
        except Exception as e:
            logger.error("Failed to create parser", language=language.value, error=str(e))
            return None
    
    @staticmethod
    def detect_language(file_path: str | Path) -> SupportedLanguage | None:
        """
        Detect programming language from file extension.
        
        Args:
            file_path: Path to source file
            
        Returns:
            Detected language or None if unsupported
        """
        path = Path(file_path)
        ext = path.suffix.lower()
        return EXTENSION_LANGUAGE_MAP.get(ext)
    
    def parse_file(self, file_path: str | Path) -> list[CodeEntity]:
        """
        Parse a source file and extract all code entities.
        
        Args:
            file_path: Path to source file
            
        Returns:
            List of extracted code entities
        """
        path = Path(file_path)
        
        if not path.exists():
            logger.warning("File does not exist", file_path=str(path))
            return []
        
        language = self.detect_language(path)
        if not language:
            logger.debug("Unsupported file type", file_path=str(path))
            return []
        
        content = path.read_text(encoding="utf-8")
        return self.parse_content(content, str(path), language)
    
    def parse_content(
        self, 
        content: str, 
        file_path: str,
        language: SupportedLanguage
    ) -> list[CodeEntity]:
        """
        Parse source code content and extract entities.
        
        Args:
            content: Source code content
            file_path: Path for reference
            language: Programming language
            
        Returns:
            List of extracted code entities
        """
        entities: list[CodeEntity] = []
        lines = content.split("\n")
        
        # Try tree-sitter based extraction first
        parser = self._get_parser(language)
        if parser:
            try:
                entities = self._parse_with_tree_sitter(content, file_path, language, parser)
                if entities:
                    return entities
            except Exception as e:
                logger.warning("Tree-sitter parsing failed, falling back to regex", file=file_path, error=str(e))
        
        # Fallback to regex-based extraction
        if language == SupportedLanguage.PYTHON:
            entities = self._parse_python_simple(content, file_path, lines)
        elif language in (SupportedLanguage.JAVASCRIPT, SupportedLanguage.TYPESCRIPT):
            entities = self._parse_js_simple(content, file_path, lines)
        elif language == SupportedLanguage.HTML:
            entities = self._parse_html_simple(content, file_path, lines)
        elif language == SupportedLanguage.CSS:
            entities = self._parse_css_simple(content, file_path, lines)
        
        logger.info(
            "Parsed file",
            file_path=file_path,
            language=language.value,
            entity_count=len(entities),
            method="tree-sitter" if parser else "regex",
        )
        
        return entities

    def _parse_with_tree_sitter(
        self,
        content: str,
        file_path: str,
        language: SupportedLanguage,
        parser: Parser
    ) -> list[CodeEntity]:
        """Extract entities using tree-sitter AST with robust name resolution."""
        # tree-sitter uses BYTE offsets into the UTF-8 encoded source.
        # Index into content_bytes (not the unicode string) to avoid off-by-N
        # errors when docstrings contain multi-byte characters (–, →, ≤, …).
        content_bytes = content.encode("utf-8")
        tree = parser.parse(content_bytes)
        root_node = tree.root_node

        def _slice(start_byte: int, end_byte: int) -> str:
            return content_bytes[start_byte:end_byte].decode("utf-8", errors="replace")

        entities: list[CodeEntity] = []
        node_types = ENTITY_NODE_TYPES.get(language, {})

        # Flattened list of types to look for
        target_types = []
        for target_type_list in node_types.values():
            target_types.extend(target_type_list)

        def get_node_name(node):
            """Robustly extract name from a node or its context."""
            # 1. Direct field name
            name_node = node.child_by_field_name("name")
            if name_node:
                return _slice(name_node.start_byte, name_node.end_byte)

            # 2. Heuristic for Javascript arrow functions/assigned functions
            if node.type in ("arrow_function", "function") and node.parent:
                p = node.parent
                if p.type == "variable_declarator":
                    id_node = p.child_by_field_name("name")
                    if id_node:
                        return _slice(id_node.start_byte, id_node.end_byte)
                elif p.type == "assignment_expression":
                    left = p.child_by_field_name("left")
                    if left:
                        return _slice(left.start_byte, left.end_byte)

            return "anonymous"

        def traverse(node, current_class=None):
            if node.type in target_types:
                # Find which category this node belongs to
                entity_type = "unknown"
                for cat, types in node_types.items():
                    if node.type in types:
                        entity_type = cat
                        break

                # Check for method vs function specifically for Python/JS
                if entity_type == "function" and current_class:
                    entity_type = "method"

                name = get_node_name(node)

                # Start/End lines
                start_line = node.start_point.row + 1
                end_line = node.end_point.row + 1

                # Signature extraction (up to first block or 100 chars)
                node_content = _slice(node.start_byte, node.end_byte)
                signature = node_content.split("\n")[0].strip()
                # Clean up trailing braces/colons
                signature = re.sub(r'[\s{:]+$', '', signature)

                # Determine docstring (language specific)
                docstring = None
                if language == SupportedLanguage.PYTHON:
                    docstring = self._extract_python_ast_docstring(node, content_bytes)

                entities.append(CodeEntity(
                    name=name,
                    entity_type=entity_type,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    content=node_content,
                    signature=signature,
                    parent=current_class,
                    docstring=docstring
                ))

                # If it's a class, update current_class for child nodes
                next_class = name if entity_type == "class" else current_class
                for child in node.children:
                    traverse(child, next_class)
            else:
                for child in node.children:
                    traverse(child, current_class)

        traverse(root_node)
        return entities

    def _extract_python_ast_docstring(self, node: Any, content_bytes: bytes) -> str | None:
        """Helper to extract docstring from a Python node using AST structure."""
        body = node.child_by_field_name("body")
        if not body or not body.children:
            return None

        # Docstring is usually the first expression statement if it's a string
        first_child = body.children[0]
        if first_child.type == "expression_statement":
            string_node = first_child.children[0]
            if string_node.type == "string":
                doc = content_bytes[string_node.start_byte:string_node.end_byte].decode("utf-8", errors="replace")
                return doc.strip('"' + "'")
        return None
    
    def _parse_python_simple(
        self, 
        content: str, 
        file_path: str, 
        lines: list[str]
    ) -> list[CodeEntity]:
        """
        Simple Python parsing using regex patterns.
        
        This is a fallback until tree-sitter language bindings are configured.
        """
        import re
        
        entities: list[CodeEntity] = []
        
        # Pattern for class definitions
        class_pattern = re.compile(r'^class\s+(\w+)(?:\([^)]*\))?:')
        # Pattern for function/method definitions
        func_pattern = re.compile(r'^(\s*)def\s+(\w+)\s*\([^)]*\)(?:\s*->\s*[^:]+)?:')
        
        current_class: str | None = None
        current_class_indent = 0
        i = 0
        
        while i < len(lines):
            line = lines[i]
            stripped = line.lstrip()
            indent = len(line) - len(stripped)
            
            # Check for class definition
            class_match = class_pattern.match(stripped)
            if class_match:
                class_name = class_match.group(1)
                start_line = i + 1
                
                # Find class end
                end_line = self._find_block_end(lines, i, indent)
                class_content = "\n".join(lines[i:end_line])
                
                # Extract docstring
                docstring = self._extract_docstring(lines, i + 1)
                
                entities.append(CodeEntity(
                    name=class_name,
                    entity_type="class",
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    content=class_content,
                    signature=stripped.rstrip(":").strip(),
                    docstring=docstring,
                ))
                
                current_class = class_name
                current_class_indent = indent
                i += 1
                continue
            
            # Check for function/method definition
            func_match = func_pattern.match(line)
            if func_match:
                func_indent = len(func_match.group(1))
                func_name = func_match.group(2)
                start_line = i + 1
                
                # Find function end
                end_line = self._find_block_end(lines, i, func_indent)
                func_content = "\n".join(lines[i:end_line])
                
                # Extract docstring
                docstring = self._extract_docstring(lines, i + 1)
                
                # Determine if method or function
                is_method = current_class and func_indent > current_class_indent
                
                entities.append(CodeEntity(
                    name=func_name,
                    entity_type="method" if is_method else "function",
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    content=func_content,
                    signature=stripped.rstrip(":").strip(),
                    parent=current_class if is_method else None,
                    docstring=docstring,
                ))
            
            # Reset current class if we're back to module level
            if current_class and indent <= current_class_indent and stripped and not stripped.startswith("#"):
                if not class_pattern.match(stripped):
                    current_class = None
            
            i += 1
        
        return entities
    
    def _parse_js_simple(
        self, 
        content: str, 
        file_path: str, 
        lines: list[str]
    ) -> list[CodeEntity]:
        """
        Simple JavaScript/TypeScript parsing using regex patterns.
        """
        import re
        
        entities: list[CodeEntity] = []
        
        # Pattern for function declarations
        func_patterns = [
            re.compile(r'function\s+(\w+)\s*\([^)]*\)'),
            re.compile(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>'),
            re.compile(r'(?:const|let|var)\s+(\w+)\s*=\s*function'),
        ]
        
        # Pattern for class declarations
        class_pattern = re.compile(r'class\s+(\w+)(?:\s+extends\s+\w+)?')
        
        # Pattern for method definitions
        method_pattern = re.compile(r'^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*{')
        
        current_class: str | None = None
        brace_depth = 0
        class_start_depth = 0
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            
            # Track brace depth
            brace_depth += line.count("{") - line.count("}")
            
            # Check for class
            class_match = class_pattern.search(line)
            if class_match:
                class_name = class_match.group(1)
                entities.append(CodeEntity(
                    name=class_name,
                    entity_type="class",
                    file_path=file_path,
                    start_line=i + 1,
                    end_line=i + 1,  # Simplified - just mark start
                    content=line,
                    signature=f"class {class_name}",
                ))
                current_class = class_name
                class_start_depth = brace_depth
                continue
            
            # Check for methods inside class
            if current_class and brace_depth > class_start_depth:
                method_match = method_pattern.match(line)
                if method_match:
                    method_name = method_match.group(1)
                    if method_name not in ("if", "for", "while", "switch", "constructor"):
                        entities.append(CodeEntity(
                            name=method_name,
                            entity_type="method",
                            file_path=file_path,
                            start_line=i + 1,
                            end_line=i + 1,
                            content=line,
                            signature=stripped.rstrip("{").strip(),
                            parent=current_class,
                        ))
                    continue
            
            # Reset class context
            if current_class and brace_depth <= class_start_depth:
                current_class = None
            
            # Check for standalone functions
            for pattern in func_patterns:
                match = pattern.search(line)
                if match:
                    func_name = match.group(1)
                    entities.append(CodeEntity(
                        name=func_name,
                        entity_type="function",
                        file_path=file_path,
                        start_line=i + 1,
                        end_line=i + 1,
                        content=line,
                        signature=stripped.rstrip("{").strip(),
                    ))
                    break
        
        return entities
    
    def _parse_html_simple(self, content: str, file_path: str, lines: list[str]) -> list[CodeEntity]:
        """
        Simple HTML parsing. Treats the whole file or large blocks as entities.
        For drift analysis, we mainly care about structural presence.
        """
        return [CodeEntity(
            name="document_structure",
            entity_type="component",
            file_path=file_path,
            start_line=1,
            end_line=len(lines),
            content=content,
            signature="<html>...</html>",
        )]

    def _parse_css_simple(self, content: str, file_path: str, lines: list[str]) -> list[CodeEntity]:
        """Simple CSS parsing extracting rule sets."""
        return [CodeEntity(
            name="styles",
            entity_type="stylesheet",
            file_path=file_path,
            start_line=1,
            end_line=len(lines),
            content=content,
            signature="/* Stylesheet */",
        )]

    def _find_block_end(
        self, 
        lines: list[str], 
        start: int, 
        base_indent: int
    ) -> int:
        """Find the end line of an indented block (Python)."""
        end = start + 1
        
        while end < len(lines):
            line = lines[end]
            if not line.strip():  # Empty line
                end += 1
                continue
            
            current_indent = len(line) - len(line.lstrip())
            if current_indent <= base_indent and line.strip():
                break
            end += 1
        
        return end
    
    def _extract_docstring(self, lines: list[str], start: int) -> str | None:
        """Extract docstring from the line after a definition."""
        if start >= len(lines):
            return None
        
        # Look for docstring in next few lines
        for i in range(start, min(start + 3, len(lines))):
            line = lines[i].strip()
            if line.startswith('"""') or line.startswith("'''"):
                quote = line[:3]
                if line.count(quote) >= 2:
                    # Single line docstring
                    return line.strip(quote).strip()
                else:
                    # Multi-line docstring
                    doc_lines = [line.lstrip(quote)]
                    for j in range(i + 1, len(lines)):
                        doc_line = lines[j]
                        if quote in doc_line:
                            doc_lines.append(doc_line.split(quote)[0].strip())
                            break
                        doc_lines.append(doc_line.strip())
                    return "\n".join(doc_lines).strip()
            elif line and not line.startswith("#"):
                break
        
        return None


# Singleton parser instance
_parser: CodeParser | None = None


def get_parser() -> CodeParser:
    """Get or create the singleton parser instance."""
    global _parser
    if _parser is None:
        _parser = CodeParser()
    return _parser
