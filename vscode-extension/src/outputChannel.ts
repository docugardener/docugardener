import * as vscode from "vscode"

interface CheckResponse {
    severity: string
    drift_score: number
    block_merge: boolean
    summary: string
    files_analyzed: number
    entity_changes: Array<{ entity: string; change_type: string; file: string }>
}

export class OutputChannelManager implements vscode.Disposable {
    private channel: vscode.OutputChannel

    constructor() {
        this.channel = vscode.window.createOutputChannel("DocuGardener")
    }

    log(message: string): void {
        const ts = new Date().toLocaleTimeString()
        this.channel.appendLine(`[${ts}] ${message}`)
    }

    logResult(result: CheckResponse): void {
        this.log(`Severity:     ${result.severity.toUpperCase()}`)
        this.log(`Drift Score:  ${result.drift_score}/100`)
        this.log(`Block Merge:  ${result.block_merge}`)
        this.log(`Summary:      ${result.summary}`)
        this.log(`Files:        ${result.files_analyzed}`)

        if (result.entity_changes.length > 0) {
            this.log("Entity changes requiring doc update:")
            for (const c of result.entity_changes) {
                this.log(`  • [${c.change_type}] ${c.entity} in ${c.file}`)
            }
        } else {
            this.log("No entity changes requiring documentation update.")
        }

        if (result.severity !== "none") {
            this.channel.show(true)
        }
    }

    dispose(): void {
        this.channel.dispose()
    }
}
