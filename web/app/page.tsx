// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "./api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { HeroSection } from "@/components/home/HeroSection"
import { DemoSection } from "@/components/home/DemoSection"
import { WhatYouGet } from "@/components/home/WhatYouGet"
import { PricingTeaser } from "@/components/home/PricingTeaser"
import { ClosingSection } from "@/components/home/ClosingSection"

export default async function Home() {
  // Self-hosted instances have no SaaS marketing page — send unauthenticated
  // users straight to sign-in. SaaS mode (default) shows the landing page.
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== "saas") {
    redirect("/auth/signin")
  }

  const session = await getServerSession(authOptions)

  // Smart Redirect Logic
  if (session?.user) {
    if ((session.user as any).tenantId) {
      redirect("/dashboard")
    } else {
      redirect("/onboarding")
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader />
      <main className="flex-1">
        <HeroSection />
        <DemoSection />
        <WhatYouGet />
        <PricingTeaser />
        <ClosingSection />
      </main>
      <MarketingFooter />
    </div>
  )
}
