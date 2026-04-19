// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Minimal vscode module stub for unit tests running outside VS Code.
 * Loaded via mocha --require so all imports of 'vscode' get this stub.
 */

// Register before any test module is loaded
const Module = require("module")
const originalLoad = Module._load

Module._load = function (request: string, ...args: any[]) {
    if (request === "vscode") {
        return vscodeStub
    }
    return originalLoad(request, ...args)
}

export const vscodeStub = {
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    DiagnosticCollection: class {},
    Diagnostic: class {
        constructor(public range: any, public message: string, public severity: number) {}
        source = ""
        code: any = undefined
    },
    Range: class {
        constructor(public sl: number, public sc: number, public el: number, public ec: number) {}
    },
    Uri: {
        file: (p: string) => ({ fsPath: p, toString: () => p }),
        parse: (s: string) => ({ toString: () => s }),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    CodeActionKind: { QuickFix: { value: "quickfix" } },
    CodeAction: class {
        constructor(public title: string, public kind: any) {}
        command: any = undefined
        diagnostics: any[] = []
        isPreferred = false
    },
    languages: {
        createDiagnosticCollection: (_name: string) => ({
            clear: () => {},
            set: (_uri: any, _diags: any[]) => {},
            get: (_uri: any) => undefined,
            dispose: () => {},
        }),
    },
    window: {
        createStatusBarItem: () => ({
            text: "",
            tooltip: "",
            command: "",
            color: undefined as any,
            backgroundColor: undefined as any,
            show: () => {},
            hide: () => {},
            dispose: () => {},
        }),
        createOutputChannel: (_name: string) => ({
            appendLine: (_msg: string) => {},
            show: () => {},
            dispose: () => {},
        }),
        showInformationMessage: (..._args: any[]) => Promise.resolve(undefined),
        showWarningMessage: (..._args: any[]) => Promise.resolve(undefined),
        showErrorMessage: (..._args: any[]) => Promise.resolve(undefined),
        showInputBox: (..._args: any[]) => Promise.resolve(undefined),
    },
    workspace: {
        getConfiguration: (_section: string) => ({
            get: (_key: string, def: any) => def,
        }),
        workspaceFolders: undefined as any,
    },
    env: {
        openExternal: () => Promise.resolve(true),
    },
    commands: {
        executeCommand: () => Promise.resolve(),
    },
    ThemeColor: class {
        constructor(public id: string) {}
    },
}
