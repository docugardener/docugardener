// SPDX-License-Identifier: AGPL-3.0-or-later
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface OnboardingProgressProps {
  currentStep: 1 | 2 | 3
}

const STEPS = [
  { n: 1, label: "Connect" },
  { n: 2, label: "Repos" },
  { n: 3, label: "Ready" },
] as const

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  return (
    <nav aria-label="Onboarding progress" className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const done = step.n < currentStep
        const active = step.n === currentStep

        return (
          <div key={step.n} className="flex items-center">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-colors",
                  done && "bg-primary border-primary text-primary-foreground",
                  active && "bg-white border-primary text-primary",
                  !done && !active && "bg-muted border-border text-muted-foreground",
                )}
              >
                {done ? (
                  <Check
                    data-testid={`step-check-${step.n}`}
                    className="w-3.5 h-3.5"
                  />
                ) : (
                  <span
                    data-testid={`step-dot-${step.n}`}
                    aria-current={active ? "step" : undefined}
                  >
                    {step.n}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-widest whitespace-nowrap",
                  active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-10 mx-1 mb-5 rounded-full transition-colors",
                  step.n < currentStep ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
