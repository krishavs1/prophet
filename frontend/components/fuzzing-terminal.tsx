"use client"

import { useEffect, useRef } from "react"
import { Terminal, Circle } from "lucide-react"
import { usePipelineStore } from "@/src/store/usePipelineStore"
import { useSimulation } from "@/src/hooks/useSimulation"

import { cn } from "@/lib/utils"

const typeColorMap: Record<string, string> = {
  command: "text-emerald-500",
  info: "text-foreground/90",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-red-400 font-medium",
  header: "text-foreground font-medium",
  dim: "text-muted-foreground",
}

export function FuzzingTerminal() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { terminalLogs, isTerminalLive, isFuzzing } = usePipelineStore()
  useSimulation() // Hook handles starting simulation when isFuzzing is true

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [terminalLogs])

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-[#0a0a0a]"
      aria-label="Simulation output"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Terminal className="size-3.5 text-emerald-500/80" aria-hidden="true" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Simulation
        </span>
        {isTerminalLive && (
          <div className="ml-auto flex items-center gap-1.5">
            <Circle className="size-1.5 fill-emerald-500 text-emerald-500 animate-pulse" aria-hidden="true" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500">Live</span>
          </div>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2.5 font-mono text-[11px] leading-normal">
        {terminalLogs.length === 0 ? (
          <p className="text-muted-foreground/80">
            {isFuzzing ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-0.5 bg-emerald-500 animate-pulse" aria-hidden="true" />
                Waiting for output…
              </span>
            ) : (
              "Run a test from the Analysis panel to see output here."
            )}
          </p>
        ) : (
          <>
            {terminalLogs.map((line, index) => (
              <div key={index} className={cn("whitespace-pre-wrap break-all", typeColorMap[line.type] || "text-foreground/90")}>
                {line.text || "\u00A0"}
              </div>
            ))}
            {isTerminalLive && (
              <span className="inline-block h-3 w-0.5 bg-emerald-500 animate-pulse" aria-hidden="true" />
            )}
          </>
        )}
      </div>
    </section>
  )
}
