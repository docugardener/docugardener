// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Unit tests for StatusBarManager (SB-01 .. SB-05).
 * Runs in plain Node — vscode module is satisfied by vscode-mock loaded via --require.
 */

import * as assert from "assert"
import * as sinon from "sinon"
import { vscodeStub } from "./vscode-mock"
import { StatusBarManager } from "../statusBar"

describe("StatusBarManager", () => {
    let sandbox: sinon.SinonSandbox
    let capturedItem: any

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        // Make createStatusBarItem return a tracked mutable item
        capturedItem = {
            text: "",
            tooltip: "",
            command: "",
            color: undefined as any,
            backgroundColor: undefined as any,
            show: sinon.stub(),
            hide: sinon.stub(),
            dispose: sinon.stub(),
        }
        sandbox.stub(vscodeStub.window, "createStatusBarItem").returns(capturedItem)
    })

    afterEach(() => {
        sandbox.restore()
    })

    // -----------------------------------------------------------------------
    // SB-01: setIdle — text contains "DocuGardener" and backgroundColor is undefined
    // -----------------------------------------------------------------------
    it("SB-01: setIdle — text contains 'DocuGardener' and backgroundColor is undefined", () => {
        const mgr = new StatusBarManager()
        mgr.setIdle()

        assert.ok(
            capturedItem.text.includes("DocuGardener"),
            `Expected text to include 'DocuGardener', got: '${capturedItem.text}'`,
        )
        assert.strictEqual(capturedItem.backgroundColor, undefined)
    })

    // -----------------------------------------------------------------------
    // SB-02: setChecking — text contains "checking"
    // -----------------------------------------------------------------------
    it("SB-02: setChecking — text contains 'checking'", () => {
        const mgr = new StatusBarManager()
        mgr.setChecking()

        assert.ok(
            capturedItem.text.toLowerCase().includes("checking"),
            `Expected text to include 'checking', got: '${capturedItem.text}'`,
        )
    })

    // -----------------------------------------------------------------------
    // SB-03: setClean — text contains "clean"
    // -----------------------------------------------------------------------
    it("SB-03: setClean — text contains 'clean'", () => {
        const mgr = new StatusBarManager()
        mgr.setClean()

        assert.ok(
            capturedItem.text.toLowerCase().includes("clean"),
            `Expected text to include 'clean', got: '${capturedItem.text}'`,
        )
    })

    // -----------------------------------------------------------------------
    // SB-04: setWarnings with critical severity — backgroundColor is set to ThemeColor instance
    // -----------------------------------------------------------------------
    it("SB-04: setWarnings(3, 'critical') — backgroundColor is a ThemeColor instance", () => {
        const mgr = new StatusBarManager()
        mgr.setWarnings(3, "critical")

        assert.ok(
            capturedItem.backgroundColor !== undefined && capturedItem.backgroundColor !== null,
            "Expected backgroundColor to be set for critical severity",
        )
        // ThemeColor instance has an 'id' property
        assert.ok(
            typeof capturedItem.backgroundColor.id === "string",
            `Expected backgroundColor to be a ThemeColor with id, got: ${JSON.stringify(capturedItem.backgroundColor)}`,
        )
    })

    // -----------------------------------------------------------------------
    // SB-05: setWarnings with minor severity — backgroundColor is set (ThemeColor on color, not bg)
    // -----------------------------------------------------------------------
    it("SB-05: setWarnings(1, 'minor') — color is set to a ThemeColor instance", () => {
        const mgr = new StatusBarManager()
        mgr.setWarnings(1, "minor")

        // For non-critical severity, the implementation sets `color` (not backgroundColor)
        assert.ok(
            capturedItem.color !== undefined && capturedItem.color !== null,
            "Expected color to be set for minor severity",
        )
        assert.ok(
            typeof capturedItem.color.id === "string",
            `Expected color to be a ThemeColor with id, got: ${JSON.stringify(capturedItem.color)}`,
        )
    })
})
