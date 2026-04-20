// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"
import { useEffect } from "react"

export function JobsLastVisited() {
    useEffect(() => {
        localStorage.setItem("dg-jobs-last-visited", new Date().toISOString())
    }, [])
    return null
}
