import { Shield, FileCode, Zap, ChevronRight } from "lucide-react";

function App() {
  return (
    <div className="min-h-screen bg-void grain relative overflow-x-hidden">
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-30 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--color-accent-glow) 0%, transparent 70%)",
        }}
      />

      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-deep/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Shield className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <span className="font-semibold text-bright tracking-tight">
              Prophet
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-1">
            {["Dashboard", "Reports", "Simulations"].map((label) => (
              <a
                key={label}
                href="#"
                className="rounded-lg px-3 py-2 text-sm font-medium text-subtle transition hover:bg-elevated hover:text-text"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-safe">
              <span className="h-1.5 w-1.5 rounded-full bg-safe animate-pulse" />
              Ready
            </span>
            <button
              type="button"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-void transition hover:opacity-90"
            >
              New analysis
            </button>
          </div>
        </div>
      </header>

      <main className="relative pt-16">
        {/* Hero */}
        <section className="relative border-b border-border scanline">
          <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
            <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">
              White-hat security for DeFi
            </p>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-bright sm:text-5xl md:text-6xl">
              Find vulnerabilities before
              <span className="text-accent"> they find you</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-subtle">
              AI-powered analysis, exploit simulation, and safe remediations for Solidity
              contracts. No auto-execution—every action requires your approval.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#contract"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-void transition hover:opacity-90"
              >
                Upload contract
                <ChevronRight className="h-4 w-4" />
              </a>
              <a
                href="#report"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-medium text-text transition hover:bg-elevated"
              >
                View sample report
              </a>
            </div>
          </div>
        </section>

        {/* Contract input */}
        <section id="contract" className="border-b border-border">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-elevated text-accent">
                <FileCode className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-bright">
                  Contract input
                </h2>
                <p className="text-sm text-muted">
                  Paste Solidity or upload a file to start analysis
                </p>
              </div>
            </div>
            <div className="glow-border relative overflow-hidden rounded-2xl border border-border bg-deep">
              <div className="border-b border-border bg-surface px-4 py-3">
                <span className="font-mono text-xs text-muted">
                  contracts/Vault.sol
                </span>
              </div>
              <pre className="overflow-x-auto p-6 font-mono text-sm leading-relaxed text-subtle">
                <code>
                  {`pragma solidity ^0.8.20;

contract Vault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] = 0;
    }
}`}
                </code>
              </pre>
              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-subtle hover:bg-elevated"
                >
                  Paste
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-void"
                >
                  Run analysis
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Findings + Exploit paths */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-elevated text-danger">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-bright">
                  Findings & exploit paths
                </h2>
                <p className="text-sm text-muted">
                  Vulnerabilities and step-by-step attack simulations
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Findings card */}
              <div className="overflow-hidden rounded-2xl border border-border bg-deep">
                <div className="border-b border-border bg-surface px-4 py-3">
                  <span className="text-sm font-medium text-text">
                    Vulnerabilities
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {[
                    {
                      id: "REENTRANCY_WITHDRAW",
                      title: "Reentrancy in withdraw()",
                      severity: "critical",
                      confidence: 92,
                    },
                    {
                      id: "ORACLE_MANIPULATION",
                      title: "Oracle manipulation risk",
                      severity: "medium",
                      confidence: 78,
                    },
                  ].map((v) => (
                    <div
                      key={v.id}
                      className="flex items-start justify-between gap-4 px-4 py-4"
                    >
                      <div>
                        <p className="font-medium text-text">
                          {v.title}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted">
                          {v.id}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          v.severity === "critical"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {v.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exploit path */}
              <div className="overflow-hidden rounded-2xl border border-border bg-deep">
                <div className="border-b border-border bg-surface px-4 py-3">
                  <span className="text-sm font-medium text-text">
                    Sample exploit path
                  </span>
                </div>
                <div className="p-4">
                  <p className="mb-3 font-medium text-danger">
                    Drain via token fallback reentry
                  </p>
                  <ol className="space-y-2 font-mono text-xs text-subtle">
                    <li className="flex gap-2">
                      <span className="text-muted">1.</span>
                      <span>attacker_deposit → seed minimal funds</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-muted">2.</span>
                      <span>trigger_withdraw_reentry → fallback reenters</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-muted">3.</span>
                      <span>Attacker extracts &gt; vault in N calls</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Report + Patch preview */}
        <section id="report" className="border-b border-border">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <h2 className="mb-8 text-xl font-semibold text-bright">
              Report & patch preview
            </h2>
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-border bg-deep">
                <div className="border-b border-border bg-surface px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-text">
                    JSON report
                  </span>
                  <span className="rounded bg-safe/20 px-2 py-0.5 text-xs font-medium text-safe">
                    Export
                  </span>
                </div>
                <pre className="max-h-64 overflow-auto p-4 font-mono text-xs leading-relaxed text-subtle">
                  {`{
  "contract_name": "Vault",
  "risk_score": 0.81,
  "risk_level": "critical",
  "vulnerabilities": [...],
  "exploit_paths": [...],
  "fix_suggestions": [...]
}`}
                </pre>
              </div>
              <div className="lg:col-span-3 overflow-hidden rounded-2xl border border-border bg-deep">
                <div className="border-b border-border bg-surface px-4 py-3">
                  <span className="text-sm font-medium text-text">
                    Suggested fix — Checks-Effects-Interactions + ReentrancyGuard
                  </span>
                </div>
                <div className="p-4">
                  <div className="rounded-lg bg-void p-4 font-mono text-xs">
                    <p className="text-red-400/90">
                      {"- (bool ok, ) = msg.sender.call{value: amount}(\"\");"}
                    </p>
                    <p className="text-red-400/90">- require(ok);</p>
                    <p className="text-red-400/90">- balances[msg.sender] = 0;</p>
                    <p className="text-muted">+ balances[msg.sender] = 0;</p>
                    <p className="text-muted">
                      {"+ (bool ok, ) = msg.sender.call{value: amount}(\"\");"}
                    </p>
                    <p className="text-muted">+ require(ok);</p>
                    <p className="mt-2 text-safe">
                      + import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Slight gas increase; improved safety. Apply patch only after review.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-safe px-4 py-2 text-sm font-medium text-white"
                    >
                      Approve fix
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-subtle"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA footer */}
        <footer className="py-20">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <p className="text-sm text-muted">
              Prophet — AI-powered white-hat security for DeFi. User-in-the-loop, no
              auto-execution.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
