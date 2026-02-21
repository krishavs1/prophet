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

  // Generated Foundry test (from /generate-attack) for malicious testing
  generatedTestCode: string | null
  // Optional manual test (pasted)
  manualTestCode: string | null
  // Code to run for the current simulation (set when Run manual / Run generated is clicked)
  simulationCode: string | null
  // Contract name parsed from source by analyzer (used for generate-attack so tests match the real contract)
  analyzedContractName: string | null

  // UI: show AI fixes panel (inline, no route)
  showFixesView: boolean
  // Last analysis was run with premium (fine-tuned / extra compute) tier
  analyzedWithPremium: boolean

  // 0G Storage: last saved audit info
  lastSavedAuditId: string | null
  lastSavedRootHash: string | null

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
    analyzedContractName?: string | null
    analyzedWithPremium?: boolean
  }) => void
  addTerminalLog: (log: Omit<TerminalLog, "timestamp">) => void
  clearTerminalLogs: () => void
  setTerminalLive: (live: boolean) => void
  applyPatch: () => void
  setCurrentStep: (step: number) => void
  startFuzzing: (testCode: string) => void
  stopFuzzing: () => void
  setGeneratedTestCode: (code: string | null) => void
  setManualTestCode: (code: string | null) => void
  setShowFixesView: (show: boolean) => void
  resetPipeline: () => void
  setLastSavedAudit: (id: string | null, rootHash: string | null) => void
  loadFromAudit: (data: {
    contractSource: string
    contractName: string
    report: {
      vulnerabilities: Vulnerability[]
      exploitPaths: ExploitPath[]
      fixSuggestions: FixSuggestion[]
      riskScore: number
      riskLevel: "critical" | "high" | "medium" | "low"
      summary: string
    }
    testCode?: string
    simulationLogs?: Array<{ text: string; type: string; timestamp: number }>
    patchedCode?: string
    auditId?: string | null
    rootHash?: string | null
  }) => void
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
  generatedTestCode: null,
  manualTestCode: null,
  simulationCode: null,
  analyzedContractName: null,
  showFixesView: false,
  analyzedWithPremium: false,
  lastSavedAuditId: null,
  lastSavedRootHash: null,

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
      analyzedContractName: data.analyzedContractName ?? null,
      analyzedWithPremium: data.analyzedWithPremium ?? false,
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
          currentStep: 4,
        }
      }
      return {}
    }),

  setCurrentStep: (step) => set({ currentStep: step }),

  startFuzzing: (testCode) =>
    set({ isFuzzing: true, currentStep: 3, isTerminalLive: true, simulationCode: testCode?.trim() || null }),

  stopFuzzing: () =>
    set({ isFuzzing: false, isTerminalLive: false, simulationCode: null }),

  setGeneratedTestCode: (code) => set({ generatedTestCode: code }),
  setManualTestCode: (code) => set({ manualTestCode: code }),
  setShowFixesView: (show) => set({ showFixesView: show }),
  resetPipeline: () =>
    set({
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
      generatedTestCode: null,
      manualTestCode: null,
      simulationCode: null,
      analyzedContractName: null,
      showFixesView: false,
      analyzedWithPremium: false,
      lastSavedAuditId: null,
      lastSavedRootHash: null,
    }),
  setLastSavedAudit: (id, rootHash) => set({ lastSavedAuditId: id, lastSavedRootHash: rootHash }),
  loadFromAudit: (data) =>
    set({
      originalCode: data.contractSource,
      contractFileName: `${data.contractName}.sol`,
      vulnerabilities: data.report.vulnerabilities,
      exploitPaths: data.report.exploitPaths,
      fixSuggestions: data.report.fixSuggestions,
      riskScore: data.report.riskScore,
      riskLevel: data.report.riskLevel,
      summary: data.report.summary,
      analyzedContractName: data.contractName,
      generatedTestCode: data.testCode ?? null,
      patchedCode: data.patchedCode ?? null,
      terminalLogs: (data.simulationLogs ?? []).map((l) => ({
        text: l.text,
        type: l.type as TerminalLog["type"],
        timestamp: l.timestamp,
      })),
      currentStep: data.patchedCode ? 4 : data.report.vulnerabilities.length > 0 ? 3 : 2,
      isScanning: false,
      isFuzzing: false,
      showFixesView: false,
      lastSavedAuditId: data.auditId ?? null,
      lastSavedRootHash: data.rootHash ?? null,
    }),
}))
