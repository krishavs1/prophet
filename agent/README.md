# Prophet Agent (Backend)

Analyzer service: accepts Solidity source and returns a structured JSON report.

## Run

```bash
# From repo root
npm run dev
# or from agent/
cd agent && npm install && npm run dev
```

Server runs at **http://localhost:3001** (or `PORT` env).

- **GET /health** — health check
- **POST /analyze** — body `{ "source": "contract Foo { ... }" }` → `ProphetReport` JSON

## Structure

- `src/types/report.ts` — report schema (matches README)
- `src/analyzer.ts` — analyzer stub (Phase 3: static analysis; Phase 5: 0G)
- `src/server.ts` — HTTP API
- `src/index.ts` — entry

## Config

Uses root `.env` / `.env.example`: `ZERO_G_API_KEY`, `RPC_URL_SEPOLIA`, `PRIVATE_KEY_DEPLOYER`.
