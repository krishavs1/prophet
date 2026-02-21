"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Shield, Sparkles, ArrowLeft, Check, Loader2 } from "lucide-react"
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

export default function FixesPage(): JSX.Element {
  const router = useRouter()
  const {
    originalCode,
    patchedCode,
    vulnerabilities,
    fixSuggestions,
    exploitPaths,
    riskScore,
    riskLevel,
    summary,
    setPatchedCode,
    applyPatch,
  } = usePipelineStore()
  const [patchedLocal, setPatchedLocal] = useState(patchedCode ?? "")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasReport = vulnerabilities.length > 0 || fixSuggestions.length > 0 || riskScore !== null

  const handleGenerateFix = async () => {
    setError(null)
    setIsGenerating(true)
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
    try {
      const report = buildReportForAgent(usePipelineStore.getState())
      const res = await fetch(`${agentUrl}/generate-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: originalCode, report }),
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

  const handleApplyFix = () => {
    setPatchedCode(patchedLocal)
    applyPatch()
    router.push("/analyze")
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/analyze">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </Button>
          </Link>
          <div className="flex size-8 items-center justify-center rounded-lg border border-neon-green/20 bg-neon-green/10">
            <Sparkles className="size-4 text-neon-green" aria-hidden="true" />
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
            className="border-neon-green/50 text-neon-green hover:bg-neon-green/10"
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
            <Button size="sm" onClick={handleApplyFix} className="bg-neon-green/20 text-neon-green hover:bg-neon-green/30">
              <Check className="size-3.5 mr-1.5" aria-hidden="true" />
              Apply Fix
            </Button>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Left: Original (read-only) */}
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

        {/* Right: Patched (editable) */}
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
                ? "Click “Generate AI Fix” to produce a patched version based on the analysis."
                : "Run analysis from the pipeline first to get fix suggestions."
            }
            className="flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
            spellCheck={false}
          />
        </div>
      </main>

      {error && (
        <div className="border-t border-neon-red/30 bg-neon-red/5 px-6 py-3">
          <p className="text-sm text-neon-red">{error}</p>
        </div>
      )}
    </div>
  )
}
