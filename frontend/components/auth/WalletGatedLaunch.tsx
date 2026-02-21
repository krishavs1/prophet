'use client'

import { useContext } from 'react'
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { WalletReadyContext } from '@/app/providers'

const launchButtonClass =
  "group bg-accent text-accent-foreground hover:bg-accent/90 font-mono uppercase tracking-wider text-xs h-11 px-8"
const launchButtonClassDisabled =
  "font-mono uppercase tracking-wider text-xs h-11 px-8 cursor-not-allowed opacity-60 border border-border bg-card text-muted-foreground"

export function WalletGatedLaunch(): JSX.Element {
  const ready = useContext(WalletReadyContext)

  if (!ready) {
    return (
      <Button size="lg" className={launchButtonClassDisabled} disabled>
        Connect wallet to launch
        <ArrowRight className="ml-2 size-4 opacity-60" />
      </Button>
    )
  }

  return <WalletGatedLaunchInner />
}

function WalletGatedLaunchInner(): JSX.Element {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()

  if (!isConnected) {
    return (
      <Button
        size="lg"
        className={launchButtonClass}
        onClick={openConnectModal}
      >
        Connect wallet to launch
        <ArrowRight className="ml-2 size-4 transition group-hover:translate-x-0.5" />
      </Button>
    )
  }

  return (
    <Button asChild size="lg" className={launchButtonClass}>
      <Link href="/dashboard">
        Launch
        <ArrowRight className="ml-2 size-4 transition group-hover:translate-x-0.5" />
      </Link>
    </Button>
  )
}

export function WalletGatedLaunchHeader(): JSX.Element {
  const ready = useContext(WalletReadyContext)

  if (!ready) {
    return (
      <Button className={launchButtonClassDisabled} disabled>
        Launch
        <ArrowRight className="ml-1 size-3.5 opacity-60" />
      </Button>
    )
  }

  return <WalletGatedLaunchHeaderInner />
}

function WalletGatedLaunchHeaderInner(): JSX.Element {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()

  if (!isConnected) {
    return (
      <Button
        className="group bg-accent text-accent-foreground hover:bg-accent/90"
        onClick={openConnectModal}
      >
        Connect to launch
        <ArrowRight className="ml-1 size-3.5 transition group-hover:translate-x-0.5" />
      </Button>
    )
  }

  return (
    <Button asChild className="group bg-accent text-accent-foreground hover:bg-accent/90">
      <Link href="/dashboard">
        Launch
        <ArrowRight className="ml-1 size-3.5 transition group-hover:translate-x-0.5" />
      </Link>
    </Button>
  )
}
