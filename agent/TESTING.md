# Testing the Prophet Agent

## Prerequisites

1. **Agent must be running:**
   ```bash
   cd agent && npm run dev
   ```
   You should see: `[agent] Prophet analyzer listening on http://localhost:3001`

## Quick Test Methods

### Method 1: Using the Test Script

```bash
cd agent
./test-agent.sh
```

This will test all endpoints automatically.

### Method 2: Manual curl Commands

#### 1. Health Check
```bash
curl http://localhost:3001/health
```

**Expected response:**
```json
{"status":"ok","service":"prophet-agent"}
```

#### 2. Analyze Contract
```bash
curl -X POST http://localhost:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "source": "contract TestVault { uint256 public totalAssets; function deposit() external payable { totalAssets += msg.value; } }"
  }'
```

**Expected response:** `ProphetReport` JSON with analysis results

#### 3. Generate Attack (Foundry Test)
```bash
curl -X POST http://localhost:3001/generate-attack \
  -H "Content-Type: application/json" \
  -d '{
    "source": "contract Vault { mapping(address => uint256) public balances; function withdraw() external { uint256 amount = balances[msg.sender]; (bool success, ) = msg.sender.call{value: amount}(\"\"); balances[msg.sender] = 0; } }"
  }'
```

**Expected response:**
```json
{
  "testCode": "// SPDX-License-Identifier: MIT\npragma solidity..."
}
```

#### 4. Generate Patch
```bash
curl -X POST http://localhost:3001/generate-patch \
  -H "Content-Type: application/json" \
  -d '{
    "originalCode": "contract Vault { ... }",
    "crashTrace": "Test failed: invariant violated..."
  }'
```

**Expected response:**
```json
{
  "patchedCode": "// SPDX-License-Identifier: MIT\npragma solidity..."
}
```

### Method 3: Using Postman/Thunder Client

1. **Base URL:** `http://localhost:3001`
2. **Endpoints:**
   - `GET /health`
   - `POST /analyze` (body: `{ "source": "contract ..." }`)
   - `POST /generate-attack` (body: `{ "source": "contract ..." }`)
   - `POST /generate-patch` (body: `{ "originalCode": "...", "crashTrace": "..." }`)

### Method 4: From Frontend

The frontend can call these endpoints directly:

```typescript
// Example: Analyze contract
const response = await fetch('http://localhost:3001/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: contractCode })
});
const report = await response.json();
```

## What to Expect

### With 0G Configured (has private key + tokens)
- ✅ Real AI-generated responses
- ✅ Foundry test code that compiles
- ✅ Patched contracts with security fixes
- ✅ Logs: `[0G] Broker initialized`

### Without 0G (fallback mode)
- ✅ Mock responses (for development)
- ✅ Logs: `[0G] Using fallback mock response`
- ✅ All endpoints still work
- ⚠️ Responses are placeholders, not real AI

## Troubleshooting

**"Connection refused"**
- Make sure agent is running: `cd agent && npm run dev`

**"0G inference failed"**
- Check `.env` has `PRIVATE_KEY_DEPLOYER` set
- Verify you have 0G testnet tokens
- Check logs for specific error messages

**"No 0G services available"**
- Network connectivity issue
- 0G testnet services may be temporarily unavailable
- Falls back to mock mode automatically

## Example Test Contract

Try analyzing this vulnerable contract:

```solidity
contract VulnerableVault {
    mapping(address => uint256) public balances;
    
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }
    
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        balances[msg.sender] = 0; // Reentrancy vulnerability!
    }
}
```

This should generate an attack test and a patch!
