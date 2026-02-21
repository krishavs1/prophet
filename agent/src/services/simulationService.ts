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

function getContractFileFromTestImport(testCode: string): string | null {
  const match = testCode.match(/["']\.\.\/src\/([^"']+\.sol)["']/);
  return match ? match[1] : null;
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

function ensureClosingBraceBeforeSecondContract(code: string): string {
  const secondContractRegex = /\n\s*\bcontract\s+\w+/g;
  const first = secondContractRegex.exec(code);
  const second = secondContractRegex.exec(code);
  if (!first || !second) return code;
  const idx = second.index;
  const before = code.slice(0, idx);
  const open = (before.match(/{/g) ?? []).length;
  const close = (before.match(/}/g) ?? []).length;
  if (open <= close) return code;
  const missing = open - close;
  return code.slice(0, idx) + '}\n'.repeat(missing) + code.slice(idx);
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
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(testDir, { recursive: true });

  fs.writeFileSync(path.join(tmpDir, 'foundry.toml'), FOUNDRY_TOML);

  const contractFile =
    getContractFileFromTestImport(testCode) ?? `${contractName}.sol`;
  fs.writeFileSync(path.join(srcDir, contractFile), source);

  let normalizedTest = ensureForgeStdTestImport(testCode);
  normalizedTest = ensureClosingBraceBeforeSecondContract(normalizedTest);
  fs.writeFileSync(
    path.join(testDir, `${contractName}.t.sol`),
    normalizedTest
  );

  return { contractFile };
}

// ---------------------------------------------------------------------------
// Docker-sandboxed execution
// ---------------------------------------------------------------------------

async function* runDockerFoundry(
  tmpDir: string
): AsyncGenerator<StreamChunk, void, undefined> {
  yield { chunk: `[prophet] Running in Docker sandbox (${DOCKER_IMAGE})...\n` };

  const args = [
    'run',
    '--rm',
    '--network', 'none',
    '--memory', '512m',
    '--cpus', '1',
    '--tmpfs', '/tmp:size=100m',
    '-v', `${path.join(tmpDir, 'src')}:/project/src:ro`,
    '-v', `${path.join(tmpDir, 'test')}:/project/test:ro`,
    '-v', `${path.join(tmpDir, 'foundry.toml')}:/project/foundry.toml:ro`,
    DOCKER_IMAGE,
    'forge build && forge test -vvv',
  ];

  for await (const msg of runCommand('docker', args, tmpDir, TIMEOUT_MS)) {
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
      yield* runDockerFoundry(tmpDir);
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
