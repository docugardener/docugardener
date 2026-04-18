#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Generates web/public/docs/docugardener-ai-act-summary.pdf from Markdown source.
# Requires: pandoc, wkhtmltopdf or weasyprint
# Usage: ./scripts/build-compliance-pdf.sh
#
# The generated PDF is committed to web/public/docs/ and served as a static asset
# from the /trust page. Run this script locally whenever the source spec changes
# and commit the updated PDF. The PDF is NOT auto-generated in CI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
SOURCE_DOC="$ROOT/docs/specs/FEAT-014-AI-Act-Compliance-Pack.md"
OUTPUT_DIR="$ROOT/web/public/docs"
OUTPUT_PDF="$OUTPUT_DIR/docugardener-ai-act-summary.pdf"

if ! command -v pandoc &>/dev/null; then
  echo "ERROR: pandoc is not installed. Install with: brew install pandoc" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

pandoc "$SOURCE_DOC" \
  --from markdown \
  --to pdf \
  -o "$OUTPUT_PDF" \
  --metadata title="DocuGardener & the EU AI Act" \
  --metadata date="2026-04-18" \
  --metadata author="DocuGardener compliance@docugardener.dev"

echo "PDF written to $OUTPUT_PDF"
echo "Remember to: git add web/public/docs/docugardener-ai-act-summary.pdf && git commit"
