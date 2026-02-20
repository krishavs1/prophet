# 0G DeFAI Sentinel - Project Execution Plan
This project is an "Autonomous DeFAI Sentinel" built for the 0G Compute Hackathon. It is a DeFi risk-management agent that monitors a user's lending position. When a simulated price crash occurs, the backend agent uses the 0G Compute network (AI Inference) to analyze the risk, generate a structured JSON action plan, and send it to the frontend. The frontend displays the AI's reasoning, a verifiable TEE (Trusted Execution Environment) proof, and asks the user to approve a transaction to save their funds (e.g., adding collateral or repaying debt).

**Tech Stack:** - Frontend: Next.js (App Router), TailwindCSS, Wagmi, Viem, RainbowKit
- Contracts: Solidity, Foundry (or Hardhat)
- Backend/Agent: Node.js/TypeScript, 0G TypeScript SDK, OpenAI API (as a fallback/mock if 0G endpoint is WIP)

---

## Phase 1: Environment Setup & Scaffold
- [x] Initialize a standard monorepo setup (e.g., Turborepo or just separate `frontend` and `contracts` folders).
- [ ] Initialize Next.js app in `/frontend` (`npx create-next-app@latest`).
- [ ] Install Web3 frontend dependencies: `npm install wagmi viem @rainbow-me/rainbowkit @tanstack/react-query`.
- [ ] Initialize Foundry in `/contracts` (`forge init`).
- [ ] Initialize Node.js backend in `/agent` for the off-chain monitoring loop.
- [ ] Install 0G dependencies in `/agent`: `@0glabs/0g-ts-sdk` (or relevant 0G compute packages based on current docs).

## Phase 2: Smart Contract Development (The Mock DeFi Environment)
**Goal:** Create a controlled environment to simulate a DeFi lending protocol and a price crash.
- [ ] Create `contracts/src/MockERC20.sol`: A standard ERC20 token with a public `mint` function (for MockUSDC and MockETH).
- [ ] Create `contracts/src/MockOracle.sol`: 
  - Add a state variable `uint256 public currentPrice`.
  - Add `function setPrice(uint256 _newPrice) public` (This is our "demo trigger").
- [ ] Create `contracts/src/MockLendingPool.sol`:
  - Needs functions: `supply(address token, uint256 amount)`, `borrow(address token, uint256 amount)`, `repay(address token, uint256 amount)`.
  - Needs a view function: `getHealthFactor(address user)` that reads from `MockOracle`. (If Health Factor < 1.0, user is liquidatable).
- [ ] Write a deployment script (`scripts/DeployLocal.s.sol`) that:
  - Deploys MockERC20s, Oracle, and LendingPool.
  - Mints tokens to the first local Anvil address.
  - Supplies initial collateral and takes out a borrow position so the Health Factor starts at ~1.5.

## Phase 3: The AI Agent (Backend / 0G Compute Integration)
**Goal:** An off-chain script that monitors the blockchain, triggers AI inference on 0G when risk is high, and outputs a structured JSON plan.
- [ ] Create `agent/index.ts`: Set up a Viem `publicClient` to listen to blocks on the local Anvil node.
- [ ] Implement the Polling Loop: Check the user's Health Factor on `MockLendingPool` every 5 seconds.
- [ ] Create the **Trigger Logic**: If Health Factor drops below 1.2, trigger the 0G Compute Inference function.
- [ ] Implement `agent/0gService.ts`:
  - Define the System Prompt: *"You are a DeFAI risk agent. The user's Health Factor is [X], ETH price is [Y]. Output ONLY a valid JSON object containing: risk_assessment, reasoning, target_protocol, action (e.g., 'repay'), amount_wei, and verification_badge."*
  - Integrate the 0G Compute API/SDK to send this prompt to the AI model.
- [ ] Implement mock TEE Attestation: (Since local dev might not have real hardware TEE, generate a mock `0x...` hex string that represents the 0G cryptographic proof of inference).
- [ ] Create a local WebSocket or Express REST API (`agent/server.ts`) to serve the AI's JSON output to the Next.js frontend.

## Phase 4: Frontend Development (The User Dashboard)
**Goal:** A clean UI that displays the DeFi position and the DeFAI intervention popup.
- [ ] Create `frontend/components/WalletConnect.tsx`: Setup RainbowKit button.
- [ ] Create `frontend/components/Dashboard.tsx`:
  - Fetch and display the user's balances (MockETH, MockUSDC).
  - Fetch and display the current Oracle Price and user's Health Factor from `MockLendingPool`.
  - Add dynamic color-coding (Green for HF > 1.5, Orange for HF < 1.2, Red for HF < 1.0).
- [ ] Create the **"Demo Crash" Button**:
  - A subtle admin button in the UI that calls `MockOracle.setPrice()` to instantly drop the price of ETH by 40%.
- [ ] Create `frontend/components/AgentAlertModal.tsx`:
  - Connect to the Agent's WebSocket/API.
  - When the Agent sends a risk payload, pop up a high-priority modal.
  - **Display structured data:** - 🔴 Risk Assessment: "High - Liquidation Imminent"
    - 🤖 AI Reasoning: "ETH price dropped. Health factor is 1.05."
    - 🛡️ Verification: Show the "TEE Verified on 0G" badge with the mock proof hash.
- [ ] Create the **1-Click Execution**:
  - Inside the Modal, add an "Approve & Execute Rescue Plan" button.
  - Wire this button to send the transaction prescribed by the AI (e.g., calling `MockLendingPool.repay()` via Wagmi `useWriteContract`).
  - Show a success toast when the transaction mines and the Health Factor goes back to green.

## Phase 5: Demo Preparation & Polish
- [ ] Add a `docker-compose.yml` or `Makefile` to start the frontend, agent, and Anvil node simultaneously (satisfies "Reproducible setup" rubric).
- [ ] Write `README.md` containing:
  - Project architecture map.
  - Explanation of how 0G Compute and TEE attestations solve the "Trusted AI Oracle" problem.
  - Step-by-step instructions to run the local demo.
- [ ] **Test the full workflow**: Start node -> Setup position -> Click "Crash Price" -> Wait for Agent to pop up Modal -> Click "Execute Rescue" -> Verify HF is fixed.
