// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shared severity colour config used by DriftAlertList and SemanticDiffViewer.
 * Severity values match what the LLM returns: critical | significant | moderate | minor | none
 */

export type Severity = "critical" | "significant" | "moderate" | "minor" | "none";

export interface SeverityStyle {
    /** Tailwind dot colour (filled circle) */
    dot: string;
    /** Tailwind badge classes (bg + text + border) */
    badge: string;
    /** Tailwind left-border accent for list cards */
    border: string;
    /** Human-readable label */
    label: string;
}

export const SEVERITY_CONFIG: Record<Severity, SeverityStyle> = {
    critical:    { dot: "bg-rose-500",    badge: "bg-rose-500/10 text-rose-500 border-rose-500/30",       border: "border-l-rose-500",    label: "Critical"    },
    significant: { dot: "bg-orange-400",  badge: "bg-orange-500/10 text-orange-500 border-orange-500/30", border: "border-l-orange-400",  label: "Significant" },
    moderate:    { dot: "bg-amber-400",   badge: "bg-amber-500/10 text-amber-500 border-amber-500/30",    border: "border-l-amber-400",   label: "Moderate"    },
    minor:       { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", border: "border-l-emerald-500", label: "Minor"    },
    none:        { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", border: "border-l-emerald-500", label: "None"     },
};

const LEGACY_MAP: Record<string, Severity> = {
    high:   "critical",
    medium: "moderate",
    low:    "minor",
};

/** Normalise any severity string (including legacy "high"/"medium"/"low") to a known Severity. */
export function normaliseSeverity(raw: string | undefined | null): Severity {
    if (!raw) return "none";
    const lower = raw.toLowerCase() as Severity;
    if (lower in SEVERITY_CONFIG) return lower;
    return LEGACY_MAP[lower] ?? "none";
}
