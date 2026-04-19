# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-13: ContextEnricher — extracts sibling context, imports, and docstring style
from source files to enrich fix PR generation prompts.

All public methods are fail-safe: they return empty strings / "plain" rather
than raising, so a file I/O or parse error never breaks the analysis pipeline.
"""

from __future__ import annotations

import ast
import re
import textwrap
from pathlib import Path

from src.core.logging import get_logger

logger = get_logger(__name__)

# Maximum characters of neighbor code to include in the prompt.
_MAX_NEIGHBOR_CHARS = 1500
# Maximum characters of the import block to include.
_MAX_IMPORT_CHARS = 800
# Number of existing docstrings to scan when detecting style.
_DOCSTRING_SCAN_LIMIT = 10


class ContextEnricher:
    """
    Extracts contextual information from source files to enrich LLM prompts.

    Used by VerificationAgent.generate_documentation() when a repo_path is
    available (i.e. during online PR analysis, not local/CLI mode).
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract_neighbors(
        self,
        file_path: str,
        entity_name: str,
        repo_path: Path | None = None,
        n: int = 3,
    ) -> str:
        """Return source code of up to *n* sibling functions nearest to *entity_name*.

        For Python files, uses the AST.  For TypeScript/JavaScript, uses regex.
        Returns an empty string on any error (missing file, parse failure, etc.).

        Args:
            file_path: Relative path to the source file.
            entity_name: The function/method being documented (excluded from results).
            repo_path: Absolute path to the repository root.  If None, *file_path*
                is treated as absolute.
            n: Maximum number of sibling functions to return.

        Returns:
            Concatenated source snippets of the n nearest siblings, or "".
        """
        try:
            abs_path = self._resolve(file_path, repo_path)
            if not abs_path.exists():
                return ""
            source = abs_path.read_text(encoding="utf-8", errors="replace")
            ext = abs_path.suffix.lower()

            if ext == ".py":
                return self._python_neighbors(source, entity_name, n)
            elif ext in (".ts", ".tsx", ".js", ".jsx"):
                return self._ts_neighbors(source, entity_name, n)
            return ""
        except Exception as exc:
            logger.warning(
                "ContextEnricher.extract_neighbors failed",
                file=file_path,
                entity=entity_name,
                error=str(exc),
            )
            return ""

    def extract_imports(
        self,
        file_path: str,
        repo_path: Path | None = None,
    ) -> str:
        """Return the import block of a source file.

        For Python: all `import` and `from … import` statements.
        For TypeScript/JavaScript: all `import` lines.
        Returns an empty string on any error.

        Args:
            file_path: Relative path to the source file.
            repo_path: Absolute path to the repository root.

        Returns:
            Import block as a string, or "".
        """
        try:
            abs_path = self._resolve(file_path, repo_path)
            if not abs_path.exists():
                return ""
            source = abs_path.read_text(encoding="utf-8", errors="replace")
            ext = abs_path.suffix.lower()

            if ext == ".py":
                return self._python_imports(source)
            elif ext in (".ts", ".tsx", ".js", ".jsx"):
                return self._ts_imports(source)
            return ""
        except Exception as exc:
            logger.warning(
                "ContextEnricher.extract_imports failed",
                file=file_path,
                error=str(exc),
            )
            return ""

    def detect_docstring_style(
        self,
        file_path: str,
        repo_path: Path | None = None,
    ) -> str:
        """Detect the dominant docstring convention used in *file_path*.

        Scans up to _DOCSTRING_SCAN_LIMIT existing docstrings and votes on:
          "google"  — Args: / Returns: / Raises: pattern
          "numpy"   — Parameters\\n---------- pattern
          "rst"     — :param / :returns: / :rtype: pattern
          "plain"   — no recognized convention (or file missing)

        Args:
            file_path: Relative path to the source file.
            repo_path: Absolute path to the repository root.

        Returns:
            One of "google", "numpy", "rst", or "plain".
        """
        try:
            abs_path = self._resolve(file_path, repo_path)
            if not abs_path.exists():
                return "plain"
            source = abs_path.read_text(encoding="utf-8", errors="replace")
            return self._vote_docstring_style(source)
        except Exception as exc:
            logger.warning(
                "ContextEnricher.detect_docstring_style failed",
                file=file_path,
                error=str(exc),
            )
            return "plain"

    # ------------------------------------------------------------------
    # Private helpers — Python
    # ------------------------------------------------------------------

    def _resolve(self, file_path: str, repo_path: Path | None) -> Path:
        if repo_path is not None:
            return repo_path / file_path
        return Path(file_path)

    def _python_neighbors(self, source: str, entity_name: str, n: int) -> str:
        """AST-based sibling extraction for Python."""
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return ""

        # Collect (start_line, name, source_snippet) for all top-level functions
        # and, if entity is a method, for methods in the same class.
        candidates = self._collect_python_functions(tree, source, entity_name)
        if not candidates:
            return ""

        # Find target's line position for proximity sorting
        target_line = next(
            (line for line, name, _ in candidates if name == entity_name), None
        )
        if target_line is None:
            # entity not found — return empty
            return ""

        # Exclude target, sort by proximity, take n
        siblings = [
            (abs(line - target_line), name, snippet)
            for line, name, snippet in candidates
            if name != entity_name
        ]
        siblings.sort(key=lambda t: t[0])
        selected = [snippet for _, _, snippet in siblings[:n]]
        result = "\n\n".join(selected)
        return result[:_MAX_NEIGHBOR_CHARS]

    def _collect_python_functions(
        self,
        tree: ast.Module,
        source: str,
        entity_name: str,
    ) -> list[tuple[int, str, str]]:
        """
        Return (start_line, func_name, source_snippet) for functions that
        share the same scope level as entity_name.
        """
        lines = source.splitlines()

        def _snippet(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
            end = getattr(node, "end_lineno", node.lineno + 20)
            body_lines = lines[node.lineno - 1 : end]
            # Cap to first 30 lines to avoid massive snippets
            return textwrap.dedent("\n".join(body_lines[:30]))

        # Check top-level first
        top_level = [
            (n.lineno, n.name, _snippet(n))
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
            and n.col_offset == 0
        ]
        if any(name == entity_name for _, name, _ in top_level):
            return top_level

        # Search inside class bodies
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            methods = [
                (child.lineno, child.name, _snippet(child))
                for child in ast.walk(node)
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                and child.col_offset == node.col_offset + 4  # direct child only
            ]
            if any(name == entity_name for _, name, _ in methods):
                return methods

        return top_level  # fallback: return whatever we found

    def _python_imports(self, source: str) -> str:
        """Extract Python import statements."""
        import_lines: list[str] = []
        try:
            tree = ast.parse(source)
            src_lines = source.splitlines()
            for node in ast.walk(tree):
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    end = getattr(node, "end_lineno", node.lineno)
                    for i in range(node.lineno - 1, end):
                        if i < len(src_lines):
                            import_lines.append(src_lines[i])
        except SyntaxError:
            # Fallback: grep for import lines
            import_lines = [
                l for l in source.splitlines()
                if l.startswith("import ") or l.startswith("from ")
            ]
        result = "\n".join(import_lines)
        return result[:_MAX_IMPORT_CHARS]

    # ------------------------------------------------------------------
    # Private helpers — TypeScript / JavaScript
    # ------------------------------------------------------------------

    _TS_FUNC_RE = re.compile(
        r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(",
        re.MULTILINE,
    )

    def _ts_neighbors(self, source: str, entity_name: str, n: int) -> str:
        """Regex-based sibling extraction for TypeScript/JavaScript."""
        lines = source.splitlines()
        matches = list(self._TS_FUNC_RE.finditer(source))

        target_match = next((m for m in matches if m.group(1) == entity_name), None)
        if target_match is None:
            return ""

        target_line = source[: target_match.start()].count("\n")

        # Build (proximity, name, snippet) list.
        # Bound each function snippet by the start of the next function so we
        # don't accidentally include a sibling's definition text in the snippet.
        siblings = []
        for i, m in enumerate(matches):
            name = m.group(1)
            if name == entity_name:
                continue
            func_start_line = source[: m.start()].count("\n")
            # End of this function = start line of the next match (or EOF)
            if i + 1 < len(matches):
                next_start = source[: matches[i + 1].start()].count("\n")
            else:
                next_start = len(lines)
            func_end_line = min(next_start, func_start_line + 20)
            snippet_lines = lines[func_start_line:func_end_line]
            snippet = "\n".join(snippet_lines).rstrip()
            siblings.append((abs(func_start_line - target_line), name, snippet))

        siblings.sort(key=lambda t: t[0])
        result = "\n\n".join(s for _, _, s in siblings[:n])
        return result[:_MAX_NEIGHBOR_CHARS]

    def _ts_imports(self, source: str) -> str:
        """Extract TypeScript/JavaScript import lines."""
        import_lines = [
            line for line in source.splitlines()
            if line.strip().startswith("import ")
        ]
        result = "\n".join(import_lines)
        return result[:_MAX_IMPORT_CHARS]

    # ------------------------------------------------------------------
    # Private helpers — docstring style detection
    # ------------------------------------------------------------------

    _GOOGLE_RE = re.compile(r"\n\s+(Args|Returns|Raises|Yields|Example):\s*\n", re.MULTILINE)
    _NUMPY_RE = re.compile(r"\n\s+\w[\w\s]*\n\s+[-]{3,}", re.MULTILINE)
    _RST_RE = re.compile(r":param\s+\w+:|:returns?:|:rtype:", re.MULTILINE)
    _DOCSTRING_RE = re.compile(r'"""(.*?)"""', re.DOTALL)

    def _vote_docstring_style(self, source: str) -> str:
        """Scan docstrings and return the dominant style."""
        docstrings = self._DOCSTRING_RE.findall(source)[: _DOCSTRING_SCAN_LIMIT]
        if not docstrings:
            # Also try single-quoted
            sq = re.findall(r"'''(.*?)'''", source, re.DOTALL)
            docstrings = sq[:_DOCSTRING_SCAN_LIMIT]

        if not docstrings:
            return "plain"

        votes = {"google": 0, "numpy": 0, "rst": 0}
        for doc in docstrings:
            if self._GOOGLE_RE.search("\n" + doc):
                votes["google"] += 1
            if self._NUMPY_RE.search("\n" + doc):
                votes["numpy"] += 1
            if self._RST_RE.search(doc):
                votes["rst"] += 1

        winner = max(votes, key=lambda k: votes[k])
        return winner if votes[winner] > 0 else "plain"
