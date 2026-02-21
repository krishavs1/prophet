# 0G Agent Setup Guide (MetaMask)

Follow the [0G Inference docs](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference). This guide walks you through **MetaMask + CLI** so the Prophet agent can use 0G AI.

---

## Important: Two different 0G balances

Your wallet can show **0G in two different places**:

| Where you see it | What it is | Used for Prophet? |
|------------------|------------|-------------------|
| **“All networks” / Ethereum** | OG on Ethereum (or another chain). You might see e.g. **0.26 OG** here. | **No.** The agent does not use this. |
| **“OG Mainnet” in MetaMask** | **Native 0G** on the 0G chain (Chain ID 16661). This is what the agent uses for mainnet. | **Yes.** If this shows **0 OG**, you get “insufficient funds” on mainnet. |

- **Testnet:** Uses the **0G testnet** chain (Galileo). You get free testnet OG from the [faucet](https://faucet.0g.ai/) (e.g. 0.1/day). No real money.
- **Mainnet:** Uses the **0G mainnet** chain. You need **native 0G on that chain**. If your OG is only on Ethereum, you must **bridge** it to 0G mainnet first (see below).

---

## Prerequisites

- **Node.js >= 22.0.0**
- **MetaMask** (or any EVM wallet)
- **0G tokens:** either testnet (from [faucet](https://faucet.0g.ai/)) or mainnet (bridge from Ethereum – see “Using mainnet (real 0G)” below)

---

## Step 1: MetaMask – Get your private key

1. Open **MetaMask**.
2. Use a **test account** (or create one: Account icon → Add account).
3. **Export private key:**  
   Account icon → **Settings** → **Security & Privacy** → **Export Private Key** → enter password → copy.
4. Copy the key (format `0x` + 64 hex chars). You’ll use it in Step 3 and Step 5.

**Security:** Use a test wallet with no real funds. Never commit this key.

---

## Step 2: Get 0G testnet tokens

1. Go to **https://faucet.0g.ai/**.
2. Paste your **MetaMask wallet address** (Account 1 → copy address).
3. Request testnet tokens.
4. Wait until the balance shows up (usually 1–2 minutes).

You need these tokens to create your 0G account and pay for inference.

---

## Step 3: 0G CLI – Create account and deposit

The 0G Compute Network needs an **on-chain account** for your wallet before inference works. Use the official CLI to **deposit** (this creates and funds the account).

### 3a. Install CLI (from repo root)

```bash
cd /path/to/prophet
pnpm add -g @0glabs/0g-serving-broker
# or
npm install -g @0glabs/0g-serving-broker
```

### 3b. Set network and login

```bash
# Choose testnet when prompted
0g-compute-cli setup-network

# Login: paste your MetaMask private key when prompted
0g-compute-cli login
```

### 3c. Deposit (creates account + adds funds)

```bash
# Deposit at least 1.5 0G so you can transfer 1 0G to the inference provider (see 3e).
# Uses tokens from your wallet.
0g-compute-cli deposit --amount 1.5
```

### 3d. Check account

```bash
0g-compute-cli get-account
```

You should see your account and balance. If this works, your 0G account exists.

### 3e. Transfer funds to the inference provider (required)

The agent bills the **provider sub-account**, not the main ledger. You must transfer at least **1 0G** to the inference provider before the first request.

```bash
# List providers to get the provider address
0g-compute-cli inference list-providers

# Transfer 1 0G to that provider (use the address from the list)
0g-compute-cli transfer-fund --provider <PROVIDER_ADDRESS> --amount 1 --service inference
```

If you skip this step, the first `/analyze` call will fail with `InsufficientAvailableBalance` (you have X, provider requires 1 0G).

---

## Using mainnet (real 0G) – bridge first

If you have **0.26 OG on Ethereum** (or “all networks”) but **0 OG on “OG Mainnet”** in MetaMask, the agent will say insufficient funds because it uses **native 0G on the 0G chain**, not Ethereum OG.

**Do this:**

1. **Add 0G Mainnet to MetaMask** (if needed): Network dropdown → Add network → use:
   - Network name: **0G Mainnet**
   - RPC: `https://evmrpc.0g.ai`
   - Chain ID: **16661**
   - Explorer: `https://chainscan.0g.ai`

2. **Bridge OG from Ethereum → 0G Mainnet**
   - Go to **[https://hub.0g.ai/bridge](https://hub.0g.ai/bridge?network=mainnet)** (use `?network=mainnet` for mainnet).
   - Connect the same wallet you use for the agent.
   - Select **Ethereum** as source and **0G Mainnet** as destination.
   - Bridge the amount you want (e.g. 0.2 OG). Wait for confirmation.

3. **Check MetaMask:** Switch to **OG Mainnet**. You should see your OG balance (e.g. 0.2 OG) instead of 0.

4. **Use mainnet in the CLI and agent:**
   - `0g-compute-cli setup-network` → choose **Mainnet**.
   - `0g-compute-cli login` (same private key as in `.env`).
   - `0g-compute-cli deposit --amount 1` (or whatever you bridged; need at least 1 for the provider).
   - `0g-compute-cli inference list-providers` then `0g-compute-cli transfer-fund --provider <ADDRESS> --amount 1 --service inference`.
   - In repo root **`.env`** set: `0G_RPC_URL=https://evmrpc.0g.ai`.
   - Restart the agent (`npm run dev` in `agent/`).

After this, “insufficient funds” on mainnet should stop, because your balance on **OG Mainnet** will be used.

---

## Foundry Docker Sandbox

The `/simulate` endpoint runs user-submitted Solidity in Foundry. By default, each run is isolated inside a Docker container with:

- **No network** (`--network none`)
- **Limited resources** (`--memory 512m`, `--cpus 1`)
- **Read-only filesystem** (source files mounted `:ro`)
- **`ffi = false`** in `foundry.toml` (prevents arbitrary shell commands)
- **120-second timeout** (configurable via `FORGE_TIMEOUT_MS`)

### Build the sandbox image (one-time)

```bash
cd agent/docker
./build-image.sh
```

This builds the `prophet-forge` Docker image with Foundry and `forge-std` pre-installed. No downloads happen per test run.

### Running without Docker (local dev)

If you don't have Docker, set in root `.env`:

```env
USE_DOCKER_SANDBOX=false
```

This falls back to running `forge` directly on the host. **Not recommended for production** — user code runs with your system permissions.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_DOCKER_SANDBOX` | `true` | Set to `false` to skip Docker and run forge locally |
| `FORGE_DOCKER_IMAGE` | `prophet-forge` | Docker image name for the sandbox |
| `FORGE_TIMEOUT_MS` | `120000` | Max time (ms) before killing a test run |
| `FORGE_PATH` | auto-detected | Path to forge binary (only used when Docker is off) |

---

## Step 4: Root `.env` for the Prophet agent

In the **repo root** (same folder as `package.json`), create or edit `.env`:

```bash
# From repo root
cp .env.example .env
```

Set (use the **same** MetaMask private key as in Step 3):

```env
PRIVATE_KEY_DEPLOYER=0xYOUR_METAMASK_PRIVATE_KEY
RPC_URL_SEPOLIA=https://evmrpc-testnet.0g.ai
```

- Use the **same wallet** (same private key) you used for the CLI deposit.
- The agent loads this file automatically from the root.

---

## Step 5: Run the agent

```bash
cd agent
npm run dev
```

You should see:

- `[agent] Loaded .env from .../prophet/.env`
- `[agent] PRIVATE_KEY_DEPLOYER is set (0G enabled)`
- `[0G] Broker initialized`

Then test:

```bash
curl -X POST http://localhost:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{"source":"contract Test {}"}'
```

If everything is set up correctly, the response should include `"inference_backend":"0g"` and real AI content (not the stub).

---

## How the agent uses 0G (from the docs)

1. **Broker** – The agent uses `createZGComputeNetworkBroker(wallet)` with your `PRIVATE_KEY_DEPLOYER` (same as [SDK: Initialize the Broker](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference#initialize-the-broker)).
2. **Account** – Your 0G account must exist and have funds (you did this with `deposit` in Step 3).
3. **Acknowledge provider** – Before the first request to a provider, the agent calls `acknowledgeProviderSigner(providerAddress)` (see [Account Management](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference#account-management)).
4. **Inference** – The agent gets service metadata and request headers, then calls the provider’s `chat/completions` endpoint (see [Make Inference Requests](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference#make-inference-requests)).

Testnet has at least one chatbot model (e.g. **qwen-2.5-7b-instruct**); the agent will use an available LLM.

---

## Troubleshooting

| Error | What to do |
|-------|------------|
| **Account does not exist** | Run Step 3 again: `0g-compute-cli login` then `0g-compute-cli deposit --amount 10`. |
| **Insufficient balance** | Get more tokens from https://faucet.0g.ai/ then `0g-compute-cli deposit --amount 5`. |
| **InsufficientAvailableBalance (Arg0: …, Arg1: 1000…)** | Your main account has funds but the **provider sub-account** needs at least **1 0G**. Run `0g-compute-cli inference list-providers`, then `0g-compute-cli transfer-fund --provider <ADDRESS> --amount 1 --service inference`. If you only have 0.1 0G (faucet daily limit), get more testnet OG (e.g. from faucet over several days or ask in 0G Discord) so you can deposit and transfer 1 0G. |
| **I have 0.26 OG but “0 OG” on OG Mainnet / insufficient funds** | Your OG is on **Ethereum** (or another chain), not on the **0G chain**. The agent uses **native 0G on 0G mainnet**. Bridge first: [hub.0g.ai/bridge](https://hub.0g.ai/bridge?network=mainnet) (Ethereum → 0G Mainnet). Then in MetaMask under “OG Mainnet” you’ll see the balance; run `deposit` and `transfer-fund` as in Step 3 and the “Using mainnet (real 0G)” section above. |
| **Provider not acknowledged** | After transferring to the provider (Step 3e), the agent acknowledges automatically. To do it manually: `0g-compute-cli inference acknowledge-provider --provider <PROVIDER_ADDRESS>` (get address from `0g-compute-cli inference list-providers`). |
| **No private key / fallback mode** | Ensure `PRIVATE_KEY_DEPLOYER` is in **root** `.env` and the agent was restarted after editing. |
| **Failed to import SDK** | Agent uses the CJS build; if you still see ESM errors, try Node 22 (e.g. `nvm use 22`). |

---

## Optional: Web UI (no code)

To try 0G with a UI and the same wallet:

1. **https://compute-marketplace.0g.ai/inference**
2. Connect **MetaMask** (same account you used above).
3. Deposit in the UI if needed, then use “Chat” or “Build” on a provider.

Same account (same wallet) works for both the Web UI and the Prophet agent.

---

## Reference

- [0G Compute Inference](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference) – prerequisites, CLI, SDK, account, troubleshooting.
- [0G Testnet Faucet](https://faucet.0g.ai/) – get testnet tokens.
