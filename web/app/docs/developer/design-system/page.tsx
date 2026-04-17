// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusChip } from "@/components/ui/status-chip"
import { Badge } from "@/components/ui/badge"

export const metadata = {
    title: "Design System | DocuGardener Developer Docs",
    description: "Token reference, component primitives, and usage rules for the DocuGardener UI.",
}

export default function DesignSystemPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-12 space-y-16">

            {/* Header */}
            <div className="space-y-3">
                <StatusChip variant="primary" label="DESIGN SYSTEM" />
                <h1 className="text-3xl font-black tracking-tighter text-foreground">Design System</h1>
                <p className="text-muted-foreground text-base leading-relaxed">
                    Token reference, component primitives, and contribution rules for the DocuGardener UI.
                    All values here are locked — do not hardcode colours, shadows, or radius values in components.
                    Use only the tokens and primitives listed below.
                </p>
                <p className="text-sm text-muted-foreground">
                    Live preview:{" "}
                    <Link href="/ux-preview/design-system.html" target="_blank" className="text-primary hover:underline font-medium">
                        /ux-preview/design-system.html
                    </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                    Repo-level quick reference:{" "}
                    <Link href="https://github.com/docugardener/docugardener/blob/main/docs/design-system.md" target="_blank" className="text-primary hover:underline font-medium">
                        docs/design-system.md
                    </Link>
                </p>
            </div>

            {/* Colour tokens */}
            <section className="space-y-6">
                <h2 className="text-xl font-black tracking-tight">Colour Tokens</h2>
                <p className="text-sm text-muted-foreground">
                    Defined in <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">web/app/globals.css</code> as CSS custom properties on{" "}
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">:root</code> and{" "}
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">.dark</code>.
                    Never use raw hex values in components.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        { token: "--background",        use: "Page / shell background" },
                        { token: "--foreground",        use: "Primary text" },
                        { token: "--card",              use: "Card surface" },
                        { token: "--border",            use: "Card/input borders" },
                        { token: "--input",             use: "Input field borders" },
                        { token: "--primary",           use: "Brand accent — buttons, links" },
                        { token: "--muted",             use: "Subdued surface (headers, sidebars)" },
                        { token: "--muted-foreground",  use: "Secondary / helper text" },
                        { token: "--status-fresh",      use: "StatusChip: fresh (green / healthy)" },
                        { token: "--status-withered",   use: "StatusChip: withered (amber / degraded)" },
                        { token: "--status-broken",     use: "StatusChip: broken (red / critical)" },
                    ].map(({ token, use }) => (
                        <div key={token} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                            <code className="font-mono text-xs text-primary shrink-0 mt-0.5">{token}</code>
                            <span className="text-xs text-muted-foreground">{use}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Spacing / radius */}
            <section className="space-y-6">
                <h2 className="text-xl font-black tracking-tight">Spacing &amp; Radius Tokens</h2>
                <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b border-border text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left">Token / class</th>
                                <th className="px-4 py-3 text-left">Value</th>
                                <th className="px-4 py-3 text-left">Use</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {[
                                { token: ".rounded-card",   value: "0.75rem",                 use: "All Card components" },
                                { token: "--radius",        value: "0.5rem",                  use: "Base shadcn radius" },
                                { token: ".app-container",  value: "max-w-7xl + px-6/8",      use: "Page content wrapper" },
                                { token: ".shadow-card",    value: "subtle ring + drop-shadow",use: "Default card shadow" },
                                { token: ".shadow-card-hover", value: "elevated on hover",    use: "Interactive cards" },
                            ].map(({ token, value, use }) => (
                                <tr key={token}>
                                    <td className="px-4 py-2.5 font-mono text-xs text-primary">{token}</td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{value}</td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{use}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* StatusChip */}
            <section className="space-y-6">
                <h2 className="text-xl font-black tracking-tight">StatusChip</h2>
                <p className="text-sm text-muted-foreground">
                    File: <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">web/components/ui/status-chip.tsx</code>.
                    Use StatusChip for all inline status indicators in card headers.
                    Never replicate the chip with raw Tailwind classes — always use this primitive.
                </p>

                <div className="space-y-3">
                    {[
                        { variant: "primary" as const,  label: "PRIMARY",  desc: "Main section header chips, active feature indicators" },
                        { variant: "fresh" as const,    label: "FRESH",    desc: "Healthy / live / active states" },
                        { variant: "withered" as const, label: "WITHERED", desc: "Degraded / warning / BYOK states" },
                        { variant: "broken" as const,   label: "BROKEN",   desc: "Error / critical / failed states" },
                        { variant: "neutral" as const,  label: "NEUTRAL",  desc: "Informational / passive labels" },
                    ].map(({ variant, label, desc }) => (
                        <div key={variant} className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/10">
                            <StatusChip variant={variant} label={label} />
                            <span className="text-xs text-muted-foreground">{desc}</span>
                        </div>
                    ))}
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">Usage</p>
                    <pre className="text-xs font-mono text-foreground overflow-x-auto">{`import { StatusChip } from "@/components/ui/status-chip"

// In a CardHeader:
<StatusChip variant="primary" label="REPOSITORIES" className="mb-2" />`}</pre>
                </div>
            </section>

            {/* DataTable */}
            <section className="space-y-6">
                <h2 className="text-xl font-black tracking-tight">DataTable</h2>
                <p className="text-sm text-muted-foreground">
                    File: <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">web/components/ui/data-table.tsx</code>.
                    Use for all data tables in dashboard pages. Provides dense padding, hover rows,
                    and overflow scrolling. Never use raw <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">&lt;table&gt;</code> elements in dashboard code.
                </p>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">Usage</p>
                    <pre className="text-xs font-mono text-foreground overflow-x-auto">{`import {
  DataTable, DataTableHeader, DataTableBody,
  DataTableRow, DataTableHead, DataTableCell,
} from "@/components/ui/data-table"

<DataTable>
  <DataTableHeader>
    <DataTableRow>
      <DataTableHead>Name</DataTableHead>
      <DataTableHead>Status</DataTableHead>
    </DataTableRow>
  </DataTableHeader>
  <DataTableBody>
    {rows.map((row) => (
      <DataTableRow key={row.id}>
        <DataTableCell>{row.name}</DataTableCell>
        <DataTableCell>{row.status}</DataTableCell>
      </DataTableRow>
    ))}
  </DataTableBody>
</DataTable>`}</pre>
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">Override note</p>
                    <p className="text-xs text-muted-foreground">
                        DataTable uses dense defaults (<code className="font-mono">px-3 py-2</code> heads, <code className="font-mono">px-3 py-2.5</code> cells).
                        Pass an explicit <code className="font-mono">className</code> to override via tailwind-merge — e.g. <code className="font-mono">className="px-6 py-3"</code>.
                    </p>
                </div>
            </section>

            {/* PageHeader */}
            <section className="space-y-6">
                <h2 className="text-xl font-black tracking-tight">PageHeader</h2>
                <p className="text-sm text-muted-foreground">
                    File: <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">web/components/layout/PageHeader.tsx</code>.
                    Every dashboard page must open with PageHeader. Do not build custom page headers.
                    Use the <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">subtitle</code> slot for the accent line above the title,
                    and the <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">children</code> slot for stat cards.
                </p>
            </section>

            {/* Typography scale */}
            <section className="space-y-6">
                <h2 className="text-xl font-black tracking-tight">Typography Classes</h2>
                <div className="grid grid-cols-1 gap-3">
                    {[
                        { cls: ".type-section-header", sample: "Section Header", note: "Card titles, section labels" },
                        { cls: ".type-body",            sample: "Body text for descriptions and prose.", note: "Card descriptions, paragraphs" },
                        { cls: ".type-metadata",        sample: "METADATA",       note: "Labels, overline text" },
                        { cls: ".animate-entrance",     sample: "Entrance animation", note: "Apply to cards; stagger with animationDelay" },
                    ].map(({ cls, sample, note }) => (
                        <div key={cls} className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/10">
                            <code className="font-mono text-xs text-primary w-44 shrink-0">{cls}</code>
                            <span className="text-sm text-foreground flex-1">{sample}</span>
                            <span className="text-xs text-muted-foreground text-right">{note}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Rules */}
            <section className="space-y-4">
                <h2 className="text-xl font-black tracking-tight">Rules (Non-Negotiable)</h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                    {[
                        "Use CSS custom property tokens — never raw hex or rgb values.",
                        "Use .rounded-card for all Card components — never override with arbitrary values.",
                        "Use StatusChip for all inline status labels in card headers.",
                        "Use DataTable for all data tables in dashboard pages — no raw <table>.",
                        "Use PageHeader for every dashboard page — no custom page headers.",
                        "Do not add border-l-8 for status colour coding — use StatusChip instead.",
                        "Shadows come from .shadow-card / .shadow-card-hover — no inline shadow utilities.",
                    ].map((rule, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className="text-primary font-black mt-0.5">·</span>
                            {rule}
                        </li>
                    ))}
                </ul>
            </section>

        </div>
    )
}
