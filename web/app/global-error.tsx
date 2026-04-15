// SPDX-License-Identifier: AGPL-3.0-or-later
// global-error.tsx replaces the root layout entirely — no providers available.
// Keep this component dependency-free to avoid hook/context errors during
// static prerendering of /_global-error in Next.js 15+.
"use client"

export default function GlobalError({
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html lang="en">
            <body style={{ fontFamily: "sans-serif", padding: "2rem", background: "#0a0a0a", color: "#ededed" }}>
                <h2>Something went wrong</h2>
                <p style={{ color: "#888", marginBottom: "1rem" }}>An unexpected error occurred. Please try again.</p>
                <button
                    onClick={() => reset()}
                    style={{
                        padding: "0.5rem 1rem",
                        background: "#22c55e",
                        color: "#000",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                    }}
                >
                    Try again
                </button>
            </body>
        </html>
    )
}
