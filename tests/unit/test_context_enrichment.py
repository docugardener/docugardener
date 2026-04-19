# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-13 TDD — ContextEnricher unit tests.

Written BEFORE implementation.  All tests must fail first, then pass after
src/pipeline/context_enrichment.py is implemented.

Coverage:
  CE-01..CE-04  extract_neighbors (Python AST, TS regex, edge cases)
  CE-05..CE-07  extract_imports (Python, TypeScript, missing file)
  CE-08..CE-12  detect_docstring_style (Google, NumPy, reST, plain, missing file)
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from src.pipeline.context_enrichment import ContextEnricher


# ---------------------------------------------------------------------------
# Helpers — build temporary source files
# ---------------------------------------------------------------------------

PYTHON_GOOGLE_STYLE = textwrap.dedent("""\
    import os
    from pathlib import Path

    def alpha(x: int) -> str:
        \"\"\"Convert x to string.

        Args:
            x: The integer to convert.

        Returns:
            String representation.
        \"\"\"
        return str(x)

    def beta(y: float) -> int:
        \"\"\"Floor y to int.

        Args:
            y: Float value.

        Returns:
            Integer floor.
        \"\"\"
        return int(y)

    def gamma(z: str) -> bool:
        \"\"\"Check if z is non-empty.

        Args:
            z: Input string.

        Returns:
            True if non-empty.
        \"\"\"
        return bool(z)

    def delta(a: int, b: int) -> int:
        \"\"\"Add two numbers.

        Args:
            a: First operand.
            b: Second operand.

        Returns:
            Sum.
        \"\"\"
        return a + b
""")

PYTHON_NUMPY_STYLE = textwrap.dedent("""\
    import re

    def parse(text: str) -> list:
        \"\"\"Parse text into tokens.

        Parameters
        ----------
        text : str
            Input text.

        Returns
        -------
        list
            List of tokens.
        \"\"\"
        return text.split()

    def clean(text: str) -> str:
        \"\"\"Remove whitespace.

        Parameters
        ----------
        text : str
            Raw text.

        Returns
        -------
        str
            Cleaned text.
        \"\"\"
        return text.strip()
""")

PYTHON_RST_STYLE = textwrap.dedent("""\
    def connect(host: str, port: int) -> bool:
        \"\"\"Connect to a server.

        :param host: The hostname.
        :param port: The port number.
        :returns: True on success.
        :rtype: bool
        \"\"\"
        return True

    def disconnect(host: str) -> None:
        \"\"\"Disconnect from server.

        :param host: The hostname.
        \"\"\"
        pass
""")

TYPESCRIPT_SOURCE = textwrap.dedent("""\
    import { useState } from 'react';
    import type { FC } from 'react';

    function alpha(x: number): string {
        return x.toString();
    }

    function beta(y: string): boolean {
        return y.length > 0;
    }

    function gamma(z: boolean): number {
        return z ? 1 : 0;
    }

    function delta(a: number, b: number): number {
        return a + b;
    }
""")

PYTHON_NO_DOCSTRINGS = textwrap.dedent("""\
    def foo(x):
        return x + 1

    def bar(y):
        return y * 2
""")


# ---------------------------------------------------------------------------
# CE-01..CE-04  extract_neighbors
# ---------------------------------------------------------------------------


class TestExtractNeighbors:
    def test_ce01_python_returns_n_siblings(self, tmp_path: Path):
        """CE-01: Python file — returns up to n sibling functions near the target."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_GOOGLE_STYLE)

        enricher = ContextEnricher()
        result = enricher.extract_neighbors("mod.py", "beta", repo_path=tmp_path, n=2)

        # Should return alpha and/or gamma (nearest siblings to beta)
        assert "alpha" in result or "gamma" in result
        assert "beta" not in result  # target itself excluded

    def test_ce02_python_excludes_target_entity(self, tmp_path: Path):
        """CE-02: Target function name must not appear in the neighbor output."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_GOOGLE_STYLE)

        enricher = ContextEnricher()
        result = enricher.extract_neighbors("mod.py", "alpha", repo_path=tmp_path, n=3)

        # alpha itself must not be in the returned neighbors
        lines = result.splitlines()
        defs = [l.strip() for l in lines if l.strip().startswith("def ")]
        assert not any("alpha" in d for d in defs)

    def test_ce03_entity_not_found_returns_empty(self, tmp_path: Path):
        """CE-03: Entity not present in file → empty string, no crash."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_GOOGLE_STYLE)

        enricher = ContextEnricher()
        result = enricher.extract_neighbors("mod.py", "nonexistent_func", repo_path=tmp_path, n=3)

        assert result == ""

    def test_ce04_missing_file_returns_empty(self, tmp_path: Path):
        """CE-04: File does not exist → empty string, no exception raised."""
        enricher = ContextEnricher()
        result = enricher.extract_neighbors("ghost.py", "foo", repo_path=tmp_path, n=3)

        assert result == ""

    def test_ce04b_typescript_neighbors(self, tmp_path: Path):
        """CE-04b: TypeScript file — regex-based extraction returns siblings."""
        f = tmp_path / "utils.ts"
        f.write_text(TYPESCRIPT_SOURCE)

        enricher = ContextEnricher()
        result = enricher.extract_neighbors("utils.ts", "beta", repo_path=tmp_path, n=2)

        # Should return alpha and/or gamma
        assert "alpha" in result or "gamma" in result
        assert "beta" not in result


# ---------------------------------------------------------------------------
# CE-05..CE-07  extract_imports
# ---------------------------------------------------------------------------


class TestExtractImports:
    def test_ce05_python_imports_extracted(self, tmp_path: Path):
        """CE-05: Python file — import block returned verbatim."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_GOOGLE_STYLE)

        enricher = ContextEnricher()
        result = enricher.extract_imports("mod.py", repo_path=tmp_path)

        assert "import os" in result
        assert "from pathlib import Path" in result

    def test_ce06_typescript_imports_extracted(self, tmp_path: Path):
        """CE-06: TypeScript file — import block returned verbatim."""
        f = tmp_path / "utils.ts"
        f.write_text(TYPESCRIPT_SOURCE)

        enricher = ContextEnricher()
        result = enricher.extract_imports("utils.ts", repo_path=tmp_path)

        assert "useState" in result
        assert "from 'react'" in result

    def test_ce07_missing_file_returns_empty(self, tmp_path: Path):
        """CE-07: File does not exist → empty string, no exception."""
        enricher = ContextEnricher()
        result = enricher.extract_imports("ghost.py", repo_path=tmp_path)

        assert result == ""


# ---------------------------------------------------------------------------
# CE-08..CE-12  detect_docstring_style
# ---------------------------------------------------------------------------


class TestDetectDocstringStyle:
    def test_ce08_google_style_detected(self, tmp_path: Path):
        """CE-08: Args:/Returns: pattern → 'google'."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_GOOGLE_STYLE)

        enricher = ContextEnricher()
        assert enricher.detect_docstring_style("mod.py", repo_path=tmp_path) == "google"

    def test_ce09_numpy_style_detected(self, tmp_path: Path):
        """CE-09: Parameters\\n---------- pattern → 'numpy'."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_NUMPY_STYLE)

        enricher = ContextEnricher()
        assert enricher.detect_docstring_style("mod.py", repo_path=tmp_path) == "numpy"

    def test_ce10_rst_style_detected(self, tmp_path: Path):
        """CE-10: :param / :returns: pattern → 'rst'."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_RST_STYLE)

        enricher = ContextEnricher()
        assert enricher.detect_docstring_style("mod.py", repo_path=tmp_path) == "rst"

    def test_ce11_no_docstrings_returns_plain(self, tmp_path: Path):
        """CE-11: File with no docstrings → 'plain'."""
        f = tmp_path / "mod.py"
        f.write_text(PYTHON_NO_DOCSTRINGS)

        enricher = ContextEnricher()
        assert enricher.detect_docstring_style("mod.py", repo_path=tmp_path) == "plain"

    def test_ce12_missing_file_returns_plain(self, tmp_path: Path):
        """CE-12: File does not exist → 'plain', no exception."""
        enricher = ContextEnricher()
        assert enricher.detect_docstring_style("ghost.py", repo_path=tmp_path) == "plain"
