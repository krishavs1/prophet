# Prophet — TODO and Milestones

Tasks and milestones derived from the [README](README.md) vision. Order is indicative; adjust based on dependencies and priorities.

---

## Phase 1: Foundation & Monorepo

- [ ] Initialize monorepo (e.g. npm workspaces / pnpm / Turborepo) with `frontend/`, `agent/`, `contracts/`
- [ ] Root `package.json` scripts: `install`, `build`, `test`, `dev`
- [ ] Add root `.env.example` with `ZERO_G_API_KEY`, `RPC_URL_SEPOLIA`, `PRIVATE_KEY_DEPLOYER`
- [ ] Document and enforce shared tooling (Node version, lint, format)

---

## Phase 2: JSON Report Schema & Types

- [ ] Define canonical JSON report schema (TypeScript types or JSON Schema) matching README example
- [ ] Fields: `contract_name`, `source_hash`, `risk_score`, `risk_level`, `summary`, `vulnerabilities`, `exploit_paths`, `fix_suggestions`, `meta`
- [ ] Shared types package or file consumable by both `agent` and `frontend`
- [ ] Add schema validation (e.g. Zod/ajv) for report ingestion

---

## Phase 3: Analyzer Service (Agent)

- [ ] Analyzer service skeleton: accept Solidity source, return structured report (stub or real)
- [ ] Static analysis: reentrancy, oracle manipulation, access control, authorization bypass, arithmetic
- [ ] AST-level parsing (e.g. solc / solidity parser) for locations (file, function, line ranges)
- [ ] Heuristics and pattern detection (e.g. external-call-before-effects, unprotected balance write)
- [ ] Risk scoring: critical/medium/low with human-readable rationales
- [ ] Evidence and references (e.g. SWC links) in vulnerability entries

---

## Phase 4: Simulation & Exploit Paths

- [ ] Simulation harness: multi-step exploit exploration and state progression
- [ ] Represent exploit paths as steps with `action`, `pre_state`, `post_state`, `notes`
- [ ] Success criteria per path
- [ ] Call-graph / reentrancy path detection (e.g. withdraw → token.transfer → fallback → withdraw)
- [ ] (Later) Richer simulation: forking testnet/mainnet, symbolic execution, or fuzzing integration

---

## Phase 5: 0G Integration

- [ ] 0G client/config: auth, endpoint, rate limits
- [ ] Route heavy inference (deep reasoning, triage, explanation synthesis) to 0G
- [ ] Capture 0G outputs in report (`meta.inference_backend: "0g"`)
- [ ] Fallback or local inference path for dev without 0G key
- [ ] Document 0G usage and cost/auditability in README or docs

---

## Phase 6: Remediation & Fix Suggestions

- [ ] Fix suggestion format: `id`, `title`, `strategy`, `explanation`, `diff_preview`, `tradeoffs`
- [ ] Strategies: e.g. reorder-effects-and-guard, reentrancy-guard, access-control
- [ ] Generate minimal-diff code suggestions (patch preview) for review
- [ ] No auto-apply: fixes only generated and shown; user approves before any write

---

## Phase 7: Frontend (Web UI)

- [ ] Frontend app scaffold (e.g. React/Next/Vite) under `frontend/`
- [ ] Upload or paste Solidity contracts
- [ ] Call analyzer/simulation APIs and display loading states
- [ ] View findings: list of vulnerabilities with severity, locations, explanation, evidence
- [ ] View exploit paths: step-by-step with pre/post state and notes
- [ ] View fix suggestions and diff previews
- [ ] Trigger simulations and gated actions (fix application, testnet deploy) with explicit approval
- [ ] Export or copy JSON report
- [ ] (Optional) CI-style dashboard view for report history

---

## Phase 8: User-in-the-Loop & Safety

- [ ] No automatic execution or on-chain writes without explicit user approval
- [ ] Read-only by default for analysis, simulation, and reporting
- [ ] Clear previews and diffs before patch application or deployment
- [ ] Confirmations for: “Apply fix”, “Deploy to testnet”
- [ ] Transparent scoring and justification for every reported issue

---

## Phase 9: Deployment Executor (Testnet Only)

- [ ] Deployment executor service: testnet-only deploys
- [ ] Require user approval and clear target (e.g. Sepolia)
- [ ] Use `RPC_URL_SEPOLIA` and `PRIVATE_KEY_DEPLOYER` from env
- [ ] Return tx hash and contract address; no mainnet support in scope

---

## Phase 10: Contracts & Validation

- [ ] `contracts/` package: sample or test Solidity contracts for validation and demos
- [ ] At least one contract with known issues (e.g. reentrancy) for end-to-end testing
- [ ] Scripts or tests that run Prophet on these contracts and assert report shape

---

## Phase 11: End-to-End Demo & Polish

- [ ] End-to-end demo path: upload contract → analysis → report → view findings/exploits/fixes → (optional) apply fix → (optional) testnet deploy
- [ ] Quickstart in README verified (install, env, run frontend + agent)
- [ ] Richer simulation harness (see Phase 4 “Later”)
- [ ] SARIF export for CI/IDE integration
- [ ] License and contribution guidelines

---

## Ongoing / Backlog

- [ ] CI: lint, test, build on PR
- [ ] Deterministic report generation (reproducibility) where possible
- [ ] Performance: incremental analysis, caching by `source_hash`
- [ ] More vulnerability classes and SWC coverage
- [ ] Optional: mainnet read-only analysis (no deploy)

---

*Last updated from README vision. Check off items as done and add new ones under the appropriate phase.*
