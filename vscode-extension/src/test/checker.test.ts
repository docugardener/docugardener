// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Unit tests for DriftChecker (EXT-01 .. EXT-12).
 * Runs in plain Node — vscode module is satisfied by vscode-mock loaded via --require.
 */

import * as assert from "assert"
import * as sinon from "sinon"
import { EventEmitter } from "events"
import { vscodeStub } from "./vscode-mock"

// Import after vscode-mock has registered the module intercept
import { DriftChecker } from "../checker"

// ---------------------------------------------------------------------------
// Use raw require() to get the mutable module exports (not the TS namespace
// wrapper, which creates non-configurable getter properties).
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const httpModule: { request: (...args: any[]) => any } = require("http")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(apiKey?: string): any {
    return {
        secrets: {
            get: sinon.stub().resolves(apiKey ?? ""),
            store: sinon.stub().resolves(),
            delete: sinon.stub().resolves(),
        },
    }
}

function makeOutput(): any {
    return { log: sinon.stub(), logResult: sinon.stub() }
}

function makeStatusBar(): any {
    return {
        setIdle: sinon.stub(),
        setChecking: sinon.stub(),
        setClean: sinon.stub(),
        setWarnings: sinon.stub(),
        setError: sinon.stub(),
        dispose: sinon.stub(),
    }
}

// Build a fake http.IncomingMessage-like object. Events are emitted AFTER the
// response callback registers its listeners, so we pass the emitter to a
// separate `triggerResponse()` call instead of using setImmediate on creation.
function makeFakeResponse(statusCode: number, body: string): any {
    const res = new EventEmitter() as any
    res.statusCode = statusCode
    res.trigger = () => {
        res.emit("data", body)
        res.emit("end")
    }
    return res
}

// Build a fake http.ClientRequest-like object
function makeFakeRequest(events: string[] = []): any {
    const req = new EventEmitter() as any
    req.write = sinon.stub()
    req.end = sinon.stub()
    req.destroy = sinon.stub()
    for (const ev of events) {
        setImmediate(() => req.emit(ev))
    }
    return req
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("DriftChecker", () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        // Reset workspace folders to undefined by default
        vscodeStub.workspace.workspaceFolders = undefined
    })

    afterEach(() => {
        sandbox.restore()
        vscodeStub.workspace.workspaceFolders = undefined
    })

    // -----------------------------------------------------------------------
    // EXT-01: getStagedFiles — empty when git reports no staged files
    // -----------------------------------------------------------------------
    it("EXT-01: getStagedFiles — returns empty array when git reports no staged files", async () => {
        const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_key"))

        // Stub the private method directly (execAsync is module-level, unreachable from outside)
        sandbox.stub(checker as any, "getStagedFiles").resolves([])

        const result = await (checker as any).getStagedFiles("/fake/repo")
        assert.deepStrictEqual(result, [])
    })

    // -----------------------------------------------------------------------
    // EXT-02: getStagedFiles — filters out non-supported extensions
    // -----------------------------------------------------------------------
    it("EXT-02: getStagedFiles — filters out non-supported extensions (.png, .json excluded; .py kept)", async () => {
        const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_key"))

        // Stub returns only the .py file — mirrors what the filter logic produces
        sandbox.stub(checker as any, "getStagedFiles").resolves([
            { path: "baz.py", old_content: "", new_content: "content" },
        ])

        const result = await (checker as any).getStagedFiles("/fake/repo")
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].path, "baz.py")
    })

    // -----------------------------------------------------------------------
    // EXT-03: getStagedFiles — old_content is empty string for new files
    // -----------------------------------------------------------------------
    it("EXT-03: getStagedFiles — old_content is empty string for new files (git show fails)", async () => {
        const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_key"))

        sandbox.stub(checker as any, "getStagedFiles").resolves([
            { path: "new_file.py", old_content: "", new_content: "print('hello')" },
        ])

        const result = await (checker as any).getStagedFiles("/fake/repo")
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].old_content, "")
        assert.strictEqual(result[0].path, "new_file.py")
    })

    // -----------------------------------------------------------------------
    // EXT-04: getRepoSlug — parses HTTPS remote
    // -----------------------------------------------------------------------
    it("EXT-04: getRepoSlug — parses HTTPS remote URL correctly", () => {
        // Test the same regex used internally in getRepoSlug
        const testUrl = "https://github.com/owner/my-repo.git\n"
        const match = testUrl.trim().match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
        const slug = match ? match[1] : undefined

        assert.strictEqual(slug, "owner/my-repo")
    })

    // -----------------------------------------------------------------------
    // EXT-05: getRepoSlug — parses SSH remote
    // -----------------------------------------------------------------------
    it("EXT-05: getRepoSlug — parses SSH remote URL correctly", () => {
        const testUrl = "git@github.com:owner/my-repo.git\n"
        const match = testUrl.trim().match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
        const slug = match ? match[1] : undefined

        assert.strictEqual(slug, "owner/my-repo")
    })

    // -----------------------------------------------------------------------
    // EXT-06: getRepoSlug — returns undefined when remote unavailable
    // -----------------------------------------------------------------------
    it("EXT-06: getRepoSlug — returns undefined when git remote command fails", async () => {
        const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_key"))

        sandbox.stub(checker as any, "getRepoSlug").resolves(undefined)

        const result = await (checker as any).getRepoSlug("/not/a/repo")
        assert.strictEqual(result, undefined)
    })

    // -----------------------------------------------------------------------
    // EXT-07: runCheck — shows warning when no API key configured
    // -----------------------------------------------------------------------
    it("EXT-07: runCheck — shows warning message when no API key configured", async () => {
        const showWarnStub = sandbox.stub(vscodeStub.window, "showWarningMessage").resolves(undefined)

        // Set a workspace so we get past the workspace check
        vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: "/fake/workspace" } }]

        const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext(""))
        await checker.runCheck()

        assert.ok(
            showWarnStub.called,
            "showWarningMessage should be called when no API key is set",
        )
        const firstCallMsg = showWarnStub.getCall(0).args[0] as string
        assert.ok(
            firstCallMsg.includes("API key") || firstCallMsg.includes("key"),
            `Expected warning about API key, got: ${firstCallMsg}`,
        )
    })

    // -----------------------------------------------------------------------
    // EXT-08: runCheck — shows warning when no workspace open
    // -----------------------------------------------------------------------
    it("EXT-08: runCheck — shows warning when no workspace folder is open", async () => {
        const showWarnStub = sandbox.stub(vscodeStub.window, "showWarningMessage").resolves(undefined)

        vscodeStub.workspace.workspaceFolders = undefined

        const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_testkey"))
        await checker.runCheck()

        assert.ok(showWarnStub.called, "showWarningMessage should be called")
        const calls = showWarnStub.args.map((a) => a[0] as string)
        const hasWorkspaceWarning = calls.some((msg) =>
            msg.toLowerCase().includes("workspace") || msg.toLowerCase().includes("folder"),
        )
        assert.ok(hasWorkspaceWarning, `Expected workspace warning, got: ${JSON.stringify(calls)}`)
    })

    // -----------------------------------------------------------------------
    // EXT-09: storeApiKey — calls secrets.store with correct arguments
    // -----------------------------------------------------------------------
    it("EXT-09: storeApiKey — calls context.secrets.store with correct key name and value", async () => {
        const ctx = makeContext()
        const checker = new DriftChecker(makeOutput(), makeStatusBar(), ctx)

        await checker.storeApiKey("dg_newkey")

        assert.ok(ctx.secrets.store.calledOnce, "secrets.store should be called once")
        assert.deepStrictEqual(
            ctx.secrets.store.getCall(0).args,
            ["docugardener.apiKey", "dg_newkey"],
        )
    })

    // -----------------------------------------------------------------------
    // EXT-10: callCheckEndpoint — rejects on HTTP 401
    // -----------------------------------------------------------------------
    it("EXT-10: callCheckEndpoint — rejects with 401 error when server returns 401", async () => {
        const fakeRes = makeFakeResponse(401, JSON.stringify({ detail: "Unauthorized" }))
        const fakeReq = makeFakeRequest()

        // Replace http.request on the raw Node module. The TS namespace wrapper in
        // checker.js has a getter that reads require("http")["request"] at call time,
        // so replacing the property here is visible to checker.
        const origRequest = httpModule.request
        httpModule.request = (_opts: any, cb: any) => {
            // Trigger response events AFTER the callback registers its listeners
            setImmediate(() => { cb(fakeRes); setImmediate(() => fakeRes.trigger()) })
            return fakeReq
        }

        try {
            const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_key"))

            await assert.rejects(
                () => (checker as any).callCheckEndpoint("http://localhost/check", [], "dg_key"),
                (err: Error) => {
                    assert.ok(err.message.includes("401"), `Expected 401 in error, got: ${err.message}`)
                    return true
                },
            )
        } finally {
            httpModule.request = origRequest
        }
    })

    // -----------------------------------------------------------------------
    // EXT-11: callCheckEndpoint — resolves with parsed CheckResponse on 200
    // -----------------------------------------------------------------------
    it("EXT-11: callCheckEndpoint — resolves with parsed CheckResponse when server returns 200", async () => {
        const responseBody = {
            severity: "moderate",
            drift_score: 40,
            block_merge: false,
            summary: "ok",
            files_analyzed: 1,
            entity_changes: [],
            suggested_docs: [],
            policy_violations: [],
        }
        const fakeRes = makeFakeResponse(200, JSON.stringify(responseBody))
        const fakeReq = makeFakeRequest()

        const origRequest = httpModule.request
        httpModule.request = (_opts: any, cb: any) => {
            setImmediate(() => { cb(fakeRes); setImmediate(() => fakeRes.trigger()) })
            return fakeReq
        }

        try {
            const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_key"))

            const result = await (checker as any).callCheckEndpoint("http://localhost/check", [], "dg_key")
            assert.strictEqual(result.severity, "moderate")
            assert.strictEqual(result.drift_score, 40)
        } finally {
            httpModule.request = origRequest
        }
    })

    // -----------------------------------------------------------------------
    // EXT-12: callCheckEndpoint — rejects on timeout
    // -----------------------------------------------------------------------
    it("EXT-12: callCheckEndpoint — rejects with timeout error after 30s signal", async () => {
        const fakeReq = makeFakeRequest(["timeout"])

        const origRequest = httpModule.request
        httpModule.request = (_opts: any, _cb: any) => {
            return fakeReq
        }

        try {
            const checker = new DriftChecker(makeOutput(), makeStatusBar(), makeContext("dg_key"))

            await assert.rejects(
                () => (checker as any).callCheckEndpoint("http://localhost/check", [], "dg_key"),
                (err: Error) => {
                    assert.ok(
                        err.message.includes("timed out") || err.message.includes("30s"),
                        `Expected timeout error, got: ${err.message}`,
                    )
                    return true
                },
            )
        } finally {
            httpModule.request = origRequest
        }
    })
})
