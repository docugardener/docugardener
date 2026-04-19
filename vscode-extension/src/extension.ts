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

async function promptForApiKey(checker: DriftChecker): Promise<void> {
    const key = await vscode.window.showInputBox({
        prompt: "Paste your DocuGardener API key (generated in Settings → VS Code Plugin)",
        password: true,
        placeHolder: "dg_...",
        validateInput: (v) => v.startsWith("dg_") ? null : "Key must start with dg_",
    })
    if (key) {
        await checker.storeApiKey(key)
        vscode.window.showInformationMessage("DocuGardener: API key saved. You're ready to go!")
    }
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
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true })
            }
            // Write a minimal scaffold based on the diagnostic message
            const filename = path.basename(docUri.fsPath)
            const scaffold = `# ${filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")}\n\n` +
                `<!-- DocuGardener suggested: ${diagMessage} -->\n\n` +
                `## Overview\n\n_Add documentation here._\n`
            fs.writeFileSync(docUri.fsPath, scaffold, "utf-8")
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
        () => promptForApiKey(checker),
    )

    // Optional: run check automatically on git pre-push hook substitute.
    // We watch for changes to .git/COMMIT_EDITMSG as a lightweight proxy
    // for "user just committed staged changes" — no reliable pre-push hook
    // from within VS Code, so the command is the primary trigger.

    context.subscriptions.push(checkCmd, createDocCmd, codeActionProvider, enterKeyCmd, statusBar, output)

    // Show onboarding if no API key is configured
    const existingKey = await context.secrets.get("docugardener.apiKey")
    if (!existingKey) {
        vscode.window.showInformationMessage(
            "DocuGardener: No API key configured — generate one in the web app to start checking drift.",
            "Enter Key",
            "Open Web App",
        ).then(async (choice) => {
            if (choice === "Enter Key") {
                await promptForApiKey(checker)
            } else if (choice === "Open Web App") {
                vscode.env.openExternal(vscode.Uri.parse("https://app.docugardener.dev/dashboard/settings?tab=integrations"))
            }
        })
    }
}

export function deactivate(): void {
    statusBar?.dispose()
    output?.dispose()
}
