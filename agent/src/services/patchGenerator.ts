/**
 * Patch Generator: Uses 0G AI to generate Solidity patches from crash traces.
 * Phase 2: Reads Foundry execution traces and generates fixes.
 */
import { call0GAI, is0GAvailable } from './0gService.js';

const PATCH_SYSTEM_PROMPT = `You are a smart contract remediation expert. Your task is to read Solidity code and Foundry execution crash traces, then generate exact patched Solidity code that fixes the vulnerability exposed in the trace.

You must return ONLY valid Solidity code - the complete patched contract. The patch should:
1. Fix the specific vulnerability shown in the crash trace
2. Maintain the contract's intended functionality
3. Follow security best practices (checks-effects-interactions, reentrancy guards, etc.)
4. Be compilable and ready to deploy

Return ONLY the Solidity code, no markdown, no explanations, no code fences. Start directly with "// SPDX-License-Identifier: MIT" or "pragma solidity".`;

/**
 * Generate a patched version of the contract based on crash trace evidence.
 * @param originalCode - The original Solidity contract source
 * @param crashTrace - Foundry execution trace showing the vulnerability
 * @returns Patched Solidity contract source code
 */
export async function generatePatch(
  originalCode: string,
  crashTrace: string
): Promise<string> {
  const prompt = `You are a remediation agent. Read the provided original Solidity code and this Foundry execution crash trace where the contract was successfully hacked. Write the exact patched Solidity code to fix the vulnerability exposed in the trace.

**Original Contract:**
\`\`\`solidity
${originalCode}
\`\`\`

**Crash Trace (Foundry Execution Log):**
\`\`\`
${crashTrace}
\`\`\`

Analyze the crash trace to identify:
1. What invariant was broken
2. What transaction sequence caused the break
3. What specific vulnerability exists (reentrancy, overflow, access control, etc.)

Then write the complete patched Solidity contract that fixes this vulnerability while maintaining all intended functionality.

Return ONLY the patched Solidity code, no markdown formatting.`;

  if (!is0GAvailable()) {
    // Fallback mock for development
    return generateMockPatch(originalCode, crashTrace);
  }

  try {
    const patchedCode = await call0GAI(prompt, PATCH_SYSTEM_PROMPT);
    return extractSolidityCode(patchedCode);
  } catch (e) {
    console.error('[PatchGenerator] Failed to generate patch:', e);
    // Fallback to mock
    return generateMockPatch(originalCode, crashTrace);
  }
}

/**
 * Extract Solidity code from AI response.
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
 * Generate a mock patch for development (when 0G unavailable).
 */
function generateMockPatch(originalCode: string, crashTrace: string): string {
  // Simple mock: add a comment indicating patch needed
  // In real implementation, this would analyze the trace and apply fixes
  return `${originalCode}

// [MOCK PATCH] This is a placeholder patch generated without 0G.
// Real implementation would:
// 1. Analyze crash trace: ${crashTrace.substring(0, 100)}...
// 2. Identify vulnerability
// 3. Apply security fixes (reentrancy guards, checks-effects-interactions, etc.)
// 4. Return complete patched contract`;
}
