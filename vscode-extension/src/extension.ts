import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import { randomBytes } from "crypto"
import { DriftChecker } from "./checker"
import { StatusBarManager } from "./statusBar"
import { OutputChannelManager } from "./outputChannel"
import { DocuGardenerCodeActionProvider } from "./codeActions"

let statusBar: StatusBarManager
let output: OutputChannelManager
let checker: DriftChecker

// UX-VSCODE-ONBOARD-01: in-flight sign-in (CSRF state). Set when the browser flow
// starts; verified + cleared when the vscode:// callback fires.
let pendingSignIn: { state: string } | undefined

/** Web-app base URL — derived from the configured backend URL. */
function webAppBase(): string {
    return vscode.workspace
        .getConfiguration("docugardener")
        .get("backendUrl", "https://docugardener.dev")
        .replace(/\/$/, "")
}

/**
 * UX-VSCODE-ONBOARD-01: one-click sign-in. Opens the browser to the authorize
 * page; the vscode:// callback (see the URI handler in activate) completes it.
 */
async function signIn(): Promise<void> {
    const state = randomBytes(16).toString("hex")
    const redirectUri = `${vscode.env.uriScheme}://docugardener.docugardener/auth-callback`
    pendingSignIn = { state }
    const authorizeUrl =
        `${webAppBase()}/vscode/authorize?state=${encodeURIComponent(state)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`
    const opened = await vscode.env.openExternal(vscode.Uri.parse(authorizeUrl))
    if (!opened) {
        pendingSignIn = undefined
        vscode.window.showErrorMessage("DocuGardener: Couldn't open the browser for sign-in.")
        return
    }
    vscode.window.showInformationMessage("DocuGardener: Continue sign-in in your browser…")
    // Drop stale pending state after 5 minutes so a never-completed flow can't linger.
    setTimeout(() => {
        if (pendingSignIn?.state === state) pendingSignIn = undefined
    }, 5 * 60_000)
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    output = new OutputChannelManager()
    statusBar = new StatusBarManager()
    checker = new DriftChecker(output, statusBar, context)

    output.log("DocuGardener extension activated")
    statusBar.setIdle()

    // Register command: DocuGardener: Check Drift Now
    const checkCmd = vscode.commands.registerCommand(
        "docugardener.checkDrift",
        () => checker.runCheck(),
    )

    // IDE-01 AC-3: create a suggested doc file (with scaffold) then open it
    const createDocCmd = vscode.commands.registerCommand(
        "docugardener.createAndOpenDoc",
        async (docUri: vscode.Uri, diagMessage: string) => {
            const dirPath = path.dirname(docUri.fsPath)
            await fs.promises.mkdir(dirPath, { recursive: true })
            // Write a minimal scaffold based on the diagnostic message
            const filename = path.basename(docUri.fsPath)
            const scaffold = `# ${filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")}\n\n` +
                `<!-- DocuGardener suggested: ${diagMessage} -->\n\n` +
                `## Overview\n\n_Add documentation here._\n`
            await fs.promises.writeFile(docUri.fsPath, scaffold, "utf-8")
            await vscode.commands.executeCommand("vscode.open", docUri)
        },
    )

    // IDE-01 AC-3: register CodeActionProvider for all document types
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        { scheme: "file" },
        new DocuGardenerCodeActionProvider(),
        { providedCodeActionKinds: DocuGardenerCodeActionProvider.providedCodeActionKinds },
    )

    // Register command: DocuGardener: Sign In — one-click browser auth, auto-stores the key
    const signInCmd = vscode.commands.registerCommand("docugardener.signIn", () => signIn())

    // Handle the vscode:// callback from the browser authorize flow
    const uriHandler = vscode.window.registerUriHandler({
        async handleUri(uri: vscode.Uri): Promise<void> {
            if (uri.path !== "/auth-callback") return
            const params = new URLSearchParams(uri.query)
            const code = params.get("code") ?? ""
            const state = params.get("state") ?? ""
            if (!pendingSignIn || state !== pendingSignIn.state) {
                vscode.window.showErrorMessage(
                    "DocuGardener: Sign-in could not be verified (state mismatch). Please try again.",
                )
                return
            }
            pendingSignIn = undefined
            if (!code) {
                vscode.window.showErrorMessage("DocuGardener: Sign-in failed — no authorization code.")
                return
            }
            try {
                await checker.exchangeCodeForKey(code)
                vscode.window.showInformationMessage(
                    "DocuGardener: Signed in — you're ready to check drift.",
                )
            } catch (err: any) {
                output.log(`Sign-in exchange failed: ${err.message}`)
                vscode.window.showErrorMessage(`DocuGardener: Sign-in failed — ${err.message}`)
            }
        },
    })

    // Register command: DocuGardener: Enter API Key — manual fallback to paste a key
    const enterKeyCmd = vscode.commands.registerCommand(
        "docugardener.enterApiKey",
        () => checker.promptForApiKey(),
    )

    // Register command: DocuGardener: Clear API Key — removes the stored key
    const clearKeyCmd = vscode.commands.registerCommand(
        "docugardener.clearApiKey",
        async () => {
            await checker.clearApiKey()
            vscode.window.showInformationMessage("DocuGardener: API key cleared.")
        },
    )

    // Optional: run check automatically on git pre-push hook substitute.
    // We watch for changes to .git/COMMIT_EDITMSG as a lightweight proxy
    // for "user just committed staged changes" — no reliable pre-push hook
    // from within VS Code, so the command is the primary trigger.

    context.subscriptions.push(
        checkCmd, createDocCmd, codeActionProvider,
        signInCmd, uriHandler, enterKeyCmd, clearKeyCmd, statusBar, output,
    )

    // Show onboarding if no API key is configured — lead with one-click Sign In.
    const existingKey = await context.secrets.get("docugardener.apiKey")
    if (!existingKey) {
        vscode.window.showInformationMessage(
            "DocuGardener: Sign in to start checking documentation drift.",
            "Sign In",
            "Enter API Key",
        ).then(async (choice) => {
            if (choice === "Sign In") {
                await signIn()
            } else if (choice === "Enter API Key") {
                await checker.promptForApiKey()
            }
        })
    }
}

export function deactivate(): void {
    statusBar?.dispose()
    output?.dispose()
}
