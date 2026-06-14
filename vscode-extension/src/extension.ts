import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import { DriftChecker } from "./checker"
import { StatusBarManager } from "./statusBar"
import { OutputChannelManager } from "./outputChannel"
import { DocuGardenerCodeActionProvider } from "./codeActions"

let statusBar: StatusBarManager
let output: OutputChannelManager
let checker: DriftChecker

/** Web-app base URL — derived from the configured backend URL. */
function webAppBase(): string {
    return vscode.workspace
        .getConfiguration("docugardener")
        .get("backendUrl", "https://docugardener.dev")
        .replace(/\/$/, "")
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

    // Register command: DocuGardener: Enter API Key — lets users re-enter their key anytime
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
        checkCmd, createDocCmd, codeActionProvider, enterKeyCmd, clearKeyCmd, statusBar, output,
    )

    // Show onboarding if no API key is configured
    const existingKey = await context.secrets.get("docugardener.apiKey")
    if (!existingKey) {
        vscode.window.showInformationMessage(
            "DocuGardener: No API key configured — generate one in the web app to start checking drift.",
            "Enter Key",
            "Open Web App",
        ).then(async (choice) => {
            if (choice === "Enter Key") {
                await checker.promptForApiKey()
            } else if (choice === "Open Web App") {
                vscode.env.openExternal(
                    vscode.Uri.parse(`${webAppBase()}/dashboard/settings?tab=integrations`),
                )
            }
        })
    }
}

export function deactivate(): void {
    statusBar?.dispose()
    output?.dispose()
}
