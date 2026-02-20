"use client"

import { useEffect, useRef } from "react"
import { Terminal, Circle } from "lucide-react"
import { usePipelineStore } from "@/src/store/usePipelineStore"

const typeColorMap: Record<string, string> = {
  command: "text-neon-green",
  info: "text-foreground",
  success: "text-neon-green",
  warning: "text-neon-amber",
  error: "text-neon-red font-semibold",
  header: "text-foreground font-semibold",
  dim: "text-muted-foreground",
}

export function FuzzingTerminal() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { terminalLogs, isTerminalLive, isFuzzing } = usePipelineStore()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [terminalLogs])

  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-[#0d0d0d]"
      aria-label="Foundry fuzzing terminal output"
    >
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2">
        <Terminal className="size-3.5 text-neon-red" aria-hidden="true" />
        <span className="text-xs text-muted-foreground font-mono">Foundry Fuzzing Console</span>
        <div className="ml-auto flex items-center gap-1.5">
          {isTerminalLive && (
            <>
              <Circle className="size-2 fill-neon-red text-neon-red animate-pulse" aria-hidden="true" />
              <span className="text-[10px] text-neon-red font-mono uppercase tracking-wider">Live</span>
            </>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-5">
        {terminalLogs.length === 0 ? (
          <div className="text-muted-foreground">
            {isFuzzing ? (
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-4 bg-neon-green animate-pulse" aria-hidden="true" />
                <span>Waiting for simulation output...</span>
              </div>
            ) : (
              <span>No simulation output yet. Run analysis to start fuzzing.</span>
            )}
          </div>
        ) : (
          <>
            {terminalLogs.map((line, index) => (
              <div key={index} className={typeColorMap[line.type] || "text-foreground"}>
                {line.text || "\u00A0"}
              </div>
            ))}
            {isTerminalLive && (
              <span className="inline-block w-2 h-4 bg-neon-green animate-pulse" aria-hidden="true" />
            )}
          </>
        )}
      </div>
    </section>
  )
}
