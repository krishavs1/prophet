"use client"

import { useState } from "react"
import { Sparkles, ArrowLeft, Check, Loader2 } from "lucide-react"
import { usePipelineStore } from "@/src/store/usePipelineStore"
import { Button } from "@/components/ui/button"

function buildReportForAgent(store: ReturnType<typeof usePipelineStore.getState>) {
  const contractName =
    (store.analyzedContractName ?? store.contractFileName.replace(/\.sol$/i, "")) || "Contract"
  return {
    contract_name: contractName,
    source_hash: "",
    risk_score: (store.riskScore ?? 0) / 100,
    risk_level: store.riskLevel ?? "low",
    summary: store.summary ?? "",
    vulnerabilities: store.vulnerabilities,
    exploit_paths: store.exploitPaths,
    fix_suggestions: store.fixSuggestions,
    meta: { generated_at: "", generator: "", inference_backend: "local" as const, version: "" },
  }
}

export function AiFixesPanel({ onBack }: { onBack: () => void }): JSX.Element {
  const {
    originalCode,
    patchedCode,
    vulnerabilities,
    fixSuggestions,
    riskScore,
    terminalLogs,
    setPatchedCode,
    applyPatch,
    setShowFixesView,
  } = usePipelineStore()
  const [patchedLocal, setPatchedLocal] = useState(patchedCode ?? "")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasReport = vulnerabilities.length > 0 || fixSuggestions.length > 0 || riskScore !== null

  const handleGenerateFix = async (): Promise<void> => {
    setError(null)
    setIsGenerating(true)
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:3001"
    try {
      const report = buildReportForAgent(usePipelineStore.getState())
      const simulationTrace = terminalLogs
        .map((l) => l.text)
        .join("")
        .slice(-3000)
      const res = await fetch(`${agentUrl}/generate-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: originalCode, report, simulationTrace }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `${res.status}`)
      }
      const { patchedCode: code } = (await res.json()) as { patchedCode: string }
      setPatchedLocal(code)
      setPatchedCode(code)
    } catch (e) {
      setError((e as Error).message)
      setPatchedLocal("")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleApplyFix = (): void => {
    setPatchedCode(patchedLocal)
    applyPatch()
    setShowFixesView(false)
    onBack()
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back
          </Button>
          <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
            <Sparkles className="size-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground">AI Fixes</h1>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
              Generate and apply patches from analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateFix}
            disabled={!originalCode.trim() || !hasReport || isGenerating}
            className="border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 mr-1.5" aria-hidden="true" />
                Generate AI Fix
              </>
            )}
          </Button>
          {patchedLocal.trim() && (
            <Button
              size="sm"
              onClick={handleApplyFix}
              className="bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30 dark:text-emerald-400"
            >
              <Check className="size-3.5 mr-1.5" aria-hidden="true" />
              Apply Fix
            </Button>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-border">
          <div className="border-b border-border bg-secondary/30 px-4 py-2">
            <h2 className="text-xs font-mono text-muted-foreground">Original</h2>
          </div>
          <pre className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-6 text-muted-foreground">
            {originalCode || (
              <span className="italic">No contract loaded. Run analysis from the pipeline first.</span>
            )}
          </pre>
        </div>

        <div className="flex w-1/2 flex-col">
          <div className="border-b border-border bg-secondary/30 px-4 py-2">
            <h2 className="text-xs font-mono text-muted-foreground">Patched (editable)</h2>
          </div>
          <textarea
            value={patchedLocal}
            onChange={(e) => {
              setPatchedLocal(e.target.value)
              setPatchedCode(e.target.value)
            }}
            placeholder={
              hasReport
                ? 'Click "Generate AI Fix" to produce a patched version based on the analysis.'
                : "Run analysis from the pipeline first to get fix suggestions."
            }
            className="flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
            spellCheck={false}
          />
        </div>
      </main>

      {error && (
        <div className="border-t border-red-500/30 bg-red-500/5 px-6 py-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
    </div>
  )
}
