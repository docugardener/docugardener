import Link from "next/link"
import { Button } from "@/components/ui/button"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { FAQSection } from "@/components/home/FAQSection"

export const metadata = {
  title: "FAQ - DocuGardener",
  description: "Frequently asked questions about DocuGardener — the documentation health monitor for AI-native teams.",
}

export default function FAQPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader activePage="faq" />

      {/* Page hero */}
      <section className="py-16 text-center px-6">
        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
          Support
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl mb-4">
          Frequently Asked Questions
        </h1>
        <p className="max-w-xl mx-auto text-lg text-gray-600">
          Everything you need to know about DocuGardener — from setup to security to pricing.
        </p>
      </section>

      <FAQSection />

      {/* CTA */}
      <section className="py-16 px-6">
        <div className="max-w-2xl mx-auto text-center bg-green-50 border border-green-100 rounded-2xl p-10">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-3">
            Ready to keep your docs honest?
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Install the GitHub App, connect a repo, and see drift detection on your next PR.
          </p>
          <Link href="/api/auth/signin">
            <Button size="lg" className="h-12 px-8 text-base">
              Start Free
            </Button>
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
