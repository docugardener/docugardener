// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { faqGroups } from "./faqData"

function AccordionItem({
  id,
  question,
  answer,
  open,
  onToggle,
}: {
  id: string
  question: string
  answer: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 text-left gap-4 group"
      >
        <span className="text-sm font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
          {question}
        </span>
        <span
          className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold transition-all ${
            open
              ? "border-green-500 text-green-600 bg-green-50"
              : "border-gray-300 text-gray-400"
          }`}
        >
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <p className="pb-4 text-sm text-gray-600 leading-relaxed">{answer}</p>
      )}
    </div>
  )
}

export function FAQSection() {
  const [open, setOpen] = useState<string | null>("q1")

  return (
    <section id="faq" className="py-20 bg-gray-50">
      <div className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            FAQ
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Common questions
          </h2>
        </div>

        {/* Accordion groups */}
        {faqGroups.map((group, gi) => (
          <div key={group.label}>
            <p
              className={`text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2 ${
                gi === 0 ? "mt-0" : "mt-10"
              }`}
            >
              {group.label}
            </p>
            {group.items.map((item) => (
              <AccordionItem
                key={item.id}
                id={item.id}
                question={item.question}
                answer={item.answer}
                open={open === item.id}
                onToggle={() => setOpen(open === item.id ? null : item.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
