// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

const STORAGE_KEY = "dg-cookie-consent"

export function CookieBanner() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (!localStorage.getItem(STORAGE_KEY)) {
            setVisible(true)
        }
    }, [])

    function dismiss() {
        localStorage.setItem(STORAGE_KEY, "1")
        setVisible(false)
    }

    if (!visible) return null

    return (
        <div className="fixed bottom-0 inset-x-0 z-50 p-4 pointer-events-none">
            <div className="max-w-2xl mx-auto bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-4 flex items-center gap-4 pointer-events-auto">
                <p className="text-sm flex-1 text-gray-300 leading-snug">
                    We use essential cookies only — no tracking, no analytics.{" "}
                    <Link href="/privacy" className="underline text-white hover:text-gray-200 transition-colors">
                        Privacy Policy
                    </Link>
                </p>
                <button
                    onClick={dismiss}
                    className="shrink-0 bg-white text-gray-900 text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    Got it
                </button>
            </div>
        </div>
    )
}
