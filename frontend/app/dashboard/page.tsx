"use client"

import {
  Shield,
  Play,
  ArrowRight,
  Database,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Eye,
  BarChart3,
  FileSearch,
  Trash2,
  UploadCloud,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useContext, useState, useCallback } from "react"
import { useAccount } from "wagmi"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WalletAuthButton } from "@/components/auth/WalletAuthButton"
import { WalletReadyContext } from "@/app/providers"
import { usePipelineStore } from "@/src/store/usePipelineStore"
import { cn } from "@/lib/utils"

interface AuditRecord {
  id: string
  walletAddress: string
  contractName: string
  riskLevel: string
  riskScore: number
  status: "uploaded" | "pending" | "failed"
  zgRootHash: string | null
  zgTxHash: string | null
  createdAt: number
}

const riskColors: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/15 text-red-400",
  high: "border-orange-500/30 bg-orange-500/15 text-orange-400",
  medium: "border-amber-500/30 bg-amber-500/15 text-amber-400",
  low: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
}

function DashboardContent(): JSX.Element {
  const router = useRouter()
  const { isConnected, address } = useAccount()
  const loadFromAudit = usePipelineStore((s) => s.loadFromAudit)
  const resetPipeline = usePipelineStore((s) => s.resetPipeline)

  const [audits, setAudits] = useState<AuditRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingAuditId, setLoadingAuditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isConnected) router.replace("/")
  }, [isConnected, router])

  const fetchAudits = useCallback(async () => {
    if (!address) return
    setIsLoading(true)
    setError(null)
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
    try {
      const res = await fetch(`${agentUrl}/audits?wallet=${address}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = (await res.json()) as { audits: AuditRecord[] }
      setAudits(data.audits)
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "Agent unreachable" : (e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (isConnected && address) fetchAudits()
  }, [isConnected, address, fetchAudits])

  const handleViewAudit = async (audit: AuditRecord) => {
    setLoadingAuditId(audit.id)
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
    try {
      const res = await fetch(`${agentUrl}/audit/${audit.id}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = (await res.json()) as { record: AuditRecord; payload: any }
      if (data.payload) {
        const p = data.payload
        loadFromAudit({
          contractSource: p.contractSource,
          contractName: p.contractName,
          report: {
            vulnerabilities: p.report?.vulnerabilities ?? [],
            exploitPaths: p.report?.exploit_paths ?? [],
            fixSuggestions: p.report?.fix_suggestions ?? [],
            riskScore: Math.round((p.report?.risk_score ?? 0) * 100),
            riskLevel: p.report?.risk_level ?? "low",
            summary: p.report?.summary ?? "",
          },
          testCode: p.testCode,
          simulationLogs: p.simulationLogs,
          patchedCode: p.patchedCode,
          auditId: audit.id,
          rootHash: audit.zgRootHash,
        })
        router.push("/analyze")
      } else {
        setError("Could not load audit from 0G Storage")
      }
    } catch (e) {
      setError(`Load failed: ${(e as Error).message}`)
    } finally {
      setLoadingAuditId(null)
    }
  }

  const handleDeleteAudit = async (audit: AuditRecord) => {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
    try {
      const res = await fetch(`${agentUrl}/audit/${audit.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`${res.status}`)
      setAudits((prev) => prev.filter((a) => a.id !== audit.id))
    } catch (e) {
      setError(`Delete failed: ${(e as Error).message}`)
    }
  }

  const handleRetryUpload = async (audit: AuditRecord) => {
    setLoadingAuditId(audit.id)
    setError(null)
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "https://prophet-7mcp.onrender.com"
    try {
      const res = await fetch(`${agentUrl}/audit/${audit.id}/retry`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `${res.status}` }))
        throw new Error(data.error ?? `${res.status}`)
      }
      const data = (await res.json()) as { rootHash?: string; status?: string }
      setAudits((prev) =>
        prev.map((a) =>
          a.id === audit.id
            ? { ...a, zgRootHash: data.rootHash ?? a.zgRootHash, status: (data.status as AuditRecord["status"]) ?? a.status }
            : a
        )
      )
    } catch (e) {
      setError(`Upload retry failed: ${(e as Error).message}`)
    } finally {
      setLoadingAuditId(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-mono text-sm text-muted-foreground">Redirecting…</p>
      </div>
    )
  }

  const totalAudits = audits.length
  const criticalFindings = audits.filter((a) => a.riskLevel === "critical").length
  const onChainCount = audits.filter((a) => a.zgRootHash).length

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Background */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,255,65,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div
        className="pointer-events-none absolute left-[20%] top-[15%] z-0 size-[400px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(0,255,65,0.08) 0%, transparent 70%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between border-b border-border/80 bg-background/80 backdrop-blur-sm px-5 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10">
            <Shield className="size-4 text-accent" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              Prophet
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Dashboard
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-4">
          <WalletAuthButton />
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              Home
            </Button>
          </Link>
        </nav>
      </header>

      <main className="relative z-10 flex flex-1 flex-col px-5 py-8 lg:px-8 lg:py-12">
        <div className="mx-auto w-full max-w-5xl">
          {/* Title row */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Your workspace
              </h2>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                Launch new analyses or review past audits stored on 0G.
              </p>
            </div>
            <Link href="/analyze" onClick={resetPipeline}>
              <Button
                size="sm"
                className="font-mono uppercase tracking-wider text-xs bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Play className="size-3.5 mr-1.5" aria-hidden />
                New analysis
                <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
            </Link>
          </div>

          {/* Stats cards */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={<BarChart3 className="size-4 text-accent" />}
              label="Total audits"
              value={totalAudits}
            />
            <StatCard
              icon={<AlertTriangle className="size-4 text-red-400" />}
              label="Critical risk"
              value={criticalFindings}
            />
            <StatCard
              icon={<Database className="size-4 text-accent" />}
              label="On-chain (0G)"
              value={onChainCount}
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Audit history */}
          <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                Audit history
              </h3>
              <button
                type="button"
                className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                onClick={fetchAudits}
              >
                Refresh
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : audits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileSearch className="size-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No audits yet. Run your first analysis to get started.
                </p>
                <Link href="/analyze" className="mt-3" onClick={resetPipeline}>
                  <Button variant="outline" size="sm" className="text-xs">
                    Start analysis
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {audits.map((audit) => (
                  <AuditRow
                    key={audit.id}
                    audit={audit}
                    isLoading={loadingAuditId === audit.id}
                    onView={() => handleViewAudit(audit)}
                    onDelete={() => handleDeleteAudit(audit)}
                    onRetry={() => handleRetryUpload(audit)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
      <CardContent className="flex items-center gap-3 py-4 px-4">
        <div className="flex size-9 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {value}
          </p>
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function AuditRow({
  audit,
  isLoading,
  onView,
  onDelete,
  onRetry,
}: {
  audit: AuditRecord
  isLoading: boolean
  onView: () => void
  onDelete: () => void
  onRetry: () => void
}) {
  const date = new Date(audit.createdAt)
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
  const riskClass = riskColors[audit.riskLevel] ?? riskColors.low
  const score = Math.round(audit.riskScore * 100)

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
      {/* Contract name + date */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {audit.contractName}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {dateStr} at {timeStr}
        </p>
      </div>

      {/* Risk badge */}
      <span
        className={cn(
          "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          riskClass
        )}
      >
        {audit.riskLevel}
      </span>

      {/* Score */}
      <span className="shrink-0 w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {score}
      </span>

      {/* 0G indicator */}
      {audit.zgRootHash ? (
        <span
          className="shrink-0 flex items-center gap-1 text-[10px] text-accent font-mono"
          title={`0G Root: ${audit.zgRootHash}`}
        >
          <Database className="size-3" aria-hidden />
          {audit.zgRootHash.slice(0, 8)}…
        </span>
      ) : (
        <button
          type="button"
          className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-amber-400 hover:bg-amber-500/10 transition-colors"
          title="Retry 0G upload"
          disabled={isLoading}
          onClick={onRetry}
        >
          <UploadCloud className="size-3" aria-hidden />
          {isLoading ? "uploading…" : "local — retry"}
        </button>
      )}

      {/* View button */}
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        disabled={isLoading}
        onClick={onView}
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <>
            <Eye className="size-3.5 mr-1" aria-hidden />
            View
          </>
        )}
      </Button>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 h-7 w-7 p-0 text-muted-foreground/50 hover:text-red-400"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}

export default function DashboardPage(): JSX.Element {
  const ready = useContext(WalletReadyContext)

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return <DashboardContent />
}
