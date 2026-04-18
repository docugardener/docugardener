#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# verify-audit-export.sh — verify HMAC-SHA256 signature on a DocuGardener audit export
#
# Usage:
#   AUDIT_EXPORT_SIGNING_KEY=<key> ./scripts/verify-audit-export.sh <export-file> <signature>
#
#   <export-file>  — path to downloaded audit-log-YYYY-MM-DD.csv or .json
#   <signature>    — value of X-Audit-Export-Signature header (sha256=<hex>)
#                    OR "header" to extract it from <export-file>.headers.txt
#                    (curl -D <export-file>.headers.txt saves headers alongside)
#
# Example — download and verify in one shot:
#   curl -s https://docugardener.dev/api/audit/export \
#     -H "Cookie: next-auth.session-token=<token>" \
#     -D /tmp/audit.headers.txt \
#     -o /tmp/audit.csv
#   AUDIT_EXPORT_SIGNING_KEY=<key> \
#     ./scripts/verify-audit-export.sh /tmp/audit.csv \
#     "$(grep -i x-audit-export-signature /tmp/audit.headers.txt | awk '{print $2}' | tr -d '\r')"
#
set -euo pipefail

EXPORT_FILE="${1:-}"
PROVIDED_SIG="${2:-}"

if [[ -z "$EXPORT_FILE" || -z "$PROVIDED_SIG" ]]; then
    echo "Usage: AUDIT_EXPORT_SIGNING_KEY=<key> $0 <export-file> <sha256=hex-signature>"
    exit 1
fi

if [[ ! -f "$EXPORT_FILE" ]]; then
    echo "Error: file not found: $EXPORT_FILE"
    exit 1
fi

KEY="${AUDIT_EXPORT_SIGNING_KEY:-}"
if [[ -z "$KEY" ]]; then
    echo "Error: AUDIT_EXPORT_SIGNING_KEY environment variable is not set"
    exit 1
fi

# Compute HMAC-SHA256 over the raw file bytes
COMPUTED_HEX=$(cat "$EXPORT_FILE" | openssl dgst -sha256 -hmac "$KEY" | awk '{print $2}')
COMPUTED="sha256=${COMPUTED_HEX}"

echo "File       : $EXPORT_FILE"
echo "Provided   : $PROVIDED_SIG"
echo "Computed   : $COMPUTED"

if [[ "$PROVIDED_SIG" == "$COMPUTED" ]]; then
    echo "Result     : PASS ✓  — signature matches, export has not been tampered with"
    exit 0
else
    echo "Result     : FAIL ✗  — signature mismatch, export may have been modified"
    exit 1
fi
