#!/bin/bash
# Quick test script for Prophet Agent endpoints

BASE_URL="http://localhost:3001"

echo "🧪 Testing Prophet Agent..."
echo ""

# Test 1: Health check
echo "1️⃣ Testing GET /health"
curl -s "$BASE_URL/health" | jq '.' || curl -s "$BASE_URL/health"
echo -e "\n"

# Test 2: Analyze endpoint
echo "2️⃣ Testing POST /analyze"
curl -s -X POST "$BASE_URL/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "contract TestVault { uint256 public totalAssets; function deposit() external payable { totalAssets += msg.value; } }"
  }' | jq '.' || curl -s -X POST "$BASE_URL/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "contract TestVault { uint256 public totalAssets; function deposit() external payable { totalAssets += msg.value; } }"
  }'
echo -e "\n"

# Test 3: Generate attack
echo "3️⃣ Testing POST /generate-attack"
curl -s -X POST "$BASE_URL/generate-attack" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "contract Vault { mapping(address => uint256) public balances; function withdraw() external { uint256 amount = balances[msg.sender]; (bool success, ) = msg.sender.call{value: amount}(\"\"); balances[msg.sender] = 0; } }"
  }' | jq '.testCode' || curl -s -X POST "$BASE_URL/generate-attack" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "contract Vault { mapping(address => uint256) public balances; function withdraw() external { uint256 amount = balances[msg.sender]; (bool success, ) = msg.sender.call{value: amount}(\"\"); balances[msg.sender] = 0; } }"
  }'
echo -e "\n"

# Test 4: Generate patch
echo "4️⃣ Testing POST /generate-patch"
curl -s -X POST "$BASE_URL/generate-patch" \
  -H "Content-Type: application/json" \
  -d '{
    "originalCode": "contract Vault { mapping(address => uint256) public balances; function withdraw() external { uint256 amount = balances[msg.sender]; (bool success, ) = msg.sender.call{value: amount}(\"\"); balances[msg.sender] = 0; } }",
    "crashTrace": "Test failed: invariant_totalAssetsEqualsShares() violated. Attacker drained 100 ETH before balance was updated."
  }' | jq '.patchedCode' || curl -s -X POST "$BASE_URL/generate-patch" \
  -H "Content-Type: application/json" \
  -d '{
    "originalCode": "contract Vault { mapping(address => uint256) public balances; function withdraw() external { uint256 amount = balances[msg.sender]; (bool success, ) = msg.sender.call{value: amount}(\"\"); balances[msg.sender] = 0; } }",
    "crashTrace": "Test failed: invariant_totalAssetsEqualsShares() violated. Attacker drained 100 ETH before balance was updated."
  }'
echo -e "\n"

echo "✅ Tests complete!"
