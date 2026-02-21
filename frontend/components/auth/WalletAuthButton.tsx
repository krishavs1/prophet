'use client'

import { useContext, useEffect, useRef } from 'react'
import { useAccount, useChainId, useSignMessage } from 'wagmi'
import { SiweMessage } from 'siwe'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { WalletReadyContext } from '@/app/providers'

const SIWE_DONE_KEY = 'prophet-siwe-done'

function getSiweDone(): string | null {
  try { return sessionStorage.getItem(SIWE_DONE_KEY) } catch { return null }
}

function setSiweDone(address: string) {
  try { sessionStorage.setItem(SIWE_DONE_KEY, address.toLowerCase()) } catch { /* noop */ }
}

function createSiweMessage(address: string, statement: string, nonce: string, chainId: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  const msg = new SiweMessage({
    domain: typeof window !== 'undefined' ? window.location.host : 'localhost',
    address,
    statement,
    uri: origin,
    version: '1',
    chainId,
    nonce,
  })
  return msg.prepareMessage()
}

const walletButtonClass =
  'inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 font-mono text-xs text-muted-foreground transition hover:border-accent/40 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50'

function WalletConnectInner(): JSX.Element {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { signMessageAsync } = useSignMessage()
  const signRef = useRef(signMessageAsync)
  signRef.current = signMessageAsync
  const inFlight = useRef(false)

  useEffect(() => {
    if (!isConnected || !address) return
    if (inFlight.current) return

    const addrLower = address.toLowerCase()
    if (getSiweDone() === addrLower) return

    let cancelled = false
    inFlight.current = true

    ;(async () => {
      try {
        const me = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
        if (me.ok) {
          const data = await me.json().catch(() => ({ user: null }))
          if (data?.user?.address?.toLowerCase() === addrLower) {
            setSiweDone(addrLower)
            return
          }
        }

        if (cancelled) return

        setSiweDone(addrLower)

        const nonceRes = await fetch('/api/auth/siwe/nonce', { method: 'GET', credentials: 'include' })
        if (!nonceRes.ok) return

        const { nonce } = (await nonceRes.json()) as { nonce: string }
        const message = createSiweMessage(address, 'Sign in to Prophet', nonce, chainId)
        const signature = await signRef.current({ message })
        await fetch('/api/auth/siwe/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, signature }),
          credentials: 'include',
        })
      } catch {
        // user rejected or network error — already marked done, won't retry
      } finally {
        inFlight.current = false
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address])

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) {
          return (
            <span className={walletButtonClass}>
              Connect wallet
            </span>
          )
        }
        if (!account || !chain) {
          return (
            <button type="button" onClick={openConnectModal} className={walletButtonClass}>
              Connect wallet
            </button>
          )
        }
        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className={`${walletButtonClass} text-destructive`}>
              Wrong network
            </button>
          )
        }
        const display = account.ensName ?? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
        return (
          <button
            type="button"
            onClick={openAccountModal}
            className={walletButtonClass}
            title={account.address}
          >
            <span className="mr-1.5 size-1.5 rounded-full bg-accent/80" aria-hidden />
            {display}
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}

export function WalletAuthButton(): JSX.Element {
  const ready = useContext(WalletReadyContext)

  if (!ready) {
    return (
      <span className={walletButtonClass}>
        Connect wallet
      </span>
    )
  }

  return <WalletConnectInner />
}
