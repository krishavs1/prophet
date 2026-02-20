"use client"

import { Code2, Brain, FlaskConical, Rocket, ChevronRight } from "lucide-react"
import { usePipelineStore } from "@/src/store/usePipelineStore"

const steps = [
  { id: 1, label: "Input Code", icon: Code2 },
  { id: 2, label: "0G AI Analysis", icon: Brain },
  { id: 3, label: "Foundry Fuzzing", icon: FlaskConical },
  { id: 4, label: "Safe Deployment", icon: Rocket },
]

export function PipelineStepper() {
  const currentStep = usePipelineStore((state) => state.currentStep)

  return (
    <nav
      aria-label="Deployment pipeline progress"
      className="flex items-center justify-center gap-0 px-6"
    >
      {steps.map((step, index) => {
        const isCompleted = step.id < currentStep
        const isActive = step.id === currentStep
        const isFuture = step.id > currentStep
        const Icon = step.icon

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center gap-2.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-neon-green/10 text-neon-green border border-neon-green/30 shadow-[0_0_15px_rgba(0,255,65,0.15)]"
                  : isCompleted
                    ? "text-neon-green/70"
                    : "text-muted-foreground"
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              <div
                className={`flex size-7 items-center justify-center rounded-md text-xs font-bold ${
                  isActive
                    ? "bg-neon-green text-background"
                    : isCompleted
                      ? "bg-neon-green/20 text-neon-green"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <Icon className="size-3.5" aria-hidden="true" />
                )}
              </div>
              <span className={isFuture ? "opacity-50" : ""}>{step.label}</span>
            </div>

            {index < steps.length - 1 && (
              <ChevronRight
                className={`mx-1 size-4 shrink-0 ${
                  step.id < currentStep ? "text-neon-green/40" : "text-muted-foreground/30"
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
