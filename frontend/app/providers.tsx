'use client'

import React, { ReactNode, useEffect, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { mainnet, sepolia } from 'wagmi/chains'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'demo'

// Theme: match app (dark, accent #00ff41)
const prophetTheme = darkTheme({
  accentColor: '#00ff41',
  accentColorForeground: '#0a0a0a',
  borderRadius: 'small',
})

export const WalletReadyContext = React.createContext(false)

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  const [queryClient] = useState(() => new QueryClient())
  const [config, setConfig] = useState<ReturnType<typeof getDefaultConfig> | null>(null)

  // Create config only on client to avoid localStorage/SSR errors
  useEffect(() => {
    setConfig(
      getDefaultConfig({
        appName: 'Prophet',
        projectId,
        chains: [sepolia, mainnet],
        ssr: true,
      })
    )
  }, [])

  if (!config) {
    return (
      <WalletReadyContext.Provider value={false}>
        {children}
      </WalletReadyContext.Provider>
    )
  }

  return (
    <WalletReadyContext.Provider value={true}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={prophetTheme} modalSize="compact">
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </WalletReadyContext.Provider>
  )
}
