# Web3 Security Guardian (0G DeFAI Track)

## 📌 Project Overview
A "Safe-to-Mainnet" AI Vault Deployer and Security Guardian. This DeFAI pipeline prevents vulnerable smart contracts from reaching mainnet by acting as an **autonomous white-hat hacking agent**. It doesn't just "read" code—it actively writes custom invariant tests, bombards the contract in a simulated Foundry sandbox, reads its own crash logs when it successfully drains the funds, and generates the patch based on hard execution evidence.

**The Hacker Loop Workflow:**
1. **Input Code:** User pastes a DeFi smart contract (e.g., an ERC-4626 Vault).
2. **0G Attack Planning (Perceive & Act):** Decentralized LLM reads the contract, defines the invariant rules (e.g., "Total assets must equal user shares"), and writes a custom Foundry Fuzzing script (`Vault.invariant.t.sol`).
3. **Foundry Execution (Observe):** The backend spins up a local fork and runs the fuzzer, hammering the contract with thousands of randomized transactions. The terminal streams the live attack to the frontend.
4. **AI Patching (Adapt):** If the fuzzer breaks the contract, the backend captures the exact execution trace (crash logs) and feeds it *back* to the 0G AI. The AI reads the trace, writes the exact Solidity patch, and re-runs the loop to prove the contract is now secure.
5. **Safe Deployment:** Unlocks deployment to testnet/mainnet *only* after the fuzzer fails to break the patched code.

## 🛠 Tech Stack
* **Frontend:** Next.js (App Router), React, Tailwind CSS, Shadcn UI
* **State Management:** Zustand
* **AI Inference:** 0G Compute Network (using the 0G Compute TypeScript SDK)
* **Backend/Simulation:** Node.js API Routes + Foundry (`forge test --invariant`)
* **Web3 Integration:** `wagmi`, `viem`, RainbowKit

---

## 📝 TODO: AI Context & Implementation Plan
*Use the following task list as a step-by-step implementation guide.*

### Phase 1: Frontend State & UI Skeleton
- [ ] **Setup Next.js:** Initialize Next.js with App Router, Tailwind, and Shadcn.
- [ ] **Create Zustand Store (`src/store/usePipelineStore.ts`):** - Manage state for `currentStep` (1-4).
  - Manage contract state: `originalCode`, `patchedCode`.
  - Manage hacker loop state: `isGeneratingAttack`, `isFuzzing`, `fuzzLogs` (streaming array), `isPatching`, `loopIterationCount`.
- [ ] **Build UI Components:**
  - `PipelineStepper`: Top navigation to show progress.
  - `CodeEditorPane`: Use `@monaco-editor/react` for Solidity syntax highlighting.
  - `HackerDashboard`: Display the live attack status, iteration count, and the final 0G AI vulnerability report.
  - `TerminalSim`: Use `react-terminal-ui` to stream the Foundry execution logs in real-time.

### Phase 2: 0G AI Agentic Brains (The Attacker & The Patcher)
- [ ] **Setup 0G Compute SDK:** Integrate the `@0glabs/0g-compute-typescript-sdk` for decentralized inference.
- [ ] **Create Attack Generator API (`src/app/api/generate-attack/route.ts`):**
  - Prompt engineer the 0G AI: "Act as an elite white-hat hacker. Analyze this Solidity contract and write a complete, compilable Foundry Invariant Test (`Vault.t.sol`) designed to break its core accounting logic."
- [ ] **Create Remediation API (`src/app/api/generate-patch/route.ts`):** - Prompt engineer the 0G AI: "You are a remediation agent. Read the provided original Solidity code and this Foundry execution crash trace where the contract was successfully hacked. Write the exact patched Solidity code to fix the vulnerability exposed in the trace."

### Phase 3: Foundry Fuzzing Engine (The Sandbox Orchestrator)
- [ ] **Create Simulation Orchestrator (`src/app/api/fuzz/route.ts`):**
  - Accept the AI-generated `Vault.t.sol` exploit script and save it to the local Foundry test directory.
  - Spin up a local fork and execute `forge test --invariant -vvvv` via Node's `child_process.exec`.
  - Stream the raw, verbose terminal output (stdout) directly to the frontend's terminal UI.
  - **The Loop Logic:** - If `forge test` fails (throws an error), catch the `error.stdout` (the crash trace), send it to the `generate-patch` API, and trigger the loop again.
    - If `forge test` passes cleanly, exit the loop and mark the code as `Secured`.

### Phase 4: Web3 Deployment
- [ ] **Integrate Web3 Providers:** Setup `RainbowKit` and `wagmi` in a `Web3Provider` wrapper.
- [ ] **Create Deployment Flow:** - Once the `zustand` store marks the contract as `Secured` (Step 4), unlock the Deploy button.
  - Trigger a wallet transaction using `useWriteContract` to safely deploy the `patchedCode` bytecode to the network.