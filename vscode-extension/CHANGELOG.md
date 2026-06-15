# Change Log

## [0.2.0] — 2026-06-15

### Added
- **One-click "DocuGardener: Sign In"** — opens your browser, you sign in (GitHub / email / SSO) and click Authorize, and the extension is configured automatically. No more generating and copy-pasting an API key. Works against self-hosted instances too (via `docugardener.backendUrl`). Manual **Enter API Key** remains for air-gapped/manual setups.

## [0.1.2] — 2026-06-15

### Fixed
- Backend errors are now classified instead of all shown as "Backend unreachable": an HTTP **401** says *"Invalid or expired API key"* with a one-click **Enter API Key** action; a **429** surfaces the server's rate-limit message; other server errors and genuine network outages are distinguished. ("Unreachable" now means actually unreachable.)

## [0.1.1] — 2026-06-14

### Fixed
- **Security:** git is now invoked with argument arrays (`execFile`, no shell), so staged file paths can never be interpreted as shell syntax (command-injection hardening).
- Corrected the default `backendUrl` to `https://docugardener.dev` (the previous `app.` subdomain did not resolve).

### Changed
- File reads during a check are now fully async (no synchronous I/O on the extension host).
- API key prompt unified into a single flow; key is stored only in SecretStorage.
- Removed the `docugardener.apiKey` **setting** — it lived in plaintext `settings.json` and was a security trap. Use the "Enter API Key" command (SecretStorage) instead.

### Added
- **"DocuGardener: Clear API Key"** command to remove a stored key.

## [0.1.0] — 2026-04-19

### Added
- Pre-push documentation drift detection via DocuGardener backend
- Status bar indicator with drift severity
- Inline VS Code diagnostics for changed entities
- Quick-fix code actions: open or create suggested documentation files
- Policy violation diagnostics for repo-level rules
- Secure API key storage via OS keychain (VS Code SecretStorage)
- Onboarding flow: prompted to enter API key on first activation
- "DocuGardener: Enter API Key" command for re-entry
- Self-hosted support via `docugardener.backendUrl` setting
