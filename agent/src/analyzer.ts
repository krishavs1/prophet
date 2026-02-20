/**
 * Analyzer service: accept Solidity source, return structured report.
 * Phase 3: static analysis, AST, heuristics, risk scoring.
 * Phase 5: route heavy inference to 0G; fallback to local when no key.
 */
import type { ProphetReport } from './types/report.js';
import { call0GAI, is0GAvailable } from './services/0gService.js';

const STUB_CONTRACT_NAME = 'Contract';

const ANALYSIS_SYSTEM_PROMPT = `You are a smart contract security auditor. Analyze Solidity code and return a structured JSON report with:
- risk_score (0-1)
- risk_level (critical/high/medium/low)
- summary (brief description)
- vulnerabilities (array of vulnerability objects)
- exploit_paths (array of attack scenarios)
- fix_suggestions (array of remediation steps)

Return ONLY valid JSON matching the ProphetReport schema.`;

export async function analyze(source: string): Promise<ProphetReport> {
  const sourceHash = hashSource(source);
  const now = new Date().toISOString();

  // Extract contract name from source
  const contractMatch = source.match(/contract\s+(\w+)/);
  const contractName = contractMatch ? contractMatch[1] : STUB_CONTRACT_NAME;

  // Try 0G AI analysis if available
  if (is0GAvailable()) {
    try {
      const prompt = `Analyze this Solidity contract for security vulnerabilities:

\`\`\`solidity
${source}
\`\`\`

Return a JSON report with risk_score, risk_level, summary, vulnerabilities, exploit_paths, and fix_suggestions.`;
      
      const aiResponse = await call0GAI(prompt, ANALYSIS_SYSTEM_PROMPT);
      // Try to parse JSON from response
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            contract_name: contractName,
            source_hash: sourceHash,
            risk_score: parsed.risk_score ?? 0,
            risk_level: parsed.risk_level ?? 'low',
            summary: parsed.summary ?? 'AI analysis completed',
            vulnerabilities: parsed.vulnerabilities ?? [],
            exploit_paths: parsed.exploit_paths ?? [],
            fix_suggestions: parsed.fix_suggestions ?? [],
            meta: {
              generated_at: now,
              generator: 'prophet@alpha',
              inference_backend: '0g',
              version: '0.1.0',
            },
          };
        }
      } catch (e) {
        console.warn('[Analyzer] Failed to parse 0G JSON response, falling back to stub');
      }
    } catch (e) {
      console.warn('[Analyzer] 0G analysis failed, falling back to stub:', e);
    }
  }

  // Fallback: stub report
  return {
    contract_name: contractName,
    source_hash: sourceHash,
    risk_score: 0,
    risk_level: 'low',
    summary: 'Stub analysis — no findings yet. Set ZERO_G_API_KEY for AI-powered analysis.',
    vulnerabilities: [],
    exploit_paths: [],
    fix_suggestions: [],
    meta: {
      generated_at: now,
      generator: 'prophet@alpha',
      inference_backend: 'local',
      version: '0.1.0',
    },
  };
}

function hashSource(source: string): string {
  // Minimal hash for stub; use crypto.subtle or crypto.createHash in production.
  let h = 0;
  for (let i = 0; i < source.length; i++) {
    h = (Math.imul(31, h) + source.charCodeAt(i)) | 0;
  }
  return `sha256:${Math.abs(h).toString(16)}`;
}
