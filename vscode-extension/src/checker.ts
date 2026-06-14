import * as vscode from "vscode"
import * as cp from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as http from "http"
import * as https from "https"
import { StatusBarManager } from "./statusBar"
import { OutputChannelManager } from "./outputChannel"

// Staged blobs can be large; allow up to 10 MB of git stdout before erroring.
const GIT_MAX_BUFFER = 10 * 1024 * 1024

/**
 * Injection-safe git invocation. Uses execFile with an argument **array** (no
 * shell), so file paths and refs are passed verbatim as argv entries and can
 * never be interpreted as shell syntax (backticks, ;, $(), …). Reads
 * `child_process.execFile` at call time so tests can substitute it.
 */
function execFileAsync(
    file: string,
    args: string[],
    opts: cp.ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        cp.execFile(file, args, opts, (err, stdout, stderr) => {
            if (err) {
                reject(err)
                return
            }
            const toStr = (v: string | Buffer): string =>
                typeof v === "string" ? v : v.toString("utf-8")
            resolve({ stdout: toStr(stdout), stderr: toStr(stderr) })
        })
    })
}

interface FileInput {
    path: string
    old_content: string
    new_content: string
}

interface EntityChangeSummary {
    entity: string
    change_type: string
    file: string
}

// IDE-01 AC-1: suggested documentation file
export interface SuggestedDoc {
    file: string
    section?: string
    reason: string
}

// IDE-01 AC-2: policy violation from repo policy
export interface PolicyViolation {
    rule_name: string
    enforcement: string
    paths_matched: string[]
    docs_missing: string[]
    reason: string
}

interface CheckResponse {
    severity: string
    drift_score: number
    block_merge: boolean
    summary: string
    files_analyzed: number
    entity_changes: EntityChangeSummary[]
    suggested_docs: SuggestedDoc[]
    policy_violations: PolicyViolation[]
}

// Diagnostic code constants — used by CodeActionProvider to identify our diagnostics
export const DIAGNOSTIC_CODE_DRIFT = "docugardener.drift"
export const DIAGNOSTIC_CODE_POLICY = "docugardener.policy"
export const DIAGNOSTIC_CODE_SUGGESTED_DOC = "docugardener.suggestedDoc"

const SUPPORTED_EXTENSIONS = new Set([
    ".py", ".js", ".jsx", ".ts", ".tsx",
    ".mjs", ".cjs", ".html", ".htm", ".css",
])

const SEVERITY_TO_VSCODE: Record<string, vscode.DiagnosticSeverity> = {
    critical: vscode.DiagnosticSeverity.Error,
    significant: vscode.DiagnosticSeverity.Error,
    moderate: vscode.DiagnosticSeverity.Warning,
    minor: vscode.DiagnosticSeverity.Information,
    none: vscode.DiagnosticSeverity.Hint,
}

export class DriftChecker {
    private diagnostics: vscode.DiagnosticCollection

    constructor(
        private output: OutputChannelManager,
        private statusBar: StatusBarManager,
        private context: vscode.ExtensionContext,
    ) {
        this.diagnostics = vscode.languages.createDiagnosticCollection("docugardener")
    }

    getDiagnosticCollection(): vscode.DiagnosticCollection {
        return this.diagnostics
    }

    async runCheck(): Promise<void> {
        const config = vscode.workspace.getConfiguration("docugardener")
        const enabled: boolean = config.get("enabled", true)
        if (!enabled) {
            this.output.log("DocuGardener is disabled — skipping check")
            return
        }

        const backendUrl: string = config.get("backendUrl", "https://docugardener.dev").replace(/\/$/, "")
        const apiKey: string = await this.context.secrets.get("docugardener.apiKey") ?? ""
        const blockOnCritical: boolean = config.get("blockOnCritical", false)

        if (!apiKey) {
            const choice = await vscode.window.showWarningMessage(
                "DocuGardener: No API key configured.",
                "Enter Key",
                "Open Web App",
            )
            if (choice === "Enter Key") {
                await this.promptForApiKey()
            } else if (choice === "Open Web App") {
                vscode.env.openExternal(
                    vscode.Uri.parse(`${backendUrl}/dashboard/settings?tab=integrations`),
                )
            }
            return
        }

        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage("DocuGardener: No workspace folder open.")
            return
        }
        const repoRoot = workspaceFolders[0].uri.fsPath

        this.statusBar.setChecking()
        this.output.log("─".repeat(60))
        this.output.log("Running drift check...")
        this.diagnostics.clear()

        let files: FileInput[]
        try {
            files = await this.getStagedFiles(repoRoot)
        } catch (err: any) {
            this.output.log(`ERROR collecting staged files: ${err.message}`)
            vscode.window.showErrorMessage(`DocuGardener: Failed to read staged files — ${err.message}`)
            this.statusBar.setError()
            return
        }

        if (files.length === 0) {
            this.output.log("No staged files with supported extensions — nothing to check.")
            this.statusBar.setClean()
            vscode.window.showInformationMessage("DocuGardener: No staged source files to check.")
            return
        }

        this.output.log(`Checking ${files.length} staged file(s): ${files.map(f => path.basename(f.path)).join(", ")}`)

        // IDE-01 AC-2: extract repo slug from git remote for policy context
        const repoSlug = await this.getRepoSlug(repoRoot)
        if (repoSlug) {
            this.output.log(`Repo: ${repoSlug} (policy context enabled)`)
        }

        let result: CheckResponse
        try {
            result = await this.callCheckEndpoint(`${backendUrl}/check`, files, apiKey, repoSlug)
        } catch (err: any) {
            this.output.log(`ERROR calling backend: ${err.message}`)
            vscode.window.showErrorMessage(`DocuGardener: Backend unreachable — ${err.message}`)
            this.statusBar.setError()
            return
        }

        this.applyDiagnostics(result, repoRoot)
        this.output.logResult(result)

        const count = result.entity_changes.length
        const severity = result.severity

        if (severity === "none" && result.policy_violations.length === 0) {
            this.statusBar.setClean()
            vscode.window.showInformationMessage(`DocuGardener: No documentation drift detected.`)
        } else {
            const policyCount = result.policy_violations.length
            const policyNote = policyCount > 0 ? ` · ${policyCount} policy violation${policyCount > 1 ? "s" : ""}` : ""
            this.statusBar.setWarnings(count, severity)
            const msg = `DocuGardener: ${severity.toUpperCase()} drift detected — ${result.summary}${policyNote}`
            if ((severity === "critical" || severity === "significant") && blockOnCritical) {
                const choice = await vscode.window.showWarningMessage(msg, { modal: true }, "Dismiss")
                void choice
            } else {
                vscode.window.showWarningMessage(msg)
            }
        }
    }

    /**
     * Run a git subcommand with an argument array (no shell) and return stdout.
     * Centralises the injection-safe invocation; stubbable in tests.
     */
    private async git(args: string[], cwd: string): Promise<string> {
        const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: GIT_MAX_BUFFER })
        return stdout
    }

    // IDE-01 AC-2: extract "owner/repo" from git remote URL
    private async getRepoSlug(repoRoot: string): Promise<string | undefined> {
        try {
            const remoteUrl = (await this.git(["remote", "get-url", "origin"], repoRoot)).trim()
            // Handles https://github.com/owner/repo.git and git@github.com:owner/repo.git
            const match = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
            return match ? match[1] : undefined
        } catch {
            return undefined
        }
    }

    private async getStagedFiles(repoRoot: string): Promise<FileInput[]> {
        const stagedOutput = (await this.git(
            ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
            repoRoot,
        )).trim()

        if (!stagedOutput) return []

        const relPaths = stagedOutput.split("\n").filter(p => {
            const ext = path.extname(p).toLowerCase()
            return SUPPORTED_EXTENSIONS.has(ext)
        })

        const files: FileInput[] = []
        for (const relPath of relPaths) {
            const absPath = path.join(repoRoot, relPath)

            let newContent = ""
            try {
                newContent = await fs.promises.readFile(absPath, "utf-8")
            } catch {
                continue
            }

            let oldContent = ""
            try {
                // Arg array → `HEAD:<path>` is one argv entry; path can't inject shell.
                oldContent = await this.git(["show", `HEAD:${relPath}`], repoRoot)
            } catch {
                // New file — old_content stays ""
            }

            files.push({ path: relPath, old_content: oldContent, new_content: newContent })
        }

        return files
    }

    private callCheckEndpoint(
        url: string,
        files: FileInput[],
        apiKey: string,
        repo?: string,
    ): Promise<CheckResponse> {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({ files, ...(repo ? { repo } : {}) })
            const parsed = new URL(url)
            const isHttps = parsed.protocol === "https:"
            const mod = isHttps ? https : http

            const req = mod.request(
                {
                    hostname: parsed.hostname,
                    port: parsed.port || (isHttps ? 443 : 80),
                    path: parsed.pathname + parsed.search,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(body),
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    timeout: 30_000,
                },
                (res) => {
                    let raw = ""
                    res.on("data", (chunk) => (raw += chunk))
                    res.on("end", () => {
                        if (res.statusCode === 200) {
                            try {
                                resolve(JSON.parse(raw) as CheckResponse)
                            } catch {
                                reject(new Error("Invalid JSON in response"))
                            }
                        } else {
                            let detail = raw
                            try {
                                detail = JSON.parse(raw)?.detail || raw
                            } catch { /* ignore */ }
                            reject(new Error(`HTTP ${res.statusCode}: ${detail}`))
                        }
                    })
                },
            )

            req.on("error", reject)
            req.on("timeout", () => {
                req.destroy()
                reject(new Error("Request timed out after 30s"))
            })
            req.write(body)
            req.end()
        })
    }

    private applyDiagnostics(result: CheckResponse, repoRoot: string): void {
        const vscodeSeverity =
            SEVERITY_TO_VSCODE[result.severity] ?? vscode.DiagnosticSeverity.Warning

        // ── Drift diagnostics — one per changed entity, grouped by file ──────
        if (result.entity_changes.length > 0) {
            const byFile = new Map<string, EntityChangeSummary[]>()
            for (const change of result.entity_changes) {
                const abs = path.isAbsolute(change.file)
                    ? change.file
                    : path.join(repoRoot, change.file)
                const existing = byFile.get(abs) ?? []
                existing.push(change)
                byFile.set(abs, existing)
            }

            for (const [filePath, changes] of byFile) {
                const uri = vscode.Uri.file(filePath)
                const diagnosticList: vscode.Diagnostic[] = changes.map((c) => {
                    const range = new vscode.Range(0, 0, 0, 0)
                    const diag = new vscode.Diagnostic(
                        range,
                        `[DocuGardener] ${c.entity} — ${c.change_type.replace(/_/g, " ")} (${result.severity} drift)`,
                        vscodeSeverity,
                    )
                    diag.source = "DocuGardener"
                    diag.code = DIAGNOSTIC_CODE_DRIFT
                    return diag
                })
                this.diagnostics.set(uri, diagnosticList)
            }
        }

        // ── IDE-01 AC-1: suggested doc diagnostics — one per suggested file ──
        // Attach to the first staged source file as an anchor point
        if (result.suggested_docs.length > 0) {
            const anchorFile = result.entity_changes[0]?.file
            const anchorAbs = anchorFile
                ? (path.isAbsolute(anchorFile) ? anchorFile : path.join(repoRoot, anchorFile))
                : path.join(repoRoot, result.suggested_docs[0].file)
            const anchorUri = vscode.Uri.file(anchorAbs)

            const existingDiags = [...(this.diagnostics.get(anchorUri) ?? [])]
            for (const doc of result.suggested_docs) {
                const diag = new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    `[DocuGardener] Update docs: ${doc.file}${doc.section ? ` § ${doc.section}` : ""} — ${doc.reason}`,
                    vscode.DiagnosticSeverity.Warning,
                )
                diag.source = "DocuGardener"
                // Store suggested doc path in code so CodeActionProvider can read it
                diag.code = { value: DIAGNOSTIC_CODE_SUGGESTED_DOC, target: vscode.Uri.file(path.join(repoRoot, doc.file)) }
                existingDiags.push(diag)
            }
            this.diagnostics.set(anchorUri, existingDiags)
        }

        // ── IDE-01 AC-2: policy violation diagnostics ─────────────────────────
        if (result.policy_violations.length > 0) {
            // Find a source file matched by the policy to anchor the diagnostic
            for (const violation of result.policy_violations) {
                const matchedFile = violation.paths_matched[0]
                const anchorAbs = matchedFile
                    ? path.join(repoRoot, matchedFile)
                    : path.join(repoRoot, result.entity_changes[0]?.file ?? "")
                const anchorUri = vscode.Uri.file(anchorAbs)
                const existingDiags = [...(this.diagnostics.get(anchorUri) ?? [])]

                const severity = violation.enforcement === "advisory"
                    ? vscode.DiagnosticSeverity.Information
                    : vscode.DiagnosticSeverity.Error

                const diag = new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    `[DocuGardener Policy] ${violation.rule_name}: ${violation.reason}`,
                    severity,
                )
                diag.source = "DocuGardener"
                diag.code = DIAGNOSTIC_CODE_POLICY
                existingDiags.push(diag)
                this.diagnostics.set(anchorUri, existingDiags)
            }
        }
    }

    async storeApiKey(key: string): Promise<void> {
        await this.context.secrets.store("docugardener.apiKey", key)
    }

    /** Remove the stored API key from SecretStorage. */
    async clearApiKey(): Promise<void> {
        await this.context.secrets.delete("docugardener.apiKey")
    }

    /**
     * Single source of truth for the API-key input flow. Stores into
     * SecretStorage (never settings.json). Returns true if a key was saved.
     */
    async promptForApiKey(): Promise<boolean> {
        const key = await vscode.window.showInputBox({
            prompt: "Paste your DocuGardener API key (generated in Settings → VS Code Plugin)",
            password: true,
            placeHolder: "dg_...",
            validateInput: (v) => (v.startsWith("dg_") ? null : "Key must start with dg_"),
        })
        if (key) {
            await this.storeApiKey(key)
            vscode.window.showInformationMessage("DocuGardener: API key saved. You're ready to go!")
            return true
        }
        return false
    }

    dispose(): void {
        this.diagnostics.dispose()
    }
}
