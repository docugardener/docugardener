// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * FEED-01: Feedback thank-you landing page.
 *
 * Redirect target after clicking a feedback link in a PR comment.
 * No auth required — this page is public.
 *
 * ?err=1 → show a gentle error message instead of the success state.
 */

import Link from "next/link"
import { CheckCircle2, AlertCircle } from "lucide-react"

export default function FeedbackThankYouPage({
    searchParams,
}: {
    searchParams: { err?: string }
}) {
    const isError = searchParams.err === "1"

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center space-y-6">
                {isError ? (
                    <>
                        <AlertCircle className="mx-auto h-12 w-12 text-yellow-400" />
                        <h1 className="text-2xl font-black tracking-tight text-foreground">
                            Invalid or expired link
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            This feedback link is no longer valid. It may have already been used or has expired.
                        </p>
                    </>
                ) : (
                    <>
                        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                        <h1 className="text-2xl font-black tracking-tight text-foreground">
                            Thanks for your feedback!
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Your signal helps DocuGardener improve its accuracy over time.
                        </p>
                    </>
                )}

                <Link
                    href="/dashboard"
                    className="inline-block mt-4 text-sm font-bold text-primary hover:underline"
                >
                    Go to Dashboard →
                </Link>
            </div>
        </div>
    )
}
