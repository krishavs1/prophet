/**
 * Runs Foundry tests in a Docker sandbox (or falls back to local forge).
 *
 * Docker mode (default):
 *   - Each run launches a short-lived container from the "prophet-forge" image
 *   - No network, limited CPU/memory, read-only filesystem, 120s timeout
 *   - forge-std is pre-cached in the image; no download per run
 *
 * Fallback mode (USE_DOCKER_SANDBOX=false):
 *   - Runs forge directly on the host (for local dev without Docker)
 *   - ffi is still disabled in foundry.toml
 */
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { call0GAI, is0GAvailable } from './0gService.js';

const DOCKER_IMAGE = process.env.FORGE_DOCKER_IMAGE || 'prophet-forge';
const TIMEOUT_MS = Number(process.env.FORGE_TIMEOUT_MS) || 120_000;

function useDockerSandbox(): boolean {
  const val = process.env.USE_DOCKER_SANDBOX;
  if (val === undefined) return true;
  return val !== '0' && val.toLowerCase() !== 'false';
}

function getForgeCommand(): string {
  if (process.env.FORGE_PATH) return process.env.FORGE_PATH;
  const home = os.homedir();
  const defaultPath = path.join(home, '.foundry', 'bin', 'forge');
  if (home && fs.existsSync(defaultPath)) return defaultPath;
  return 'forge';
}

const FOUNDRY_TOML = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.28"
evm_version = "cancun"
ffi = false
remappings = ["forge-std/=lib/forge-std/src/"]

[fmt]
line_length = 100
`;

export interface SimulateOptions {
  source: string;
  testCode: string;
  contractName: string;
}

export interface StreamChunk {
  chunk: string;
  done?: boolean;
  exitCode?: number;
  error?: string;
}

/**
 * Spawn a process and yield each line of stdout/stderr, then a final
 * chunk with done=true and exitCode. Kills the process after timeoutMs.
 */
async function* runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs?: number
): AsyncGenerator<StreamChunk, void, undefined> {
  const queue: StreamChunk[] = [];
  let resolveWait: (() => void) | null = null;
  const waitNext = (): Promise<void> =>
    new Promise((r) => {
      resolveWait = r;
    });

  const push = (chunk: StreamChunk) => {
    queue.push(chunk);
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  };

  const proc: ChildProcess = spawn(cmd, args, { cwd, shell: false });

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs && timeoutMs > 0) {
    timer = setTimeout(() => {
      push({
        chunk: `[prophet] Timeout after ${timeoutMs / 1000}s — killing process\n`,
        done: true,
        exitCode: -1,
        error: 'timeout',
      });
      proc.kill('SIGKILL');
    }, timeoutMs);
  }

  let buffer = '';
  const flush = (str: string) => {
    buffer += str;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      push({ chunk: line + '\n' });
    }
  };
  proc.stdout?.on('data', (d) => flush(d.toString()));
  proc.stderr?.on('data', (d) => flush(d.toString()));
  proc.on('error', (err) => {
    if (timer) clearTimeout(timer);
    push({
      chunk: `[prophet] Failed to run ${cmd}: ${err.message}\n`,
      done: true,
      exitCode: -1,
      error: err.message,
    });
  });
  proc.on('close', (code) => {
    if (timer) clearTimeout(timer);
    if (buffer.length) push({ chunk: buffer + '\n' });
    push({ chunk: '\n', done: true, exitCode: code ?? -1 });
  });

  for (;;) {
    if (queue.length === 0) await waitNext();
    const next = queue.shift();
    if (!next) continue;
    yield next;
    if (next.done) break;
  }
}

// ---------------------------------------------------------------------------
// Solidity source normalization helpers
// ---------------------------------------------------------------------------

/**
 * Determine the .sol filename for the source contract by inspecting the
 * source code's own `contract Foo` declaration, then falling back to
 * whatever the test code imports from ../src/.
 */
function resolveSourceFilename(
  source: string,
  testCode: string,
  contractName: string
): string {
  const srcMatch = source.match(/\bcontract\s+(\w+)/);
  if (srcMatch) return `${srcMatch[1]}.sol`;

  const testImport = testCode.match(/["']\.\.\/src\/([^"']+\.sol)["']/);
  if (testImport) return testImport[1];

  return `${contractName}.sol`;
}

/** Collect every `../src/X.sol` filename imported by the code. */
function getAllSrcImports(code: string): string[] {
  const re = /["']\.\.\/src\/([^"']+\.sol)["']/g;
  const files = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) files.add(m[1]);
  return [...files];
}

/** Rewrite `../src/X.sol` → `./X.sol` (for files that live inside src/). */
function fixRelativeSrcImports(code: string): string {
  return code.replace(
    /(import\s+)(["'])\.\.\/src\//g,
    '$1$2./'
  );
}


function ensureForgeStdTestImport(testCode: string): string {
  const usesTest = /\b(is|:)\s+Test\b/.test(testCode);
  const hasImport = /import\s+["']forge-std\/Test\.sol["']/.test(testCode);
  if (!usesTest || hasImport) return testCode;
  const hasPragma = /pragma\s+solidity/.test(testCode);
  const insert = hasPragma
    ? 'import "forge-std/Test.sol";\n'
    : '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.28;\nimport "forge-std/Test.sol";\n';
  return insert + testCode;
}

/**
 * Fix common Solidity issues the AI generates:
 *  1. constructor(address _x) → constructor(address payable _x)
 *     Prevents "Explicit type conversion not allowed from non-payable address"
 *  2. Add receive() if contract has fallback() payable but no receive()
 */
function fixCommonSolidityIssues(code: string): string {
  let f = code;

  // constructor(address _x) → constructor(address payable _x)
  f = f.replace(/constructor\(\s*address\s+(_\w+)/g, 'constructor(address payable $1');
  f = f.replace(/,\s*address\s+(_\w+)\s*\)/g, ', address payable $1)');

  // "function receive()" → remove from interfaces, fix keyword in contracts
  f = f.replace(/function\s+receive\(\)\s+external\s+payable\s*;/g, '');
  f = f.replace(/function\s+(receive\(\)\s+external\s+payable)/g, '$1');
  f = f.replace(/function\s+(fallback\(\)\s+external\s+payable)/g, '$1');

  // Deduplicate consecutive receive() bodies
  f = f.replace(
    /(receive\(\)\s+external\s+payable\s*\{[^}]*\}\s*\n\s*)(receive\(\)\s+external\s+payable\s*\{[^}]*\})/g,
    '$1'
  );

  // makeAddr() is only available inside Test contracts — replace with
  // a portable equivalent that works everywhere
  f = f.replace(
    /makeAddr\(\s*"([^"]+)"\s*\)/g,
    'address(uint160(uint256(keccak256(abi.encodePacked("$1")))))'
  );

  return f;
}

/** Ensure the file's overall brace count is balanced. Trim trailing extras. */
function balanceBraces(code: string): string {
  const open = (code.match(/{/g) ?? []).length;
  const close = (code.match(/}/g) ?? []).length;
  if (close > open) {
    // Remove excess closing braces from the end
    let trimmed = code;
    for (let i = 0; i < close - open; i++) {
      trimmed = trimmed.replace(/\}\s*$/, '');
    }
    return trimmed;
  }
  if (open > close) {
    // Add missing closing braces at the end
    return code + '\n' + '}\n'.repeat(open - close);
  }
  return code;
}

// ---------------------------------------------------------------------------
// Write the temp project files (shared by both Docker and local paths)
// ---------------------------------------------------------------------------

function writeTempProject(
  tmpDir: string,
  source: string,
  testCode: string,
  contractName: string
): { contractFile: string } {
  const srcDir = path.join(tmpDir, 'src');
  const testDir = path.join(tmpDir, 'test');
  const scriptDir = path.join(tmpDir, 'script');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(scriptDir, { recursive: true });

  fs.writeFileSync(path.join(tmpDir, 'foundry.toml'), FOUNDRY_TOML);

  // --- source file ---
  const contractFile = resolveSourceFilename(source, testCode, contractName);
  // Strip ../src/ imports from the source: they reference other src/ files
  // we don't have as separate files.  If the referenced contract is defined
  // in this same source, the import is redundant.  Rewriting to ./ would
  // create circular proxy deps, so just remove them.
  const cleanedSource = source.replace(
    /import\s+["']\.\.\/src\/[^"']+\.sol["']\s*;\s*\n?/g,
    ''
  );
  fs.writeFileSync(path.join(srcDir, contractFile), cleanedSource);
  console.log(`[writeTempProject] source → src/${contractFile}`);

  // --- test file ---
  // Step 1: strip ALL ../src/ imports (they may point to wrong files or
  //         cause "already declared" when the test redefines a source contract)
  let normalizedTest = testCode.replace(
    /import\s+["']\.\.\/src\/[^"']+\.sol["']\s*;\s*\n?/g,
    ''
  );
  console.log(`[writeTempProject] stripped ../src/ imports from test`);

  // Step 2: check if adding the source import would cause a duplicate
  const sourceContracts = new Set(
    [...source.matchAll(/\bcontract\s+(\w+)/g)].map((m) => m[1])
  );
  const testContracts = new Set(
    [...normalizedTest.matchAll(/\bcontract\s+(\w+)/g)].map((m) => m[1])
  );
  const hasConflict = [...sourceContracts].some((c) => testContracts.has(c));

  if (!hasConflict) {
    // Safe to import — no duplicate declarations
    const pragmaEnd = normalizedTest.indexOf(';');
    if (pragmaEnd !== -1) {
      normalizedTest =
        normalizedTest.slice(0, pragmaEnd + 1) +
        `\nimport "../src/${contractFile}";\n` +
        normalizedTest.slice(pragmaEnd + 1);
    }
    console.log(`[writeTempProject] added import ../src/${contractFile} to test`);
  } else {
    console.log(
      `[writeTempProject] skipped source import (conflict: ${[...sourceContracts].filter((c) => testContracts.has(c))})`
    );
  }

  normalizedTest = ensureForgeStdTestImport(normalizedTest);
  normalizedTest = fixCommonSolidityIssues(normalizedTest);
  normalizedTest = balanceBraces(normalizedTest);

  fs.writeFileSync(
    path.join(testDir, `${contractName}.t.sol`),
    normalizedTest
  );

  return { contractFile };
}

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

function dockerArgs(tmpDir: string, cmd: string): string[] {
  return [
    'run', '--rm',
    '--network', 'none',
    '--memory', '512m',
    '--cpus', '1',
    '--tmpfs', '/tmp:size=100m',
    '-v', `${path.join(tmpDir, 'src')}:/project/src:ro`,
    '-v', `${path.join(tmpDir, 'test')}:/project/test:ro`,
    '-v', `${path.join(tmpDir, 'script')}:/project/script:ro`,
    '-v', `${path.join(tmpDir, 'foundry.toml')}:/project/foundry.toml:ro`,
    DOCKER_IMAGE,
    cmd,
  ];
}

/** Run a Docker command and collect ALL output (non-streaming). */
async function collectOutput(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs?: number
): Promise<{ output: string; exitCode: number }> {
  let output = '';
  let exitCode = -1;
  for await (const msg of runCommand(cmd, args, cwd, timeoutMs)) {
    output += msg.chunk;
    if (msg.done) exitCode = msg.exitCode ?? -1;
  }
  return { output, exitCode };
}

/** Ask the AI to fix Solidity compiler errors in the test code. */
async function aiFixTestCode(
  testCode: string,
  compilerErrors: string,
  sourceCode: string
): Promise<string | null> {
  if (!is0GAvailable()) return null;
  // Extract function signatures so the AI knows what's actually callable
  const sigLines = sourceCode.split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(function|event|modifier|constructor|receive|fallback)\b/.test(l))
    .map((l) => '  ' + l.replace(/\{.*$/, '').trim())
    .join('\n') || '  (none found)';

  const prompt = `Fix the Solidity compiler errors in this Foundry test file.

COMPILER ERRORS:
${compilerErrors.slice(0, 2000)}

SOURCE CONTRACT FUNCTIONS (use ONLY these — do NOT call functions that don't exist):
${sigLines}

SOURCE CONTRACT (read-only, in src/):
\`\`\`solidity
${sourceCode.slice(0, 3000)}
\`\`\`

TEST FILE (fix this):
\`\`\`solidity
${testCode}
\`\`\`

Return ONLY the fixed Solidity test file. No markdown, no explanations. Start with "// SPDX-License-Identifier: MIT".`;

  try {
    const fixed = await call0GAI(prompt,
      `You are a Solidity compiler error fixer. Return ONLY valid Solidity code. No markdown fences. No explanations.
Key rules:
- Use "address payable" for constructor params cast to contracts.
- receive() and fallback() have NO "function" keyword.
- makeAddr() only works inside contracts extending Test — outside use address(0x1) etc.
- Do NOT use inline assembly. Do NOT shadow state variables with parameter names.
- "Member X not found" means you're calling a function on the WRONG contract. Check the SOURCE CONTRACT FUNCTIONS list — those belong to the TARGET contract instance, not the attacker.
- ONLY call functions that appear in the SOURCE CONTRACT FUNCTIONS list. Do NOT invent function names.`
    );
    let code = fixed.replace(/```solidity?\n?/g, '').replace(/```\n?/g, '').trim();
    if (code.includes('pragma solidity') || code.includes('// SPDX')) return code;
    const m = code.match(/(\/\/\s*SPDX[\s\S]*)/);
    return m ? m[1].trim() : null;
  } catch (e) {
    console.error('[aiFixTestCode] AI fix failed:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Docker-sandboxed execution (with build-check-fix loop)
// ---------------------------------------------------------------------------

const MAX_FIX_ATTEMPTS = 3;

async function* runDockerFoundry(
  tmpDir: string,
  source: string,
  contractName: string
): AsyncGenerator<StreamChunk, void, undefined> {
  yield { chunk: `[prophet] Running in Docker sandbox (${DOCKER_IMAGE})...\n` };

  for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    // Try forge build first
    const buildResult = await collectOutput(
      'docker',
      dockerArgs(tmpDir, 'forge build'),
      tmpDir,
      TIMEOUT_MS
    );

    if (buildResult.exitCode === 0) {
      // Build succeeded — run tests
      yield { chunk: `[prophet] Build OK, running tests...\n` };
      for await (const msg of runCommand(
        'docker',
        dockerArgs(tmpDir, 'forge test -vvv'),
        tmpDir,
        TIMEOUT_MS
      )) {
        yield msg;
      }
      return;
    }

    // Build failed
    if (attempt < MAX_FIX_ATTEMPTS) {
      yield { chunk: `[prophet] Build failed (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS + 1}), asking AI to fix...\n` };

      const testFile = fs.readdirSync(path.join(tmpDir, 'test')).find((f) => f.endsWith('.sol'));
      if (!testFile) break;
      const testPath = path.join(tmpDir, 'test', testFile);
      const currentTest = fs.readFileSync(testPath, 'utf-8');

      const fixedTest = await aiFixTestCode(currentTest, buildResult.output, source);
      if (!fixedTest) {
        yield { chunk: `[prophet] AI fix unavailable, showing original errors.\n` };
        break;
      }

      // Apply the same normalizations to the AI-fixed code
      let processed = fixedTest.replace(
        /import\s+["']\.\.\/src\/[^"']+\.sol["']\s*;\s*\n?/g, ''
      );
      const srcContracts = new Set(
        [...source.matchAll(/\bcontract\s+(\w+)/g)].map((m) => m[1])
      );
      const fixedContracts = new Set(
        [...processed.matchAll(/\bcontract\s+(\w+)/g)].map((m) => m[1])
      );
      const contractFile = resolveSourceFilename(source, '', contractName);
      if (![...srcContracts].some((c) => fixedContracts.has(c))) {
        const pe = processed.indexOf(';');
        if (pe !== -1) {
          processed = processed.slice(0, pe + 1) +
            `\nimport "../src/${contractFile}";\n` +
            processed.slice(pe + 1);
        }
      }
      processed = fixCommonSolidityIssues(processed);
      processed = ensureForgeStdTestImport(processed);
      processed = balanceBraces(processed);
      fs.writeFileSync(testPath, processed);
      console.log(`[runDockerFoundry] rewrote test after AI fix (attempt ${attempt + 1})`);
      continue;
    }

    // All retries exhausted — show the build errors
    yield { chunk: buildResult.output };
    yield { chunk: '\n', done: true, exitCode: buildResult.exitCode };
    return;
  }

  // Fallback: run build+test to show whatever errors remain
  for await (const msg of runCommand(
    'docker',
    dockerArgs(tmpDir, 'forge build && forge test -vvv'),
    tmpDir,
    TIMEOUT_MS
  )) {
    yield msg;
  }
}

// ---------------------------------------------------------------------------
// Local (unsandboxed) fallback execution
// ---------------------------------------------------------------------------

async function* runLocalFoundry(
  tmpDir: string
): AsyncGenerator<StreamChunk, void, undefined> {
  yield { chunk: `[prophet] Running locally (no Docker sandbox)...\n` };
  yield { chunk: `[prophet] Installing forge-std...\n` };

  for await (const msg of runCommand('git', ['init'], tmpDir)) {
    yield msg;
  }

  const forgeCmd = getForgeCommand();
  for await (const msg of runCommand(
    forgeCmd,
    ['install', 'foundry-rs/forge-std', '--no-git'],
    tmpDir,
    TIMEOUT_MS
  )) {
    yield msg;
    if (msg.done && msg.exitCode !== 0) {
      yield {
        chunk: `[prophet] forge install failed (exit ${msg.exitCode}). Is Foundry installed and git available?\n`,
        done: true,
        exitCode: msg.exitCode,
      };
      return;
    }
  }

  yield { chunk: `[prophet] Running forge build...\n` };
  for await (const msg of runCommand(forgeCmd, ['build'], tmpDir, TIMEOUT_MS)) {
    yield msg;
    if (msg.done && msg.exitCode !== 0) {
      yield {
        chunk: `[prophet] forge build failed (exit ${msg.exitCode})\n`,
        done: true,
        exitCode: msg.exitCode,
      };
      return;
    }
  }

  yield { chunk: `[prophet] Running forge test...\n` };
  for await (const msg of runCommand(forgeCmd, ['test', '-vvv'], tmpDir, TIMEOUT_MS)) {
    yield msg;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function* runFoundryTests(
  options: SimulateOptions
): AsyncGenerator<StreamChunk, void, undefined> {
  const { source, testCode, contractName } = options;
  const tmpDir = path.join(
    os.tmpdir(),
    `prophet-foundry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );

  try {
    writeTempProject(tmpDir, source, testCode, contractName);
    yield { chunk: `[prophet] Temp project: ${tmpDir}\n` };

    if (useDockerSandbox()) {
      yield* runDockerFoundry(tmpDir, source, contractName);
    } else {
      yield* runLocalFoundry(tmpDir);
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
