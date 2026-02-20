"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Shield, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

/* ── Terminal data ── */
const terminalLines = [
  { type: "command", text: "$ prophet scan ./contracts/Vault.sol" },
  { type: "info", text: "Scanning 1 contract..." },
  { type: "info", text: "" },
  { type: "critical", text: "[CRITICAL]  Reentrancy in withdraw()  →  L42" },
  { type: "high", text: "[HIGH]      Missing onlyOwner on setOracle()  →  L78" },
  { type: "medium", text: "[MEDIUM]    Single oracle source  →  L91" },
  { type: "info", text: "" },
  { type: "success", text: "3 issues found. Patches generated." },
  { type: "info", text: "Run `prophet patch --apply` to review diffs." },
] as const

type LineType = "command" | "info" | "critical" | "high" | "medium" | "success"

const colorMap: Record<LineType, string> = {
  command: "text-foreground",
  info: "text-muted-foreground",
  critical: "text-[#ff1744]",
  high: "text-[#ffab00]",
  medium: "text-[#40c4ff]",
  success: "text-accent",
}

/* ── Page ── */
export default function HomePage() {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (visibleCount >= terminalLines.length) return
    const delay = visibleCount === 0 ? 600 : visibleCount === 1 ? 800 : 300
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), delay)
    return () => clearTimeout(timer)
  }, [visibleCount])

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* ── Animated background ── */}
      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,255,65,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,0.07) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          animation: "grid-fade 8s ease-in-out infinite",
        }}
      />
      {/* Glow orb 1 — top left */}
      <div
        className="pointer-events-none absolute left-[15%] top-[20%] z-0 size-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,255,65,0.12) 0%, transparent 70%)",
          animation: "glow-drift 10s ease-in-out infinite",
        }}
      />
      {/* Glow orb 2 — bottom right */}
      <div
        className="pointer-events-none absolute bottom-[10%] right-[10%] z-0 size-[400px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,255,65,0.08) 0%, transparent 70%)",
          animation: "glow-drift-2 12s ease-in-out infinite",
        }}
      />
      {/* Scan line */}
      <div
        className="pointer-events-none absolute left-0 z-0 h-px w-full"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(0,255,65,0.15), transparent)",
          animation: "scan-line 6s linear infinite",
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 lg:px-16">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md border border-accent/20 bg-accent/10">
            <Shield className="size-4 text-accent" aria-hidden="true" />
          </div>
          <span className="text-sm font-bold tracking-tight">Prophet</span>
        </div>
        <nav className="flex items-center gap-6">
          <Link
            href="https://github.com/AaravM11/prophet"
            className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground transition hover:text-foreground md:inline"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </Link>
          <Link href="/analyze">
            <Button className="group bg-accent text-accent-foreground hover:bg-accent/90">
              Launch
              <ArrowRight className="ml-1 size-3.5 transition group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </nav>
      </header>

      {/* Hero — side by side */}
      <main className="relative z-10 flex flex-1 items-center px-8 pb-12 lg:px-16">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
          {/* Left — copy */}
          <div className="flex flex-1 flex-col items-start">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground backdrop-blur-sm">
              <span className="inline-block size-1.5 rounded-full bg-accent" />
              AI white-hat agent
            </div>

            <h1 className="text-balance text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl xl:text-7xl">
              Find and fix DeFi contract risks before they ship.
            </h1>

            <p className="mt-5 max-w-lg text-pretty text-base text-muted-foreground md:text-lg">
              Prophet scans your Solidity for reentrancy, oracle manipulation, and access control
              flaws — then generates minimal-diff patches you review and merge.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/analyze">
                <Button
                  size="lg"
                  className="group bg-accent text-accent-foreground hover:bg-accent/90 font-mono uppercase tracking-wider text-xs h-11 px-8"
                >
                  Start Analysis
                  <ArrowRight className="ml-2 size-4 transition group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="https://github.com/AaravM11/prophet" target="_blank" rel="noreferrer">
                <Button
                  size="lg"
                  variant="outline"
                  className="font-mono uppercase tracking-wider text-xs h-11 px-8 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                >
                  View Source
                </Button>
              </Link>
            </div>

            {/* Inline stats row */}
            <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-border/50 pt-6">
              <Stat label="Mode" value="Read-only" />
              <span className="hidden h-4 w-px bg-border md:block" />
              <Stat label="Output" value="JSON + Diff" />
              <span className="hidden h-4 w-px bg-border md:block" />
              <Stat label="Frameworks" value="Hardhat / Foundry" />
            </div>
          </div>

          {/* Right — terminal */}
          <div className="w-full flex-1 lg:max-w-xl xl:max-w-2xl">
            <div className="overflow-hidden rounded-lg border border-border bg-card/80 shadow-2xl shadow-accent/5 backdrop-blur-sm">
              {/* Terminal chrome */}
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-[#ff1744]/60" />
                <span className="size-2.5 rounded-full bg-[#ffab00]/60" />
                <span className="size-2.5 rounded-full bg-accent/60" />
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  prophet
                </span>
              </div>
              {/* Terminal body */}
              <div className="p-5 font-mono text-xs leading-6 md:p-6 md:text-sm md:leading-7">
                {terminalLines.slice(0, visibleCount).map((line, i) => (
                  <div key={i} className={colorMap[line.type]}>
                    {line.text || "\u00A0"}
                  </div>
                ))}
                {visibleCount < terminalLines.length && (
                  <span className="inline-block h-4 w-1.5 animate-pulse bg-accent" />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom bar */}
      <footer className="relative z-10 border-t border-border px-8 py-4 lg:px-16">
        <p className="text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Solidity &amp; Vyper
        </p>
      </footer>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}
