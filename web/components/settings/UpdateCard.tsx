"use client"

/**
 * HYB-15: Update notification card for Settings page.
 *
 * Shown only in client-installed and air-gap modes.
 * Displays version, severity badge, release notes link, and copy-paste Helm upgrade command.
 */

import { useState } from "react"
import { CheckCircle, AlertTriangle, AlertOctagon, Copy, Check, ExternalLink } from "lucide-react"

interface UpdateData {
    available: boolean
    latestVersion?: string
    severity?: "critical" | "recommended" | "optional"
    helmChartUrl?: string | null
    releaseNotesUrl?: string | null
    changelogSummary?: string | null
}

interface UpdateCardProps {
    update: UpdateData | null
}

const SEVERITY_CONFIG = {
    critical: {
        icon: AlertOctagon,
        bg: "bg-red-50 border-red-200",
        badge: "bg-red-100 text-red-700",
        text: "Critical Update",
    },
    recommended: {
        icon: AlertTriangle,
        bg: "bg-amber-50 border-amber-200",
        badge: "bg-amber-100 text-amber-700",
        text: "Recommended Update",
    },
    optional: {
        icon: CheckCircle,
        bg: "bg-blue-50 border-blue-200",
        badge: "bg-blue-100 text-blue-700",
        text: "Optional Update",
    },
}

export function UpdateCard({ update }: UpdateCardProps) {
    const [copied, setCopied] = useState(false)

    if (!update?.available) {
        return (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>DocuGardener is up to date.</span>
            </div>
        )
    }

    const severity = update.severity ?? "optional"
    const cfg = SEVERITY_CONFIG[severity]
    const SeverityIcon = cfg.icon

    const helmCommand = update.helmChartUrl
        ? `helm upgrade docugardener ${update.helmChartUrl}`
        : `helm repo update && helm upgrade docugardener docugardener/docugardener --version ${update.latestVersion}`

    const handleCopy = async () => {
        await navigator.clipboard.writeText(helmCommand)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className={`rounded-lg border p-4 space-y-3 ${cfg.bg}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SeverityIcon className="h-5 w-5" />
                    <span className="font-medium text-sm">{cfg.text}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                    v{update.latestVersion}
                </span>
            </div>

            {update.changelogSummary && (
                <p className="text-sm text-gray-600">{update.changelogSummary}</p>
            )}

            {update.releaseNotesUrl && (
                <a
                    href={update.releaseNotesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                    Release notes <ExternalLink className="h-3 w-3" />
                </a>
            )}

            <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">Helm upgrade command:</p>
                <div className="flex items-center gap-2 bg-white border rounded px-3 py-2">
                    <code className="text-xs text-gray-800 flex-1 truncate">{helmCommand}</code>
                    <button
                        onClick={handleCopy}
                        className="text-gray-400 hover:text-gray-600 shrink-0"
                        title="Copy to clipboard"
                    >
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </div>
    )
}
