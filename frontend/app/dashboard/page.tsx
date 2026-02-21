"use client"

import { Shield, Play, FileSearch, ArrowRight, LayoutDashboard } from "lucide-react"
import Link from "next/link"
import { useEffect, useContext } from "react"
import { useAccount } from "wagmi"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WalletAuthButton } from "@/components/auth/WalletAuthButton"
import { WalletReadyContext } from "@/app/providers"

function DashboardContent(): JSX.Element {
  const router = useRouter()
  const { isConnected } = useAccount()

  useEffect(() => {
    if (!isConnected) router.replace("/")
  }, [isConnected, router])

  if (!isConnected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-mono text-sm text-muted-foreground">Redirecting…</p>
      </div>
    )
  }

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
          background: "radial-gradient(circle, rgba(0,255,65,0.08) 0%, transparent 70%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between border-b border-border/80 bg-background/80 backdrop-blur-sm px-5 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10">
            <Shield className="size-4 text-accent" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground">Prophet</h1>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Dashboard
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-4">
          <WalletAuthButton />
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Home
            </Button>
          </Link>
        </nav>
      </header>

      <main className="relative z-10 flex flex-1 flex-col px-5 py-8 lg:px-8 lg:py-12">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Your workspace
            </h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Launch new analyses or view past runs (coming soon).
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Launch new analysis */}
            <Card className="border-border/80 bg-card/80 backdrop-blur-sm transition hover:border-accent/30">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 mb-2">
                  <Play className="size-5 text-accent" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg">Launch new analysis</CardTitle>
                <CardDescription>
                  Upload or paste a Solidity contract and run a full security scan. Findings,
                  exploit paths, and patches in one place.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/analyze">
                  <Button
                    size="lg"
                    className="w-full font-mono uppercase tracking-wider text-xs h-11 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    Start analysis
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Recent runs placeholder */}
            <Card className="border-dashed border-border/80 bg-card/40 backdrop-blur-sm opacity-90">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 mb-2">
                  <LayoutDashboard className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg text-muted-foreground">Recent runs</CardTitle>
                <CardDescription>
                  Past analyses will appear here once we wire up database and on-chain storage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  size="lg"
                  variant="outline"
                  disabled
                  className="w-full font-mono uppercase tracking-wider text-xs h-11 cursor-not-allowed opacity-60"
                >
                  <FileSearch className="mr-2 size-4" />
                  Coming soon
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
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
