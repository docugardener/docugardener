/**
 * IDE-01 AC-3: CodeActionProvider for DocuGardener diagnostics.
 *
 * Provides quickfix actions:
 *  - "Open suggested doc" — opens the doc file the LLM recommends updating
 *  - "Create suggested doc" — creates the file if it doesn't exist yet
 */
import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import { DIAGNOSTIC_CODE_SUGGESTED_DOC } from "./checker"

export class DocuGardenerCodeActionProvider implements vscode.CodeActionProvider {

    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []

        for (const diag of context.diagnostics) {
            if (!diag.source?.startsWith("DocuGardener")) continue

            // IDE-01 AC-3: suggested doc diagnostics carry a Uri target in diag.code
            if (
                diag.code &&
                typeof diag.code === "object" &&
                "value" in diag.code &&
                diag.code.value === DIAGNOSTIC_CODE_SUGGESTED_DOC &&
                "target" in diag.code
            ) {
                const docUri = diag.code.target as vscode.Uri
                const docExists = fs.existsSync(docUri.fsPath)

                if (docExists) {
                    // Open existing doc
                    const openAction = new vscode.CodeAction(
                        `DocuGardener: Open ${path.basename(docUri.fsPath)}`,
                        vscode.CodeActionKind.QuickFix,
                    )
                    openAction.command = {
                        command: "vscode.open",
                        title: "Open suggested doc",
                        arguments: [docUri],
                    }
                    openAction.diagnostics = [diag]
                    openAction.isPreferred = true
                    actions.push(openAction)
                } else {
                    // Create the file then open it
                    const createAction = new vscode.CodeAction(
                        `DocuGardener: Create ${path.basename(docUri.fsPath)}`,
                        vscode.CodeActionKind.QuickFix,
                    )
                    createAction.command = {
                        command: "docugardener.createAndOpenDoc",
                        title: "Create and open suggested doc",
                        arguments: [docUri, diag.message],
                    }
                    createAction.diagnostics = [diag]
                    createAction.isPreferred = true
                    actions.push(createAction)
                }
            }
        }

        return actions
    }
}
