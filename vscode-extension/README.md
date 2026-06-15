# DocuGardener

Pre-push documentation drift detection for VS Code.

## What it does

DocuGardener analyses your staged changes before you push and flags documentation
that is out of sync with the code — inline, in your editor. Results appear as VS Code
diagnostics with quick-fix actions so you can open or create the relevant doc without
leaving the IDE.

## Requirements

A DocuGardener account — created automatically the first time you sign in (free,
at [docugardener.dev](https://docugardener.dev)). No manual API-key copying required.

## Quick Setup

1. Install the extension from the VS Code Marketplace.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run
   **DocuGardener: Sign In**. Your browser opens — sign in (GitHub, email, or SSO),
   click **Authorize**, and you're returned to VS Code with everything configured.
3. Stage your changes with `git add`, then run **DocuGardener: Check Drift Now**
   from the Command Palette or click the status bar item.

> Prefer to do it manually (or air-gapped)? Run **DocuGardener: Enter API Key** and
> paste a key generated under **Settings → VS Code Plugin** in the web app instead.

## Commands

| Command | Description |
|---|---|
| `DocuGardener: Sign In` | One-click browser sign-in; stores your key automatically |
| `DocuGardener: Check Drift Now` | Run a drift check against your staged changes |
| `DocuGardener: Enter API Key` | Manually store an API key (alternative to Sign In) |
| `DocuGardener: Clear API Key` | Remove the stored API key from the OS keychain |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `docugardener.backendUrl` | `https://docugardener.dev` | Backend URL (change for self-hosted) |
| `docugardener.enabled` | `true` | Enable or disable drift analysis |
| `docugardener.blockOnCritical` | `false` | Show a blocking modal on critical drift |

## Supported Languages

Python, JavaScript, TypeScript, JSX, TSX, MJS, CJS, HTML, CSS

## Self-Hosted

If you run DocuGardener on your own infrastructure, set `docugardener.backendUrl`
to your instance's URL (e.g. `https://dg.corp.example.com`). All other settings
remain the same; no cloud calls are made when a custom URL is configured.

## License

[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)
