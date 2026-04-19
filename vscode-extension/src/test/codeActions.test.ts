// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Unit tests for DocuGardenerCodeActionProvider (CA-01 .. CA-04).
 * Runs in plain Node — vscode module is satisfied by vscode-mock loaded via --require.
 */

import * as assert from "assert"
import { vscodeStub } from "./vscode-mock"
import { DocuGardenerCodeActionProvider } from "../codeActions"
import { DIAGNOSTIC_CODE_SUGGESTED_DOC } from "../checker"

// Use raw require() to get the mutable module exports — the TS namespace wrapper
// creates non-configurable getter properties that sinon cannot stub.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsModule: { existsSync: (p: string) => boolean } = require("fs")

describe("DocuGardenerCodeActionProvider", () => {
    let provider: DocuGardenerCodeActionProvider

    beforeEach(() => {
        provider = new DocuGardenerCodeActionProvider()
    })

    // Helper: build a fake diagnostic with source = "DocuGardener" and a suggestedDoc code
    function makeSuggestedDocDiag(docPath: string): any {
        return {
            source: "DocuGardener",
            message: "[DocuGardener] Update docs: some reason",
            severity: 1,
            range: new (vscodeStub.Range as any)(0, 0, 0, 0),
            code: {
                value: DIAGNOSTIC_CODE_SUGGESTED_DOC,
                target: vscodeStub.Uri.file(docPath),
            },
        }
    }

    // Fake document and range (not inspected by provider)
    const fakeDocument: any = { uri: vscodeStub.Uri.file("/workspace/src/main.py") }
    const fakeRange: any = new (vscodeStub.Range as any)(0, 0, 0, 0)

    // -----------------------------------------------------------------------
    // CA-01: returns Open action when doc file exists
    // -----------------------------------------------------------------------
    it("CA-01: returns 'Open' action when the suggested doc file exists", () => {
        const origExistsSync = fsModule.existsSync
        fsModule.existsSync = () => true

        try {
            const diag = makeSuggestedDocDiag("/workspace/docs/README.md")
            const context: any = { diagnostics: [diag] }

            const actions = provider.provideCodeActions(fakeDocument, fakeRange, context)

            assert.strictEqual(actions.length, 1, "Expected exactly one action")
            assert.ok(
                actions[0].title.includes("Open"),
                `Expected title to include 'Open', got: '${actions[0].title}'`,
            )
        } finally {
            fsModule.existsSync = origExistsSync
        }
    })

    // -----------------------------------------------------------------------
    // CA-02: returns Create action when doc file does not exist
    // -----------------------------------------------------------------------
    it("CA-02: returns 'Create' action when the suggested doc file does not exist", () => {
        const origExistsSync = fsModule.existsSync
        fsModule.existsSync = () => false

        try {
            const diag = makeSuggestedDocDiag("/workspace/docs/NEW_DOC.md")
            const context: any = { diagnostics: [diag] }

            const actions = provider.provideCodeActions(fakeDocument, fakeRange, context)

            assert.strictEqual(actions.length, 1, "Expected exactly one action")
            assert.ok(
                actions[0].title.includes("Create"),
                `Expected title to include 'Create', got: '${actions[0].title}'`,
            )
        } finally {
            fsModule.existsSync = origExistsSync
        }
    })

    // -----------------------------------------------------------------------
    // CA-03: skips non-DocuGardener diagnostics
    // -----------------------------------------------------------------------
    it("CA-03: skips diagnostics whose source is not 'DocuGardener'", () => {
        const origExistsSync = fsModule.existsSync
        fsModule.existsSync = () => true

        try {
            const diag = makeSuggestedDocDiag("/workspace/docs/README.md")
            diag.source = "eslint"  // Not a DocuGardener diagnostic
            const context: any = { diagnostics: [diag] }

            const actions = provider.provideCodeActions(fakeDocument, fakeRange, context)

            assert.deepStrictEqual(actions, [], "Expected no actions for non-DocuGardener diagnostic")
        } finally {
            fsModule.existsSync = origExistsSync
        }
    })

    // -----------------------------------------------------------------------
    // CA-04: returned action has isPreferred = true
    // -----------------------------------------------------------------------
    it("CA-04: returned action has isPreferred set to true", () => {
        const origExistsSync = fsModule.existsSync
        fsModule.existsSync = () => true

        try {
            const diag = makeSuggestedDocDiag("/workspace/docs/README.md")
            const context: any = { diagnostics: [diag] }

            const actions = provider.provideCodeActions(fakeDocument, fakeRange, context)

            assert.strictEqual(actions.length, 1)
            assert.strictEqual(actions[0].isPreferred, true, "Expected isPreferred to be true")
        } finally {
            fsModule.existsSync = origExistsSync
        }
    })
})
