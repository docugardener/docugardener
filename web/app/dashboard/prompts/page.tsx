// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { PromptPlayground } from "@/components/dashboard/PromptPlayground"
import { PageHeader } from "@/components/layout/PageHeader"
import { StatusChip } from "@/components/ui/status-chip"
import { Cpu } from "lucide-react"

export default async function PromptsPage() {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }

    return (
        <div className="w-full pb-20 font-sans text-foreground">
            <PageHeader
                title="Prompt Orchestrator"
                description="Fine-tune how the AI perceives architectural drift by overriding system-level instructions."
                subtitle={
                    <div className="flex items-center gap-2 text-primary mb-2 font-bold text-xs uppercase tracking-wider">
                        <Cpu className="h-4 w-4" />
                        Intelligence Logic
                    </div>
                }
            />

            <div className="app-container">
                <div className="animate-entrance space-y-12">
                    <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                        <div className="p-8 border-b border-border bg-muted/50">
                            <StatusChip variant="primary" label="PROMPT" className="mb-2" />
                            <h3 className="type-section-header mb-1 text-muted-foreground">Intelligence Orchestration</h3>
                            <p className="type-body font-bold text-foreground">Configure core semantic evaluation logic.</p>
                        </div>
                        <div className="p-8">
                            <PromptPlayground />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
