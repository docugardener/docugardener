#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# verify-audit-export.sh — verify HMAC-SHA256 signature on a DocuGardener audit export
#
# The signature is embedded as the last line of the CSV file:
#   # x-audit-export-signature: sha256=<hex>
# It is also returned as the X-Audit-Export-Signature response header (may be
# stripped by CDN proxies — the embedded comment is the reliable source).
#
# Usage:
#   AUDIT_EXPORT_SIGNING_KEY=<key> ./scripts/verify-audit-export.sh <export-file>
#
# Example:
#   curl -s "https://docugardener.dev/api/audit/export" \
#     -H "Cookie: __Secure-next-auth.session-token=<token>" \
#     -o /tmp/audit.csv
#   AUDIT_EXPORT_SIGNING_KEY=<key> ./scripts/verify-audit-export.sh /tmp/audit.csv
#
set -euo pipefail

EXPORT_FILE="${1:-}"

if [[ -z "$EXPORT_FILE" ]]; then
    echo "Usage: AUDIT_EXPORT_SIGNING_KEY=<key> $0 <export-file>"
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

# Extract signature from last line: "# x-audit-export-signature: sha256=<hex>"
LAST_LINE=$(tail -1 "$EXPORT_FILE")
if [[ "$LAST_LINE" != "# x-audit-export-signature: sha256="* ]]; then
    echo "Error: no embedded signature found in file (last line is not a signature comment)"
    echo "Last line: $LAST_LINE"
    exit 1
fi
PROVIDED_SIG=$(echo "$LAST_LINE" | sed 's/^# x-audit-export-signature: //')

# Body = everything except the last signature line (sed '$d' is POSIX — works on macOS + Linux)
BODY=$(sed '$d' "$EXPORT_FILE")

# Compute HMAC-SHA256 over the body
COMPUTED_HEX=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "$KEY" | awk '{print $2}')
COMPUTED="sha256=${COMPUTED_HEX}"

echo "File     : $EXPORT_FILE"
echo "Provided : $PROVIDED_SIG"
echo "Computed : $COMPUTED"

if [[ "$PROVIDED_SIG" == "$COMPUTED" ]]; then
    echo "Result   : PASS ✓  — signature matches, export has not been tampered with"
    exit 0
else
    echo "Result   : FAIL ✗  — signature mismatch, export may have been modified"
    exit 1
fi
