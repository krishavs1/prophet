# 0G Agent Setup Guide

## Required Environment Variables

You need two things in your `.env` file for 0G AI integration:

### 1. `PRIVATE_KEY_DEPLOYER` (Wallet Private Key)

**What it is:** A private key from an Ethereum-compatible wallet

**Why you need it:**
0G Compute Network uses **blockchain-based authentication and payment**, not API keys. The wallet is used for:
- 🔐 **Authentication** - Proving your identity to the 0G network
- 💰 **Payment** - Depositing 0G tokens to pay for AI inference (like prepaid credits)
- ✍️ **Signing** - Cryptographically signing requests to providers

Think of it like: Instead of an API key, you use a crypto wallet that holds tokens to pay for each AI request.

**How to get it:**

#### Option A: Create a new wallet (recommended for testing)
```bash
# Using Node.js/ethers (one-time setup)
node -e "const { ethers } = require('ethers'); const wallet = ethers.Wallet.createRandom(); console.log('Address:', wallet.address); console.log('Private Key:', wallet.privateKey);"
```

#### Option B: Export from MetaMask
1. Open MetaMask extension
2. Click account icon → Settings → Security & Privacy
3. Click "Export Private Key"
4. Enter your password
5. Copy the private key (starts with `0x`)

#### Option C: Use an existing wallet
If you already have a wallet, export its private key using your wallet's export feature.

**⚠️ Security Warning:** 
- Never commit private keys to git
- Use a test wallet with no real funds for development
- The `.env` file is gitignored, but still be careful

### 2. `RPC_URL_SEPOLIA` (0G Testnet RPC)

**What it is:** The RPC endpoint URL for 0G testnet

**Default value (already set in code):**
```
https://evmrpc-testnet.0g.ai
```

**You can also use:**
- The default is fine for most cases
- If you have issues, you can try alternative RPC endpoints
- No additional setup needed unless you want a custom RPC

## Setup Steps

1. **Create `.env` file** in the **repo root folder** (same level as `package.json`):
   ```bash
   # From repo root
   cp .env.example .env
   ```
   
   **Important:** The `.env` file goes in the **root folder** (`/prophet/.env`), not in the `agent/` folder. The agent will automatically load it.

2. **Add your private key** to `.env`:
   ```bash
   PRIVATE_KEY_DEPLOYER=0x1234567890abcdef...  # Your actual private key
   ```

3. **Optional:** Set custom RPC (or leave default):
   ```bash
   RPC_URL_SEPOLIA=https://evmrpc-testnet.0g.ai
   ```

4. **Get testnet tokens** (required for AI inference):
   - Visit https://faucet.0g.ai/
   - Request tokens for your wallet address
   - **You need 0G tokens to pay for AI inference** - each request costs tokens
   - The wallet acts like a prepaid account that gets debited per request

## Testing Without 0G

If you don't have a private key yet, the agent will:
- ✅ Still work and respond to API calls
- ✅ Return mock responses for `/generate-attack` and `/generate-patch`
- ✅ Show warnings in logs: `[0G] Using fallback mock response`

This lets you develop the frontend and test the API structure without 0G setup.

## Verify Setup

Once configured, start the agent:
```bash
cd agent && npm run dev
```

Look for:
- ✅ `[0G] Broker initialized` = Success!
- ⚠️ `[0G] No private key provided` = Using fallback mode

## Troubleshooting

**"Failed to initialize broker"**
- Check your private key format (should start with `0x`)
- Ensure RPC URL is accessible
- Try getting testnet tokens from faucet

**"No 0G services available"**
- Check network connectivity
- Verify RPC URL is correct
- May need to wait for 0G testnet services to be available
