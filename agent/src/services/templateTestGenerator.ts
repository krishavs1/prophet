/**
 * Template-based Foundry test generator.
 *
 * Instead of asking the AI to produce raw Solidity (error-prone), we:
 *   1. Parse the source contract's interface (functions, params, payability)
 *   2. Ask the AI for a structured JSON "attack plan"
 *   3. Validate the plan against the real interface
 *   4. Assemble correct Solidity from templates
 *
 * This eliminates all structural / syntax issues that plague raw generation.
 */

import { call0GAI, is0GAvailable } from './0gService.js';
import type { ProphetReport } from '../types/report.js';

// ---------------------------------------------------------------------------
// 1. Interface parser
// ---------------------------------------------------------------------------

export interface Param {
  type: string;
  name: string;
}

export interface FunctionSig {
  name: string;
  params: Param[];
  mutability: 'pure' | 'view' | 'payable' | 'nonpayable';
  returns: string;
}

export interface ContractInterface {
  name: string;
  constructorParams: Param[];
  constructorPayable: boolean;
  functions: FunctionSig[];
}

function parseMutability(sig: string): FunctionSig['mutability'] {
  if (/\bpayable\b/.test(sig) && !/\bnonpayable\b/.test(sig) && !/\bview\b/.test(sig) && !/\bpure\b/.test(sig)) return 'payable';
  if (/\bview\b/.test(sig)) return 'view';
  if (/\bpure\b/.test(sig)) return 'pure';
  return 'nonpayable';
}

function parseParams(paramStr: string): Param[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(',').map((p, i) => {
    const parts = p.trim().split(/\s+/);
    if (parts.length >= 2) {
      const name = parts[parts.length - 1];
      const type = parts.slice(0, parts.length - 1).join(' ');
      return { type, name };
    }
    return { type: parts[0], name: `arg${i}` };
  });
}

function parseReturns(sig: string): string {
  const m = sig.match(/returns\s*\(([^)]*)\)/);
  return m ? m[1].trim() : '';
}

export function parseContractInterface(source: string): ContractInterface {
  const nameMatch = source.match(/\bcontract\s+(\w+)/);
  const name = nameMatch ? nameMatch[1] : 'Unknown';

  const ctorMatch = source.match(/constructor\s*\(([^)]*)\)[^{]*/);
  const constructorParams = ctorMatch ? parseParams(ctorMatch[1]) : [];
  const constructorPayable = ctorMatch ? /\bpayable\b/.test(ctorMatch[0]) : false;

  const functions: FunctionSig[] = [];
  const fnRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*([^{;]*)/g;
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(source)) !== null) {
    const qualifiers = m[3];
    if (/\bprivate\b/.test(qualifiers) || /\binternal\b/.test(qualifiers)) continue;
    functions.push({
      name: m[1],
      params: parseParams(m[2]),
      mutability: parseMutability(qualifiers),
      returns: parseReturns(qualifiers),
    });
  }

  // Public state variables generate automatic getters — parse them too
  const varRegex = /^\s+(\S+(?:\s*\([^)]*\))?(?:\s+\w+)*)\s+public\s+(\w+)\s*[;=]/gm;
  let vm: RegExpExecArray | null;
  while ((vm = varRegex.exec(source)) !== null) {
    const varName = vm[2];
    if (functions.some((f) => f.name === varName)) continue;
    const rawType = vm[1].trim();
    const isMapping = /^mapping\s*\(/.test(rawType);
    const params: Param[] = [];
    if (isMapping) {
      const keyMatch = rawType.match(/mapping\s*\(\s*(\S+)/);
      if (keyMatch) params.push({ type: keyMatch[1], name: 'key' });
    }
    functions.push({
      name: varName,
      params,
      mutability: 'view',
      returns: isMapping ? 'uint256' : rawType,
    });
  }

  return { name, constructorParams, constructorPayable, functions };
}

/** Human-readable summary of the interface for the AI prompt. */
export function interfaceToString(iface: ContractInterface): string {
  const lines: string[] = [];
  if (iface.constructorParams.length > 0) {
    const p = iface.constructorParams.map((x) => `${x.type} ${x.name}`).join(', ');
    lines.push(`  constructor(${p})${iface.constructorPayable ? ' payable' : ''}`);
  }
  for (const fn of iface.functions) {
    const p = fn.params.map((x) => `${x.type} ${x.name}`).join(', ');
    const ret = fn.returns ? ` returns (${fn.returns})` : '';
    lines.push(`  function ${fn.name}(${p}) ${fn.mutability}${ret}`);
  }
  return lines.length > 0 ? lines.join('\n') : '  (no public functions)';
}

// ---------------------------------------------------------------------------
// 2. JSON attack plan types
// ---------------------------------------------------------------------------

export interface CallStep {
  as: 'owner' | 'user' | 'thief' | 'attacker_contract';
  call: string;
  args?: string[];
  value?: string;
}

export interface Assertion {
  type: 'assertEq' | 'assertLt' | 'assertGt' | 'assertTrue';
  left: string;
  right?: string;
  message?: string;
}

export interface TestPlan {
  name: string;
  description?: string;
  setup: CallStep[];
  attack: CallStep[];
  assertions: Assertion[];
}

export interface AttackPlan {
  needsAttacker: boolean;
  attackerReentersFunction?: string;
  tests: TestPlan[];
}

// ---------------------------------------------------------------------------
// 3. AI prompt for JSON plan
// ---------------------------------------------------------------------------

const PLAN_EXAMPLE: AttackPlan = {
  needsAttacker: true,
  attackerReentersFunction: 'withdraw',
  tests: [
    {
      name: 'testReentrancyDrain',
      description: 'Exploit reentrancy in withdraw to drain funds',
      setup: [
        { as: 'user', call: 'deposit', value: '5 ether' },
      ],
      attack: [
        { as: 'attacker_contract', call: 'attack', value: '1 ether' },
      ],
      assertions: [
        { type: 'assertLt', left: 'address(target).balance', right: '5 ether', message: 'Reentrancy drained funds' },
      ],
    },
    {
      name: 'testAccessControl',
      description: 'Call owner-only function from non-owner',
      setup: [],
      attack: [
        { as: 'thief', call: 'setOwner', args: ['address(0xdead)'] },
      ],
      assertions: [
        { type: 'assertEq', left: 'target.owner()', right: 'address(0xdead)', message: 'Owner changed without auth' },
      ],
    },
  ],
};

function buildPlanPrompt(
  iface: ContractInterface,
  source: string,
  vulnSummary?: string,
  exploitSummary?: string,
): string {
  const ifaceStr = interfaceToString(iface);
  const findings = vulnSummary
    ? `\nAudit findings:\nVulnerabilities:\n${vulnSummary}\n\nExploit paths:\n${exploitSummary ?? 'None.'}\n`
    : '';

  return `Analyze this Solidity contract and return a JSON attack plan.

Contract "${iface.name}" interface:
${ifaceStr}

Full source:
\`\`\`solidity
${source.slice(0, 4000)}
\`\`\`
${findings}
Return a JSON object with this EXACT schema (no markdown, no explanation, ONLY the JSON):

{
  "needsAttacker": boolean,           // true if reentrancy attacker contract needed
  "attackerReentersFunction": string,  // function name the attacker re-enters (only if needsAttacker)
  "tests": [
    {
      "name": "testXxx",              // Foundry test function name (must start with "test")
      "description": "...",           // what this test proves
      "setup": [                      // steps to set up state before the attack
        { "as": "user"|"owner"|"thief"|"attacker_contract", "call": "<functionName>", "args": ["arg1"], "value": "5 ether" }
      ],
      "attack": [                     // the exploit steps
        { "as": "user"|"owner"|"thief"|"attacker_contract", "call": "<functionName>", "args": ["arg1"], "value": "1 ether" }
      ],
      "assertions": [
        { "type": "assertEq"|"assertLt"|"assertGt"|"assertTrue", "left": "<expr>", "right": "<expr>", "message": "..." }
      ]
    }
  ]
}

RULES:
- "call" MUST be a function from the interface above. Do NOT invent names.
- "args" are Solidity expressions for the function parameters. Omit if no params.
- "value" is only for payable functions. Omit for non-payable.
- "as" = who calls: "owner" (deployer), "user" (funded account), "thief" (unfunded), "attacker_contract" (reentrancy contract).
- Write 2-4 tests targeting different vulnerabilities.
- In assertions, ONLY use: "address(target).balance", "address(attacker).balance", or "target.<name>()" where <name> is one of the functions/getters listed in the interface above. Do NOT invent getter names.

EXAMPLE:
${JSON.stringify(PLAN_EXAMPLE, null, 2)}

Return ONLY the JSON. No markdown fences, no explanation.`;
}

const PLAN_SYSTEM_PROMPT = `You are a smart contract security researcher. Return ONLY valid JSON matching the requested schema. No markdown, no code fences, no explanation. Just the JSON object.`;

// ---------------------------------------------------------------------------
// 4. Plan validator
// ---------------------------------------------------------------------------

export function validatePlan(
  plan: AttackPlan,
  iface: ContractInterface,
): AttackPlan {
  const validFnNames = new Set(iface.functions.map((f) => f.name));
  const fnMap = new Map(iface.functions.map((f) => [f.name, f]));

  function validCall(step: CallStep): CallStep | null {
    if (step.as === 'attacker_contract' && step.call === 'attack') return step;
    if (!validFnNames.has(step.call)) return null;
    const fn = fnMap.get(step.call)!;
    if (step.value && fn.mutability !== 'payable') {
      return { ...step, value: undefined };
    }
    return step;
  }

  /** Check if an expression like "target.foo()" only references valid members. */
  function assertionExprValid(expr: string): boolean {
    const memberCalls = expr.matchAll(/target\.(\w+)\s*\(/g);
    for (const mc of memberCalls) {
      if (!validFnNames.has(mc[1])) return false;
    }
    return true;
  }

  function validAssertion(a: Assertion): boolean {
    return assertionExprValid(a.left) && (!a.right || assertionExprValid(a.right));
  }

  const tests = plan.tests
    .map((t) => ({
      ...t,
      name: t.name.startsWith('test') ? t.name : `test${t.name.charAt(0).toUpperCase()}${t.name.slice(1)}`,
      setup: t.setup.map(validCall).filter(Boolean) as CallStep[],
      attack: t.attack.map(validCall).filter(Boolean) as CallStep[],
      assertions: t.assertions.filter(validAssertion),
    }))
    .filter((t) => t.attack.length > 0 || t.setup.length > 0);

  if (plan.attackerReentersFunction && !validFnNames.has(plan.attackerReentersFunction)) {
    plan.needsAttacker = false;
    plan.attackerReentersFunction = undefined;
  }

  return { ...plan, tests };
}

// ---------------------------------------------------------------------------
// 5. Template code generator
// ---------------------------------------------------------------------------

function generateCallCode(
  step: CallStep,
  iface: ContractInterface,
): string {
  const fn = iface.functions.find((f) => f.name === step.call);
  const argsStr = step.args?.join(', ') ?? '';
  const valueStr = step.value ? `{value: ${step.value}}` : '';

  if (step.as === 'attacker_contract') {
    if (step.call === 'attack') {
      return `        attacker.attack${valueStr}();`;
    }
    return `        attacker.attackCustom${valueStr}();`;
  }

  const caller = step.as === 'owner' ? 'owner' : step.as === 'thief' ? 'thief' : 'user';
  const prank = `        vm.prank(${caller});`;

  if (fn) {
    return `${prank}\n        target.${step.call}${valueStr}(${argsStr});`;
  }
  return `${prank}\n        target.${step.call}${valueStr}(${argsStr});`;
}

function generateAssertionCode(a: Assertion): string {
  const msg = a.message ? `, "${a.message}"` : '';
  switch (a.type) {
    case 'assertTrue':
      return `        assertTrue(${a.left}${msg});`;
    case 'assertEq':
      return `        assertEq(${a.left}, ${a.right}${msg});`;
    case 'assertLt':
      return `        assertLt(${a.left}, ${a.right}${msg});`;
    case 'assertGt':
      return `        assertGt(${a.left}, ${a.right}${msg});`;
    default:
      return `        assertTrue(${a.left}${msg});`;
  }
}

function generateAttackerContract(
  iface: ContractInterface,
  reentersFunction: string,
): string {
  const fn = iface.functions.find((f) => f.name === reentersFunction);
  const callArgs = fn?.params.map((p) => {
    if (p.type.startsWith('uint')) return '1 ether';
    if (p.type === 'address') return 'address(this)';
    if (p.type === 'bool') return 'true';
    return '0';
  }).join(', ') ?? '';
  const valueSnippet = fn?.mutability === 'payable' ? '{value: 1 ether}' : '';

  const hasDeposit = iface.functions.find((f) => f.name === 'deposit' && f.mutability === 'payable');
  const depositLine = hasDeposit ? `\n        target.deposit{value: msg.value}();` : '';

  return `contract Attacker {
    ${iface.name} public immutable target;
    uint256 public count;

    constructor(address payable _target) {
        target = ${iface.name}(payable(_target));
    }

    function attack() external payable {${depositLine}
        target.${reentersFunction}${valueSnippet}(${callArgs});
    }

    receive() external payable {
        if (count < 5 && address(target).balance >= 1 ether) {
            count++;
            target.${reentersFunction}${valueSnippet}(${callArgs});
        }
    }

    fallback() external payable {}
}`;
}

function generateSetUp(iface: ContractInterface, needsAttacker: boolean): string {
  const ctorArgs = iface.constructorParams.map((p) => {
    if (p.type === 'address' || p.type === 'address payable') return 'owner';
    if (p.type.startsWith('uint')) return '1000';
    if (p.type === 'string memory') return '"test"';
    if (p.type === 'bool') return 'true';
    if (p.type.startsWith('bytes')) return '""';
    return '0';
  }).join(', ');

  const valueStr = iface.constructorPayable ? '{value: 1 ether}' : '';

  let code = `    function setUp() public {
        vm.deal(owner, 100 ether);
        vm.deal(user, 100 ether);
        vm.deal(thief, 100 ether);
        vm.prank(owner);
        target = new ${iface.name}${valueStr}(${ctorArgs});`;

  if (needsAttacker) {
    code += `\n        attacker = new Attacker(payable(address(target)));
        vm.deal(address(attacker), 10 ether);`;
  }
  code += '\n    }';
  return code;
}

function generateTestFunction(test: TestPlan, iface: ContractInterface): string {
  const lines: string[] = [];
  lines.push(`    function ${test.name}() public {`);
  if (test.description) {
    lines.push(`        // ${test.description}`);
  }
  for (const s of test.setup) {
    lines.push(generateCallCode(s, iface));
  }
  if (test.setup.length > 0 && test.attack.length > 0) {
    lines.push('');
  }
  for (const s of test.attack) {
    lines.push(generateCallCode(s, iface));
  }
  if (test.attack.length > 0 && test.assertions.length > 0) {
    lines.push('');
  }
  for (const a of test.assertions) {
    lines.push(generateAssertionCode(a));
  }
  lines.push('    }');
  return lines.join('\n');
}

export function generateSolidityFromPlan(
  plan: AttackPlan,
  iface: ContractInterface,
): string {
  const parts: string[] = [];

  parts.push(`// SPDX-License-Identifier: MIT`);
  parts.push(`pragma solidity ^0.8.20;`);
  parts.push('');
  parts.push(`import "forge-std/Test.sol";`);
  parts.push(`import "../src/${iface.name}.sol";`);
  parts.push('');

  if (plan.needsAttacker && plan.attackerReentersFunction) {
    parts.push(generateAttackerContract(iface, plan.attackerReentersFunction));
    parts.push('');
  }

  parts.push(`contract ${iface.name}Test is Test {`);
  parts.push(`    ${iface.name} public target;`);
  if (plan.needsAttacker && plan.attackerReentersFunction) {
    parts.push(`    Attacker public attacker;`);
  }
  parts.push(`    address public owner = address(0x1);`);
  parts.push(`    address public user = address(0x2);`);
  parts.push(`    address public thief = address(0x3);`);
  parts.push('');
  parts.push(generateSetUp(iface, plan.needsAttacker && !!plan.attackerReentersFunction));
  parts.push('');

  for (const test of plan.tests) {
    parts.push(generateTestFunction(test, iface));
    parts.push('');
  }

  parts.push('}');

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 6. Public API: generate test via template path
// ---------------------------------------------------------------------------

function extractJsonFromResponse(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
}

export async function generateTestFromTemplate(
  contractSource: string,
  report?: ProphetReport,
): Promise<string | null> {
  if (!is0GAvailable()) return null;

  const iface = parseContractInterface(contractSource);
  if (iface.functions.length === 0) return null;

  let vulnSummary: string | undefined;
  let exploitSummary: string | undefined;
  if (report) {
    vulnSummary = report.vulnerabilities
      .map((v) => `- [${v.severity}] ${v.title}: ${v.explanation}`)
      .join('\n') || undefined;
    exploitSummary = report.exploit_paths
      .map((ep) => `- ${ep.name}: ${ep.success_criteria}`)
      .join('\n') || undefined;
  }

  const prompt = buildPlanPrompt(iface, contractSource, vulnSummary, exploitSummary);

  try {
    const raw = await call0GAI(prompt, PLAN_SYSTEM_PROMPT);
    console.log('[TemplateGen] Raw AI plan response length:', raw.length);

    const jsonStr = extractJsonFromResponse(raw);
    const plan: AttackPlan = JSON.parse(jsonStr);

    if (!plan.tests || !Array.isArray(plan.tests) || plan.tests.length === 0) {
      console.warn('[TemplateGen] AI returned plan with no tests');
      return null;
    }

    const validated = validatePlan(plan, iface);
    if (validated.tests.length === 0) {
      console.warn('[TemplateGen] All tests removed by validation');
      return null;
    }

    const code = generateSolidityFromPlan(validated, iface);
    console.log(`[TemplateGen] Generated ${validated.tests.length} tests from template`);
    return code;
  } catch (e) {
    console.error('[TemplateGen] Failed:', (e as Error).message);
    return null;
  }
}
