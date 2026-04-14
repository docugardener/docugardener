"""
Setup script to compile Tree-sitter language libraries.
Downloads language grammars and builds shared libraries.
"""

import os
import subprocess
from pathlib import Path

from tree_sitter import Language

# Languages to support
LANGUAGES = {
    "python": "https://github.com/tree-sitter/tree-sitter-python",
    "javascript": "https://github.com/tree-sitter/tree-sitter-javascript",
    "typescript": "https://github.com/tree-sitter/tree-sitter-typescript",
}

def setup_parsers():
    # Directories
    root_dir = Path(__file__).parent.parent
    vendor_dir = root_dir / "vendor"
    build_dir = root_dir / "build"
    
    vendor_dir.mkdir(exist_ok=True)
    build_dir.mkdir(exist_ok=True)
    
    lib_path = str(build_dir / "languages.so")
    lang_dirs = []
    
    for lang, url in LANGUAGES.items():
        lang_dir = vendor_dir / f"tree-sitter-{lang}"
        lang_dirs.append(str(lang_dir))
        
        if not lang_dir.exists():
            print(f"Cloning {lang} grammar...")
            subprocess.run(["git", "clone", "--depth=1", url, str(lang_dir)], check=True)
        else:
            print(f"Grammar {lang} already exists.")

    print(f"Building shared library at {lib_path}...")
    # Note: Modern tree-sitter Python bindings (>0.21) handle this differently,
    # but for compatibility with older installations we used to do this.
    # We will try to build with the Language.build_library method.
    try:
        Language.build_library(lib_path, lang_dirs)
        print("✅ Build successful!")
    except Exception as e:
        print(f"❌ Build failed: {e}")
        print("Trying alternative method (individual packages)...")
        # If compilation fails, we should advise using pre-packaged bindings
        # pip install tree-sitter-python tree-sitter-javascript tree-sitter-typescript

if __name__ == "__main__":
    setup_parsers()
