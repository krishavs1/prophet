# Prophet Agent (Backend)

AI-powered smart contract security analyzer with 0G Compute integration.

## Features

- **Contract Analysis** (`POST /analyze`) - Analyzes Solidity contracts for vulnerabilities
- **Attack Generation** (`POST /generate-attack`) - Generates Foundry invariant tests to break contracts
- **Patch Generation** (`POST /generate-patch`) - Generates patched code from crash traces

## Run

```bash
# From repo root
npm run dev
# or from agent/
cd agent && npm install && npm run dev
```

Server runs at **http://localhost:3001** (or `PORT` env).

## API Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{ "status": "ok", "service": "prophet-agent" }
```

### `POST /analyze`
Analyze a Solidity contract for vulnerabilities.

**Request:**
```json
{
  "source": "contract Vault { ... }"
}
```

**Response:** `ProphetReport` JSON (see `src/types/report.ts`)

### `POST /generate-attack`
Generate a Foundry invariant test to attack the contract.

**Request:**
```json
{
  "source": "contract Vault { ... }"
}
```

**Response:**
```json
{
  "testCode": "// SPDX-License-Identifier: MIT\npragma solidity..."
}
```

### `POST /generate-patch`
Generate patched Solidity code from crash trace.

**Request:**
```json
{
  "originalCode": "contract Vault { ... }",
  "crashTrace": "Foundry execution log showing vulnerability..."
}
```

**Response:**
```json
{
  "patchedCode": "// SPDX-License-Identifier: MIT\npragma solidity..."
}
```

## 0G Integration

The agent uses **0G Compute Network** for AI inference when configured:

1. Set `PRIVATE_KEY_DEPLOYER` in `.env` (wallet private key)
2. Set `RPC_URL_SEPOLIA` (0G testnet RPC, defaults to `https://evmrpc-testnet.0g.ai`)

**Without 0G:** The agent falls back to mock responses for development.

## Structure

- `src/types/report.ts` - Report schema
- `src/analyzer.ts` - Main analyzer (uses 0G when available)
- `src/services/0gService.ts` - 0G Compute Network wrapper
- `src/services/attackGenerator.ts` - Foundry test generation
- `src/services/patchGenerator.ts` - Patch generation from traces
- `src/server.ts` - HTTP API server
- `src/index.ts` - Entry point

## Development

```bash
# Build
npm run build

# Run compiled
npm start

# Type check
npm run lint
```
