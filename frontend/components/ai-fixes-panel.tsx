"use client"

import { useState, useMemo } from "react"
import { Sparkles, ArrowLeft, Check, Loader2, Pencil, GitCompare } from "lucide-react"
import { usePipelineStore } from "@/src/store/usePipelineStore"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Diff algorithm (LCS-based, no external deps)
// ---------------------------------------------------------------------------

interface DiffLine {
  type: "same" | "add" | "remove"
  text: string
  oldNum?: number
  newNum?: number
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")
  const n = oldLines.length
  const m = newLines.length

  // LCS table (space-optimized would be better for huge files, but contracts are small)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "same", text: oldLines[i - 1], oldNum: i, newNum: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", text: newLines[j - 1], newNum: j })
      j--
    } else {
      result.push({ type: "remove", text: oldLines[i - 1], oldNum: i })
      i--
    }
  }

  return result.reverse()
}

// ---------------------------------------------------------------------------
// DiffView component
// ---------------------------------------------------------------------------

function DiffView({ oldCode, newCode }: { oldCode: string; newCode: string }) {
  const lines = useMemo(() => computeDiff(oldCode, newCode), [oldCode, newCode])

  return (
    <div className="flex-1 overflow-auto font-mono text-[13px] leading-6">
      {lines.map((line, idx) => {
        const bgClass =
          line.type === "remove"
            ? "bg-red-500/10"
            : line.type === "add"
              ? "bg-emerald-500/10"
              : ""
        const textClass =
          line.type === "remove"
            ? "text-red-400"
            : line.type === "add"
              ? "text-emerald-400"
              : "text-muted-foreground"
        const prefix =
          line.type === "remove" ? "−" : line.type === "add" ? "+" : " "
        const prefixClass =
          line.type === "remove"
            ? "text-red-500"
            : line.type === "add"
              ? "text-emerald-500"
              : "text-muted-foreground/40"

        return (
          <div key={idx} className={`flex ${bgClass} hover:brightness-125`}>
            <span className="w-12 shrink-0 select-none text-right pr-2 text-muted-foreground/30">
              {line.oldNum ?? ""}
            </span>
            <span className="w-12 shrink-0 select-none text-right pr-2 text-muted-foreground/30">
              {line.newNum ?? ""}
            </span>
            <span className={`w-5 shrink-0 select-none text-center font-bold ${prefixClass}`}>
              {prefix}
            </span>
            <span className={`flex-1 whitespace-pre pr-4 ${textClass}`}>
              {line.text || "\u00A0"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

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
  const [viewMode, setViewMode] = useState<"diff" | "edit">("diff")

  const hasReport = vulnerabilities.length > 0 || fixSuggestions.length > 0 || riskScore !== null
  const hasPatch = patchedLocal.trim().length > 0

  const handleGenerateFix = async (): Promise<void> => {
    setError(null)
    setIsGenerating(true)
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
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
      setViewMode("diff")
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
      {/* Header */}
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
          {hasPatch && (
            <div className="flex items-center rounded-md border border-border bg-secondary/50 p-0.5">
              <button
                onClick={() => setViewMode("diff")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "diff"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <GitCompare className="size-3" aria-hidden="true" />
                Diff
              </button>
              <button
                onClick={() => setViewMode("edit")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "edit"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Pencil className="size-3" aria-hidden="true" />
                Edit
              </button>
            </div>
          )}

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
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 mr-1.5" aria-hidden="true" />
                Generate AI Fix
              </>
            )}
          </Button>

          {hasPatch && (
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

      {/* Body */}
      <main className="flex flex-1 overflow-hidden">
        {hasPatch && viewMode === "diff" ? (
          <div className="flex w-full flex-col">
            <div className="flex items-center gap-4 border-b border-border bg-secondary/30 px-4 py-2">
              <h2 className="text-xs font-mono text-muted-foreground">Changes</h2>
              <DiffStats oldCode={originalCode} newCode={patchedLocal} />
            </div>
            <DiffView oldCode={originalCode} newCode={patchedLocal} />
          </div>
        ) : hasPatch && viewMode === "edit" ? (
          <div className="flex w-full flex-col">
            <div className="border-b border-border bg-secondary/30 px-4 py-2">
              <h2 className="text-xs font-mono text-muted-foreground">Patched (editable)</h2>
            </div>
            <textarea
              value={patchedLocal}
              onChange={(e) => {
                setPatchedLocal(e.target.value)
                setPatchedCode(e.target.value)
              }}
              className="flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="flex w-full flex-col">
            <div className="border-b border-border bg-secondary/30 px-4 py-2">
              <h2 className="text-xs font-mono text-muted-foreground">Original</h2>
            </div>
            <pre className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-6 text-muted-foreground">
              {originalCode || (
                <span className="italic">No contract loaded. Run analysis from the pipeline first.</span>
              )}
            </pre>
          </div>
        )}
      </main>

      {error && (
        <div className="border-t border-red-500/30 bg-red-500/5 px-6 py-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff stats (additions / deletions count)
// ---------------------------------------------------------------------------

function DiffStats({ oldCode, newCode }: { oldCode: string; newCode: string }) {
  const { additions, deletions } = useMemo(() => {
    const lines = computeDiff(oldCode, newCode)
    return {
      additions: lines.filter((l) => l.type === "add").length,
      deletions: lines.filter((l) => l.type === "remove").length,
    }
  }, [oldCode, newCode])

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-emerald-500">+{additions}</span>
      <span className="text-red-500">−{deletions}</span>
    </div>
  )
}
