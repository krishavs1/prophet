import { Shield } from "lucide-react"
import Link from "next/link"
import { PipelineStepper } from "@/components/pipeline-stepper"
import { CodeEditor } from "@/components/code-editor"
import { VulnerabilityReport } from "@/components/vulnerability-report"
import { FuzzingTerminal } from "@/components/fuzzing-terminal"
import { Button } from "@/components/ui/button"

export default function AnalyzePage(): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border/80 bg-card/50 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
            <Shield className="size-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              Prophet
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              Audit · Fuzz · Patch
            </p>
          </div>
        </div>
        <PipelineStepper />
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Foundry
          </span>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="w-[50%] min-w-[320px] border-r border-border/80 p-4">
          <CodeEditor />
        </div>
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex-1 overflow-hidden min-h-0 p-4 border-b border-border/80">
            <VulnerabilityReport />
          </div>
          <div className="h-[42%] min-h-[140px] p-4 flex flex-col">
            <FuzzingTerminal />
          </div>
        </div>
      </main>
    </div>
  )
}


