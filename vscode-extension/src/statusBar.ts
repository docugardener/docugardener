import * as vscode from "vscode"

export class StatusBarManager implements vscode.Disposable {
    private item: vscode.StatusBarItem

    constructor() {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
        )
        this.item.command = "docugardener.checkDrift"
        this.item.tooltip = "DocuGardener — click to run drift check"
        this.item.show()
    }

    setIdle(): void {
        this.item.text = "$(eye) DocuGardener"
        this.item.color = undefined
        this.item.backgroundColor = undefined
    }

    setChecking(): void {
        this.item.text = "$(sync~spin) DocuGardener: checking..."
        this.item.color = undefined
        this.item.backgroundColor = undefined
    }

    setClean(): void {
        this.item.text = "$(pass-filled) DocuGardener: clean"
        this.item.color = new vscode.ThemeColor("testing.iconPassed")
        this.item.backgroundColor = undefined
    }

    setWarnings(count: number, severity: string): void {
        const label = count === 1 ? "1 change" : `${count} changes`
        if (severity === "critical" || severity === "significant") {
            this.item.text = `$(error) DocuGardener: ${label}`
            this.item.color = undefined
            this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground")
        } else {
            this.item.text = `$(warning) DocuGardener: ${label}`
            this.item.color = new vscode.ThemeColor("problemsWarningIcon.foreground")
            this.item.backgroundColor = undefined
        }
    }

    setError(): void {
        this.item.text = "$(alert) DocuGardener: error"
        this.item.color = new vscode.ThemeColor("testing.iconFailed")
        this.item.backgroundColor = undefined
    }

    dispose(): void {
        this.item.dispose()
    }
}
