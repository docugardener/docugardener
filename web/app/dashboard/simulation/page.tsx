import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { DriftSimulator } from "@/components/simulation/DriftSimulator"
import { PageHeader } from "@/components/layout/PageHeader"
import { FlaskConical } from "lucide-react"

export default async function SimulationPage() {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }

    return (
        <div className="w-full pb-20 font-sans text-foreground">
            <PageHeader
                title="Drift Sandbox"
                description="Proactively test your documentation scoring thresholds against hypothetical scenarios."
                subtitle={
                    <div className="flex items-center gap-2 text-muted-foreground mb-2 font-bold text-xs uppercase tracking-wider">
                        <FlaskConical className="h-4 w-4" />
                        Laboratory
                    </div>
                }
            />

            <div className="app-container">
                <div className="animate-entrance space-y-12">
                    <div className="bg-card rounded-card border border-border shadow-card-hover border-l-8 border-l-foreground overflow-hidden">
                        <div className="p-8 border-b border-border bg-muted/50">
                            <h3 className="type-section-header mb-1 text-muted-foreground">Laboratory Environment</h3>
                            <p className="type-body font-bold text-foreground">Test scoring thresholds against custom code changes.</p>
                        </div>
                        <div className="p-8">
                            <DriftSimulator />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
