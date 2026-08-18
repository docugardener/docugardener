// SPDX-License-Identifier: AGPL-3.0-or-later
// Covers the two exported predicates in lib/job-status.ts. getUiStatus() was
// already exercised via the Inbox/Jobs tests, but isInFlight() and
// needsHumanAction() had no direct coverage — they were the whole of the
// 33% function coverage on this file that held the global gate under 70%.
import { describe, it, expect } from "vitest"

import {
    isInFlight,
    needsHumanAction,
    UI_STATUS_LABEL,
    type UiStatus,
} from "@/lib/job-status"

const ALL_STATUSES = Object.keys(UI_STATUS_LABEL) as UiStatus[]

const IN_FLIGHT: UiStatus[] = ["QUEUED", "ANALYZING", "AI_FIXING"]
const NEEDS_ACTION: UiStatus[] = ["NEEDS_REVIEW"]

describe("isInFlight", () => {
    it.each(IN_FLIGHT)("treats %s as actively being worked on", (status) => {
        expect(isInFlight(status)).toBe(true)
    })

    it.each(ALL_STATUSES.filter((s) => !IN_FLIGHT.includes(s)))(
        "treats %s as not in flight",
        (status) => {
            expect(isInFlight(status)).toBe(false)
        },
    )

    it("never reports a terminal state as in flight", () => {
        // Terminal states drive "stop polling" in the UI — a false positive here
        // would leave the Inbox spinning forever on a finished job.
        const terminal: UiStatus[] = [
            "RESOLVED",
            "DISMISSED",
            "NO_DRIFT",
            "FAILED",
            "QUOTA_EXCEEDED",
            "FIX_PR_CANCELLED",
        ]
        expect(terminal.some(isInFlight)).toBe(false)
    })
})

describe("needsHumanAction", () => {
    it.each(NEEDS_ACTION)("flags %s as requiring the user", (status) => {
        expect(needsHumanAction(status)).toBe(true)
    })

    it.each(ALL_STATUSES.filter((s) => !NEEDS_ACTION.includes(s)))(
        "does not flag %s",
        (status) => {
            expect(needsHumanAction(status)).toBe(false)
        },
    )

    it("is mutually exclusive with isInFlight", () => {
        // A job cannot simultaneously be the system's turn and the user's turn.
        for (const status of ALL_STATUSES) {
            expect(isInFlight(status) && needsHumanAction(status)).toBe(false)
        }
    })
})

describe("UI_STATUS_LABEL", () => {
    it("has a non-empty label for every UiStatus", () => {
        for (const status of ALL_STATUSES) {
            expect(UI_STATUS_LABEL[status]).toBeTruthy()
        }
    })
})
