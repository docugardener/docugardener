// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "./api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { HeroSection } from "@/components/home/HeroSection"
import { DemoSection } from "@/components/home/DemoSection"
import { HowItWorks } from "@/components/home/HowItWorks"
import { WhySaaS } from "@/components/home/WhySaaS"
import { PricingTeaser } from "@/components/home/PricingTeaser"
import { FeaturesTeaser } from "@/components/home/FeaturesTeaser"
import { SelfHostedCallout } from "@/components/home/SelfHostedCallout"
import { FAQTeaser } from "@/components/home/FAQTeaser"
import { SocialProof } from "@/components/home/SocialProof"

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
        <SocialProof />
        <DemoSection />
        <HowItWorks />
        <WhySaaS />
        <PricingTeaser />
        <FeaturesTeaser />
        <SelfHostedCallout />
        <FAQTeaser />
      </main>
      <MarketingFooter />
    </div>
  )
}
