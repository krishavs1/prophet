/**
 * Attack Generator: Uses 0G AI to generate Foundry invariant tests.
 * Phase 2: Prompt engineers the AI to write exploitative Foundry tests.
 */
import { call0GAI, is0GAvailable } from './0gService.js';

const ATTACK_SYSTEM_PROMPT = `You are an elite white-hat smart contract security researcher. Your task is to analyze Solidity contracts and write Foundry invariant tests designed to break their core accounting logic.

You must return ONLY valid Solidity code for a Foundry test contract. The test should:
1. Define invariants that should always hold (e.g., "total assets == total shares")
2. Use Foundry's invariant testing framework (invariant_test, invariant_include, etc.)
3. Attempt to break the contract's accounting through fuzzing
4. Be compilable and executable with \`forge test --invariant\`

Return ONLY the Solidity code, no markdown, no explanations, no code fences. Start directly with "// SPDX-License-Identifier: MIT" or "pragma solidity".`;

/**
 * Generate a Foundry invariant test contract to attack the given Solidity code.
 * @param contractSource - The Solidity contract source code to attack
 * @returns Foundry test contract source code
 */
export async function generateAttack(contractSource: string): Promise<string> {
  const prompt = `Analyze this Solidity contract and write a complete Foundry Invariant Test designed to break its core accounting logic:

\`\`\`solidity
${contractSource}
\`\`\`

Write a Foundry test contract (e.g., Vault.t.sol) that:
- Defines invariants that should hold
- Uses Foundry's invariant testing framework
- Attempts to break the contract through fuzzing
- Is ready to compile and run with \`forge test --invariant\`

Return ONLY the Solidity test code, no markdown formatting.`;

  if (!is0GAvailable()) {
    // Fallback mock for development
    return generateMockAttackTest(contractSource);
  }

  try {
    const testCode = await call0GAI(prompt, ATTACK_SYSTEM_PROMPT);
    return extractSolidityCode(testCode);
  } catch (e) {
    console.error('[AttackGenerator] Failed to generate attack:', e);
    // Fallback to mock
    return generateMockAttackTest(contractSource);
  }
}

/**
 * Extract Solidity code from AI response (removes markdown, code fences, etc.)
 */
function extractSolidityCode(response: string): string {
  // Remove markdown code fences
  let code = response.replace(/```solidity?\n?/g, '').replace(/```\n?/g, '');
  
  // Remove leading/trailing whitespace
  code = code.trim();
  
  // If it starts with "pragma" or "// SPDX", it's likely valid Solidity
  if (code.startsWith('pragma') || code.startsWith('// SPDX')) {
    return code;
  }
  
  // Try to find Solidity code block
  const match = code.match(/(pragma solidity[\s\S]*)/);
  if (match) {
    return match[1].trim();
  }
  
  return code;
}

/**
 * Generate a mock Foundry test for development (when 0G unavailable).
 */
function generateMockAttackTest(contractSource: string): string {
  // Extract contract name from source
  const contractMatch = contractSource.match(/contract\s+(\w+)/);
  const contractName = contractMatch ? contractMatch[1] : 'Target';
  
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/${contractName}.sol";

contract ${contractName}InvariantTest is Test {
    ${contractName} public target;
    
    function setUp() public {
        target = new ${contractName}();
    }
    
    // Invariant: Total assets should equal total shares
    // This is a placeholder - replace with actual invariants for your contract
    function invariant_totalAssetsEqualsShares() public view {
        // TODO: Implement invariant checks based on contract logic
        // Example: assertEq(target.totalAssets(), target.totalShares());
    }
    
    // Fuzzing test to break the invariant
    function testFuzz_breakInvariant(uint256 amount) public {
        // TODO: Add fuzzing logic to attempt breaking the contract
    }
}`;
}
