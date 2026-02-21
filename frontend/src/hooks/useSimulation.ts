"use client"

import { useEffect, useRef } from "react"
import { usePipelineStore } from "@/src/store/usePipelineStore"

/**
 * Starts simulation when isFuzzing becomes true (e.g. after "Re-run simulation").
 * Streams output to terminal via pipeline store. Wire to agent POST /simulate when backend is available.
 */
export function useSimulation() {
  const {
    isFuzzing,
    originalCode,
    contractFileName,
    simulationCode,
    addTerminalLog,
    stopFuzzing,
  } = usePipelineStore()
  const hasStarted = useRef(false)

  useEffect(() => {
    if (!isFuzzing) {
      hasStarted.current = false
      return
    }
    if (hasStarted.current) return
    hasStarted.current = true

    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
    const controller = new AbortController()

    async function run() {
      if (!simulationCode?.trim()) {
        addTerminalLog({
          text: "No test code to run.",
          type: "warning",
        })
        stopFuzzing()
        return
      }
      addTerminalLog({ text: "Starting Foundry simulation...", type: "info" })
      try {
        const res = await fetch(`${agentUrl}/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: originalCode,
            testCode: simulationCode,
            contractName: contractFileName.replace(/\.sol$/i, "") || "Contract",
          }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          addTerminalLog({
            text: `Simulation failed: ${res.status} ${res.statusText}`,
            type: "error",
          })
          stopFuzzing()
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as { chunk?: string }
                if (typeof data.chunk === "string") {
                  addTerminalLog({ text: data.chunk, type: "info" })
                }
              } catch {
                // ignore parse errors for non-JSON lines
              }
            }
          }
        }
        addTerminalLog({ text: "Simulation finished.", type: "success" })
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        addTerminalLog({
          text: `Simulation error: ${(err as Error).message}`,
          type: "error",
        })
      } finally {
        stopFuzzing()
      }
    }

    run()
    return () => controller.abort()
  }, [
    isFuzzing,
    originalCode,
    contractFileName,
    simulationCode,
    addTerminalLog,
    stopFuzzing,
  ])
}
