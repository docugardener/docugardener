import Link from "next/link"
import { faqGroups } from "./faqData"

const TEASER_IDS = ["q1", "q2", "q3", "q4b"]

export function FAQTeaser() {
  const whatWhyGroup = faqGroups.find((g) => g.label === "WHAT & WHY")
  const items = whatWhyGroup?.items.filter((i) => TEASER_IDS.includes(i.id)) ?? []

  return (
    <section id="faq" className="py-20 bg-gray-50">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            FAQ
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Common questions
          </h2>
        </div>

        <div className="space-y-6">
          {items.map((item) => (
            <div key={item.id} className="border-b border-gray-200 pb-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                {item.question}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {item.answer}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/faq"
            className="text-sm font-semibold text-green-600 hover:text-green-700 transition"
          >
            View all {faqGroups.reduce((n, g) => n + g.items.length, 0)} questions &rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}
