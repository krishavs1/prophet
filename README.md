Prophet — AI-Powered White‑Hat Smart Contract Security Agent for DeFi
========================================================================

Overview
--------
Prophet is an AI-driven, white-hat security agent that helps DeFi teams and auditors analyze Solidity smart contracts, simulate realistic attack paths, assess risk, and propose safe remediations—before anything hits mainnet. The system emphasizes user control, clear explanations, and verifiable outputs.

Core Capabilities
-----------------
- Vulnerability scanning: reentrancy, oracle manipulation, access control issues, authorization bypass, arithmetic flaws, and more
- Attack simulations: step-by-step exploit paths with state transitions and required preconditions
- Risk scoring: critical/medium/low with concise human-readable rationales
- Remediation suggestions: safer patterns and minimal-diff code suggestions for review
- User-in-the-loop: no auto-execution; every action requires explicit user approval
- Optional deployment: deploy patched contracts to a testnet only after user confirmation
- 0G integration: offload heavy inference and deep contract analysis to 0G
- Structured outputs: JSON reports suitable for CI, dashboards, or downstream automation

Safety and Guardrails
---------------------
- No automatic execution or on-chain writes without explicit user approval
- Read-only by default for analysis, simulation, and reporting
- Clear previews and diffs before any patch application or deployment
- Transparent scoring and justification for every reported issue
- Deterministic export format (JSON) to enable reproducibility and review

High-Level Architecture
-----------------------
- Frontend (web)
  - Upload or paste Solidity contracts
  - View findings, exploit paths, JSON reports, and patch previews
  - Trigger simulations and gated actions (fix application, testnet deploy)
- Backend (services)
  - Analyzer service: static/dynamic analysis, heuristics, and AST-level insights
  - Fuzzing/simulation: multi-step exploit exploration and state progression
  - 0G inference: heavy LLM-based reasoning and advanced vulnerability triage
  - Deployment executor: testnet-only deploys after user approval

JSON Report Schema (example)
----------------------------
The core outputs are standardized to enable auditing, CI integration, and post-processing.

```json
{
  "contract_name": "Vault",
  "source_hash": "sha256:...",
  "risk_score": 0.81,
  "risk_level": "critical",
  "summary": "Potential reentrancy in withdraw() enabling draining of funds.",
  "vulnerabilities": [
    {
      "id": "REENTRANCY_WITHDRAW",
      "title": "Reentrancy in withdraw()",
      "severity": "critical",
      "confidence": 0.92,
      "locations": [
        { "file": "contracts/Vault.sol", "function": "withdraw", "line_start": 72, "line_end": 110 }
      ],
      "explanation": "External call occurs before state update, allowing reentrant balance manipulation.",
      "evidence": {
        "patterns": ["external-call-before-effects", "unprotected-balance-write"],
        "call_graph": ["withdraw -> token.transfer -> fallback -> withdraw"]
      ],
      "references": [
        "https://swcregistry.io/docs/SWC-107"
      ]
    }
  ],
  "exploit_paths": [
    {
      "name": "Drain via token fallback reentry",
      "steps": [
        {
          "action": "attacker_deposit",
          "pre_state": { "attacker_balance": "0", "vault_balance": "1_000_000e18" },
          "post_state": { "attacker_shares": "100e18" },
          "notes": "Seed attacker with minimal initial funds."
        },
        {
          "action": "trigger_withdraw_reentry",
          "pre_state": { "attacker_shares": "100e18" },
          "post_state": { "attacker_balance": ">= 100e18", "vault_balance": "<= 999_900e18" },
          "notes": "Fallback reenters before effects; balance not reduced in time."
        }
      ],
      "success_criteria": "Attacker extracts >X% of vault in N calls"
    }
  ],
  "fix_suggestions": [
    {
      "id": "REENTRANCY_WITHDRAW_FIX",
      "title": "Checks-Effects-Interactions + ReentrancyGuard",
      "strategy": "reorder-effects-and-guard",
      "explanation": "Move state updates before external calls and add a reentrancy guard.",
      "diff_preview": "… minimal patch diff here …",
      "tradeoffs": "Slight gas increase; improved safety"
    }
  ],
  "meta": {
    "generated_at": "2026-02-19T12:00:00Z",
    "generator": "prophet@alpha",
    "inference_backend": "0g",
    "version": "0.1.0"
  }
}
```

Typical Workflow
----------------
1. Upload or select a Solidity contract in the UI
2. Run analysis to produce a structured JSON report
3. Inspect vulnerabilities and step-by-step exploit paths
4. Review suggested patches and diffs
5. Approve fixes (optional) to generate a patched artifact
6. Approve deployment (optional) to push to a testnet

Local Development (Monorepo)
---------------------------
This repository is structured as a monorepo:
- `frontend/`: Web UI for upload, results, simulations, approvals
- `agent/`: Analyzer/orchestrator integrating static checks, simulations, and 0G
- `contracts/`: Sample or test contracts used for validation and demos

Quickstart (indicative)
-----------------------
```bash
# From repo root
npm install

# Install per package if needed
(cd frontend && npm install)
(cd agent && npm install)
(cd contracts && npm install)
```

Configuration
-------------
Create an environment file for local development (example keys, adjust to your stack):
```bash
# .env (root or per-package)
ZERO_G_API_KEY=your_0g_key_here
RPC_URL_SEPOLIA=https://...
PRIVATE_KEY_DEPLOYER=0x...
```

0G Integration
--------------
- Heavy inference tasks (deep reasoning, triage, explanation synthesis) are routed to 0G
- The agent treats 0G as an external, auditable inference service; outputs are captured in the JSON report

Status and Roadmap
------------------
- See `TODO.md` for immediate tasks and milestones
- Near-term: end-to-end demo path, richer simulation harness, SARIF export

License
-------
TBD


