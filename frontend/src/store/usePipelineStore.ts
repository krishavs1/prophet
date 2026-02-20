import { create } from "zustand"

// Types matching agent/src/types/report.ts
export interface Location {
  file: string
  function: string
  line_start: number
  line_end: number
}

export interface Vulnerability {
  id: string
  title: string
  severity: "critical" | "high" | "medium" | "low"
  confidence: number
  locations: Location[]
  explanation: string
  evidence?: {
    patterns?: string[]
    call_graph?: string[]
  }
  references?: string[]
}

export interface ExploitStep {
  action: string
  pre_state: Record<string, string>
  post_state: Record<string, string>
  notes: string
}

export interface ExploitPath {
  name: string
  steps: ExploitStep[]
  success_criteria: string
}

export interface FixSuggestion {
  id: string
  title: string
  strategy: string
  explanation: string
  diff_preview?: string
  tradeoffs?: string
}

export interface TerminalLog {
  text: string
  type: "info" | "success" | "warning" | "error" | "command" | "header" | "dim"
  timestamp: number
}

interface PipelineState {
  // Pipeline state
  currentStep: number // 1-4
  isScanning: boolean
  isFuzzing: boolean

  // Contract state
  originalCode: string
  patchedCode: string | null
  contractFileName: string

  // Analysis state
  vulnerabilities: Vulnerability[]
  exploitPaths: ExploitPath[]
  fixSuggestions: FixSuggestion[]
  riskScore: number | null
  riskLevel: "critical" | "high" | "medium" | "low" | null
  summary: string | null

  // Terminal state
  terminalLogs: TerminalLog[]
  isTerminalLive: boolean

  // Actions
  setCode: (code: string, fileName?: string) => void
  setPatchedCode: (code: string) => void
  startAnalysis: () => void
  stopAnalysis: () => void
  updateReport: (data: {
    vulnerabilities: Vulnerability[]
    exploitPaths: ExploitPath[]
    fixSuggestions: FixSuggestion[]
    riskScore: number
    riskLevel: "critical" | "high" | "medium" | "low"
    summary: string
  }) => void
  addTerminalLog: (log: Omit<TerminalLog, "timestamp">) => void
  clearTerminalLogs: () => void
  setTerminalLive: (live: boolean) => void
  applyPatch: () => void
  setCurrentStep: (step: number) => void
  startFuzzing: () => void
  stopFuzzing: () => void
}

export const usePipelineStore = create<PipelineState>((set) => ({
  // Initial state
  currentStep: 1,
  isScanning: false,
  isFuzzing: false,
  originalCode: "",
  patchedCode: null,
  contractFileName: "contract.sol",
  vulnerabilities: [],
  exploitPaths: [],
  fixSuggestions: [],
  riskScore: null,
  riskLevel: null,
  summary: null,
  terminalLogs: [],
  isTerminalLive: false,

  // Actions
  setCode: (code: string, fileName = "contract.sol") =>
    set({ originalCode: code, contractFileName: fileName, currentStep: 1 }),

  setPatchedCode: (code: string) => set({ patchedCode: code }),

  startAnalysis: () =>
    set({ isScanning: true, currentStep: 2 }),

  stopAnalysis: () =>
    set({ isScanning: false }),

  updateReport: (data) =>
    set({
      vulnerabilities: data.vulnerabilities,
      exploitPaths: data.exploitPaths,
      fixSuggestions: data.fixSuggestions,
      riskScore: data.riskScore,
      riskLevel: data.riskLevel,
      summary: data.summary,
      isScanning: false,
      currentStep: data.vulnerabilities.length > 0 ? 3 : 4,
    }),

  addTerminalLog: (log) =>
    set((state) => ({
      terminalLogs: [
        ...state.terminalLogs,
        { ...log, timestamp: Date.now() },
      ],
    })),

  clearTerminalLogs: () => set({ terminalLogs: [] }),

  setTerminalLive: (live) => set({ isTerminalLive: live }),

  applyPatch: () =>
    set((state) => {
      if (state.patchedCode) {
        return {
          originalCode: state.patchedCode,
          patchedCode: null,
          currentStep: 3, // Re-run simulation
        }
      }
      return {}
    }),

  setCurrentStep: (step) => set({ currentStep: step }),

  startFuzzing: () =>
    set({ isFuzzing: true, currentStep: 3, isTerminalLive: true }),

  stopFuzzing: () =>
    set({ isFuzzing: false, isTerminalLive: false }),
}))
