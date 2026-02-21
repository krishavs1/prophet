"use client"

import { useRef, useState, useEffect, useMemo, useCallback } from "react"
import { useAccount, useSendTransaction } from "wagmi"
import {
  FileCode2,
  AlertTriangle,
  Upload,
  Play,
  Copy,
  Check,
  X,
  Sparkles,
  Wallet,
  Loader2,
} from "lucide-react"
import { usePipelineStore, type ExploitStep } from "@/src/store/usePipelineStore"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ---------------------------------------------------------------------------
// Diff algorithm
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

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

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
// Inline diff view
// ---------------------------------------------------------------------------

function InlineDiffView({ oldCode, newCode }: { oldCode: string; newCode: string }) {
  const lines = useMemo(() => computeDiff(oldCode, newCode), [oldCode, newCode])

  return (
    <div className="absolute inset-0 overflow-auto font-mono text-[13px] leading-6">
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
              : "text-muted-foreground/20"

        return (
          <div key={idx} className={`flex ${bgClass} hover:brightness-125`}>
            <span className="w-10 shrink-0 select-none text-right pr-1 text-[11px] leading-6 text-muted-foreground/25">
              {line.oldNum ?? ""}
            </span>
            <span className="w-10 shrink-0 select-none text-right pr-2 text-[11px] leading-6 text-muted-foreground/25">
              {line.newNum ?? ""}
            </span>
            <span className={`w-4 shrink-0 select-none text-center font-bold ${prefixClass}`}>
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

function DiffStats({ oldCode, newCode }: { oldCode: string; newCode: string }) {
  const { additions, deletions } = useMemo(() => {
    const lines = computeDiff(oldCode, newCode)
    return {
      additions: lines.filter((l) => l.type === "add").length,
      deletions: lines.filter((l) => l.type === "remove").length,
    }
  }, [oldCode, newCode])

  return (
    <span className="flex items-center gap-1.5 text-[11px] font-mono">
      <span className="text-emerald-500">+{additions}</span>
      <span className="text-red-500">−{deletions}</span>
    </span>
  )
}

/** Derive a descriptive vulnerability heading from API fields (avoids generic "Finding"). */
function descriptiveVulnTitle(
  rawTitle: string,
  type?: string,
  id?: string,
  explanation?: string
): string {
  const t = (rawTitle ?? "").trim()
  if (t && t.toLowerCase() !== "finding" && t.length > 2) return t
  if (type?.trim()) {
    const formatted = type.trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    if (formatted.length > 2) return formatted
  }
  if (id?.trim()) {
    const formatted = id.trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    if (formatted.length > 2) return formatted
  }
  if (explanation?.trim()) {
    const first = explanation.trim().split(/[.!?\n]/)[0]?.trim() ?? ""
    if (first.length > 10) return first.length > 72 ? first.slice(0, 69) + "…" : first
  }
  return "Security finding"
}

// ---------------------------------------------------------------------------
// Syntax tokenizer
// ---------------------------------------------------------------------------

function tokenize(line: string) {
  const tokens: { text: string; className: string }[] = []
  const patterns: [RegExp, string][] = [
    [/^(\/\/.*)/, "text-muted-foreground italic"],
    [/^(\/\/\/.*)/, "text-neon-green/50 italic"],
    [/^("(?:[^"\\]|\\.)*")/, "text-neon-amber"],
    [/^(\b(?:pragma|solidity|import|contract|is|using|for|function|public|view|override|returns|return|require|mapping|address|uint256|constant|constructor)\b)/, "text-neon-green"],
    [/^(\b(?:IERC20|ERC4626|ERC20|SafeERC20|VulnerableVault)\b)/, "text-[#00b0ff]"],
    [/^(\b(?:true|false)\b)/, "text-neon-amber"],
    [/^(\b\d+\b)/, "text-neon-amber"],
    [/^(@\w+(?:\/[^\s;]+)?)/, "text-[#00b0ff]"],
    [/^(\b(?:memory|calldata|storage|external|internal|private|virtual|pure)\b)/, "text-neon-green/70"],
  ]

  let remaining = line
  while (remaining.length > 0) {
    let matched = false
    for (const [pattern, className] of patterns) {
      const match = remaining.match(pattern)
      if (match) {
        tokens.push({ text: match[1], className })
        remaining = remaining.slice(match[1].length)
        matched = true
        break
      }
    }
    if (!matched) {
      const nextSpecial = remaining.slice(1).search(/[/"@a-zA-Z0-9]/)
      if (nextSpecial === -1) {
        tokens.push({ text: remaining, className: "text-foreground" })
        remaining = ""
      } else {
        tokens.push({ text: remaining.slice(0, nextSpecial + 1), className: "text-foreground" })
        remaining = remaining.slice(nextSpecial + 1)
      }
    }
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateSolidity(code: string): { valid: boolean; error?: string } {
  if (!code.trim()) return { valid: false, error: "Code cannot be empty" }
  if (!code.includes("pragma solidity")) return { valid: false, error: "Missing pragma solidity directive" }
  if (!code.includes("contract") && !code.includes("library") && !code.includes("interface"))
    return { valid: false, error: "No contract, library, or interface found" }
  return { valid: true }
}

// ---------------------------------------------------------------------------
// CodeEditor
// ---------------------------------------------------------------------------

export function CodeEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [localCode, setLocalCode] = useState("")
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 })
  const [showValidationError, setShowValidationError] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [usePremiumAnalysis, setUsePremiumAnalysis] = useState(false)
  const [showPremiumPayDialog, setShowPremiumPayDialog] = useState(false)
  const [isPremiumSigning, setIsPremiumSigning] = useState(false)
  const { address } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()

  const {
    originalCode,
    patchedCode,
    contractFileName,
    vulnerabilities,
    isScanning,
    showFixesView,
    setCode,
    setPatchedCode,
    applyPatch,
    startAnalysis,
    stopAnalysis,
    updateReport,
    setShowFixesView,
  } = usePipelineStore()

  const hasPatch = !!(patchedCode && patchedCode.trim())

  useEffect(() => {
    if (originalCode) {
      setLocalCode(originalCode)
    } else {
      const defaultCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Example {
    function hello() public pure returns (string memory) {
        return "Hello, World!";
    }
}`
      setLocalCode(defaultCode)
      setCode(defaultCode, "Example.sol")
    }
  }, [originalCode, setCode])

  const updateCursorPosition = (textarea: HTMLTextAreaElement) => {
    const value = textarea.value
    const textBeforeCursor = value.substring(0, textarea.selectionStart)
    const lines = textBeforeCursor.split("\n")
    setCursorPosition({ line: lines.length, col: lines[lines.length - 1].length + 1 })
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalCode(e.target.value)
    updateCursorPosition(e.target)
  }

  const handleCursorMove = (e: React.MouseEvent<HTMLTextAreaElement> | React.KeyboardEvent<HTMLTextAreaElement>) => {
    updateCursorPosition(e.currentTarget)
  }

  const handleCopy = async () => {
    try {
      if (textareaRef.current) {
        const textarea = textareaRef.current
        textarea.focus()
        const selectedText = localCode.substring(textarea.selectionStart, textarea.selectionEnd)
        const textToCopy = selectedText || localCode
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy)
        } else {
          const tmp = document.createElement("textarea")
          tmp.value = textToCopy
          tmp.style.position = "fixed"
          tmp.style.opacity = "0"
          document.body.appendChild(tmp)
          tmp.select()
          document.execCommand("copy")
          document.body.removeChild(tmp)
        }
      }
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith(".sol")) { alert("Please upload a .sol file"); return }
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setLocalCode(content)
      setCode(content, file.name)
    }
    reader.readAsText(file)
  }

  const runAnalysisRequest = async () => {
    startAnalysis()
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
    try {
      const res = await fetch(`${agentUrl}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: localCode, premium: usePremiumAnalysis }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `Analysis failed: ${res.status}`)
      }
      const report = await res.json() as {
        risk_score: number
        risk_level: "critical" | "high" | "medium" | "low"
        summary: string
        contract_name?: string
        meta?: { tier?: "standard" | "premium" }
        vulnerabilities?: Array<{
          id?: string; title?: string; type?: string; description?: string; explanation?: string
          severity?: "critical" | "high" | "medium" | "low"; confidence?: number
          locations?: Array<{ file: string; function: string; line_start: number; line_end: number }>
        }>
        exploit_paths?: Array<{ name: string; steps: unknown[]; success_criteria: string }>
        fix_suggestions?: Array<{ id?: string; title: string; strategy: string; explanation: string; diff_preview?: string; tradeoffs?: string }>
      }

      const riskScoreVal = report.risk_score <= 1 ? report.risk_score * 100 : report.risk_score
      const vulns = (report.vulnerabilities ?? []).map((v, i) => {
        const rawTitle = v.title ?? v.type ?? ""
        const descriptiveTitle = descriptiveVulnTitle(
          rawTitle,
          v.type,
          v.id,
          v.explanation ?? v.description ?? ""
        )
        return {
        id: v.id ?? v.type ?? `vuln-${i}`,
        title: descriptiveTitle,
        severity: v.severity ?? ("medium" as const),
        confidence: typeof v.confidence === "number" ? v.confidence : 0.8,
        locations: v.locations ?? [],
        explanation: v.explanation ?? v.description ?? "",
        evidence: undefined,
        references: undefined,
      }
      })
      const exploitPaths = (report.exploit_paths ?? []).map((p) => ({
        name: p.name ?? "Attack path",
        steps: (Array.isArray(p.steps) ? p.steps : []).map((s): ExploitStep => {
          const step = s as Record<string, unknown>
          return {
            action: typeof step?.action === "string" ? step.action : "",
            pre_state: step?.pre_state && typeof step.pre_state === "object" && !Array.isArray(step.pre_state) ? (step.pre_state as Record<string, string>) : {},
            post_state: step?.post_state && typeof step.post_state === "object" && !Array.isArray(step.post_state) ? (step.post_state as Record<string, string>) : {},
            notes: typeof step?.notes === "string" ? step.notes : "",
          }
        }),
        success_criteria: p.success_criteria ?? "",
      }))
      const fixes = (report.fix_suggestions ?? []).map((f, i) => ({
        id: f.id ?? `fix-${i}`,
        title: f.title ?? "Fix",
        strategy: f.strategy ?? "",
        explanation: f.explanation ?? "",
        diff_preview: f.diff_preview,
        tradeoffs: f.tradeoffs,
      }))

      updateReport({
        vulnerabilities: vulns,
        exploitPaths,
        fixSuggestions: fixes,
        riskScore: riskScoreVal,
        riskLevel: report.risk_level ?? "low",
        summary: report.summary ?? "Analysis complete.",
        analyzedContractName: report.contract_name ?? null,
        analyzedWithPremium: report.meta?.tier === "premium",
      })
    } catch (err) {
      stopAnalysis()
      const message = err instanceof Error ? err.message : String(err)
      setAnalysisError(message)
      setTimeout(() => setAnalysisError(null), 8000)
    }
  }

  const handleRunAnalysis = async () => {
    const validation = validateSolidity(localCode)
    if (!validation.valid) {
      setShowValidationError(true)
      setTimeout(() => setShowValidationError(false), 3000)
      return
    }

    setCode(localCode, contractFileName)

    if (usePremiumAnalysis) {
      setShowPremiumPayDialog(true)
      return
    }

    runAnalysisRequest()
  }

  const handlePremiumPay = async () => {
    if (!address) return
    setIsPremiumSigning(true)
    try {
      // 0-value self-transfer: MetaMask shows "Value: 0 ETH" + gas estimate. User pays gas only.
      await sendTransactionAsync({
        to: address,
        value: BigInt(0),
      })
      setShowPremiumPayDialog(false)
      runAnalysisRequest()
    } catch {
      // User rejected tx or wallet error — leave dialog open
    } finally {
      setIsPremiumSigning(false)
    }
  }

  const handleAcceptPatch = () => {
    applyPatch()
    setShowFixesView(false)
  }

  const handleRejectPatch = () => {
    setPatchedCode("")
    setShowFixesView(false)
  }

  // Vulnerable line highlighting
  const vulnerableLines = new Set<number>()
  vulnerabilities.forEach((vuln) => {
    vuln.locations.forEach((loc) => {
      for (let i = loc.line_start; i <= loc.line_end; i++) vulnerableLines.add(i)
    })
  })

  const codeLines = localCode.split("\n")
  const isDiffMode = showFixesView && hasPatch

  return (
    <>
      <Dialog open={showPremiumPayDialog} onOpenChange={setShowPremiumPayDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-amber-400" />
              Premium analysis
            </DialogTitle>
            <DialogDescription>
              Confirm the transaction in your wallet to run premium analysis.
            </DialogDescription>
          </DialogHeader>
          {address && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
              <Wallet className="size-4 shrink-0 text-amber-400" />
              <span className="truncate" title={address}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowPremiumPayDialog(false)}
              disabled={isPremiumSigning}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePremiumPay}
              disabled={!address || isPremiumSigning}
              className="bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30"
            >
              {isPremiumSigning ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Confirm in MetaMask…
                </>
              ) : (
                <>
                  <Wallet className="size-4 mr-2" />
                  Pay with wallet
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-[#0d0d0d]"
      aria-label="Smart contract code editor"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground font-mono">
              {contractFileName}
            </span>
          </div>

          {hasPatch && (
            <>
              <div className="flex items-center gap-1 rounded-md border border-border bg-[#0d0d0d] p-0.5">
                <button
                  onClick={() => setShowFixesView(false)}
                  className={cn(
                    "rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    !isDiffMode ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Original
                </button>
                <button
                  onClick={() => setShowFixesView(true)}
                  className={cn(
                    "rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    isDiffMode ? "bg-emerald-500/15 text-emerald-400 shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Fixed
                </button>
              </div>
              {isDiffMode && <DiffStats oldCode={originalCode} newCode={patchedCode!} />}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDiffMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRejectPatch}
                className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <X className="size-3 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptPatch}
                className="h-7 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
              >
                <Check className="size-3 mr-1" />
                Accept
              </Button>
            </>
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept=".sol" onChange={handleFileUpload} className="hidden" />
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="h-7 text-xs">
                <Upload className="size-3 mr-1" /> Upload
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs">
                <Copy className="size-3 mr-1" /> Copy
              </Button>
              <button
                type="button"
                onClick={() => setUsePremiumAnalysis((p) => !p)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  usePremiumAnalysis
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                    : "border-border bg-surface text-muted-foreground hover:bg-elevated hover:text-foreground"
                )}
                title="Premium: extra compute & fine-tuned analysis (free for now)"
              >
                <Sparkles className="size-3" />
                Premium
              </button>
              <Button
                size="sm"
                onClick={handleRunAnalysis}
                disabled={isScanning || !localCode.trim()}
                className="h-7 bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 hover:text-neon-green disabled:opacity-50"
              >
                <Play className="size-3 mr-1" />
                {isScanning ? "Analyzing..." : "Run Analysis"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Code / diff area */}
      <div className="flex-1 overflow-auto p-0 relative min-h-0" role="code" aria-label="Solidity smart contract source code">
        {isDiffMode ? (
          <InlineDiffView oldCode={originalCode} newCode={patchedCode ?? ""} />
        ) : (
          <>
            {/* Syntax-highlighted preview */}
            <div className="absolute inset-0 pointer-events-none">
              <pre className="text-[13px] leading-6 font-mono p-0">
                {codeLines.map((line, i) => {
                  const lineNum = i + 1
                  const isVulnerable = vulnerableLines.has(lineNum)
                  const tokens = tokenize(line)
                  return (
                    <div
                      key={lineNum}
                      className={`flex ${
                        isVulnerable
                          ? "bg-neon-red/10 border-l-2 border-neon-red"
                          : "border-l-2 border-transparent"
                      }`}
                    >
                      <span
                        className={`inline-block w-12 shrink-0 select-none pr-4 text-right text-xs leading-6 ${
                          isVulnerable ? "text-neon-red" : "text-muted-foreground/50"
                        }`}
                        aria-hidden="true"
                      >
                        {lineNum}
                      </span>
                      <span className="flex-1 pr-4">
                        {isVulnerable && (
                          <AlertTriangle
                            className="inline-block size-3.5 text-neon-red mr-1 -mt-0.5"
                            aria-label="Vulnerability detected on this line"
                          />
                        )}
                        {tokens.map((token, j) => (
                          <span key={j} className={token.className}>{token.text}</span>
                        ))}
                      </span>
                    </div>
                  )
                })}
              </pre>
            </div>
            {/* Editable textarea */}
            <textarea
              ref={textareaRef}
              value={localCode}
              onChange={handleTextareaChange}
              onKeyUp={handleCursorMove}
              onMouseUp={handleCursorMove}
              onClick={handleCursorMove}
              onBlur={() => setCode(localCode, contractFileName)}
              className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-neon-green font-mono text-[13px] leading-6 pl-[50px] pr-4 resize-none outline-none border-none"
              style={{ fontFamily: "monospace", tabSize: 4 }}
              spellCheck={false}
              placeholder="Paste or upload your Solidity contract here..."
            />
          </>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border bg-secondary/50 px-4 py-1 text-[11px] text-muted-foreground font-mono">
        <div className="flex items-center gap-3">
          <span>Solidity</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center gap-3">
          {showValidationError && <span className="text-neon-red">Please check your Solidity code</span>}
          {analysisError && (
            <span className="max-w-[280px] truncate text-neon-red" title={analysisError}>
              Analysis failed: {analysisError}
            </span>
          )}
          {isDiffMode ? (
            <span className="text-emerald-400">Reviewing patch</span>
          ) : (
            <>
              {vulnerabilities.length > 0 && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="size-3 text-neon-red" aria-hidden="true" />
                  <span className="text-neon-red">
                    {vulnerabilities.length} vulnerability{vulnerabilities.length !== 1 ? "ies" : ""}
                  </span>
                </span>
              )}
              <span>Ln {cursorPosition.line}, Col {cursorPosition.col}</span>
            </>
          )}
        </div>
      </div>
    </section>
    </>
  )
}
