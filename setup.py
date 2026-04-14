from setuptools import setup, find_packages

setup(
    name="docugardener",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "click>=8.0.0",
        "pydantic>=2.5.0",
        "pydantic-settings>=2.1.0",
        "gitpython>=3.1.40",
        "pathspec>=0.11.0",
        "tree-sitter>=0.21.0",
        "tree-sitter-python>=0.21.0",
        "tree-sitter-javascript>=0.21.0",
        "tree-sitter-typescript>=0.21.0",
        "google-generativeai>=0.8.0",
        "structlog>=24.1.0",
        "python-dotenv>=1.0.0",
        "httpx>=0.26.0",
    ],
    entry_points={
        "console_scripts": [
            "docugardener=src.cli.main:cli",
        ],
    },
    python_requires=">=3.10",
)
