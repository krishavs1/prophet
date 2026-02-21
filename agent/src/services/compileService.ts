/**
 * Compile Solidity source to bytecode + ABI for deployment.
 * Uses the same Docker Foundry sandbox as simulation; no test file needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const DOCKER_IMAGE = process.env.FORGE_DOCKER_IMAGE || 'prophet-forge';
const TIMEOUT_MS = Number(process.env.FORGE_TIMEOUT_MS) || 120_000;

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

export interface CompileResult {
  bytecode: string;
  abi: unknown[];
  contractName: string;
}

function getContractName(source: string): string {
  const m = source.match(/\bcontract\s+(\w+)/);
  return m ? m[1] : 'Contract';
}

function getSourceFilename(source: string): string {
  const name = getContractName(source);
  return `${name}.sol`;
}

/** Strip ../src/ imports so we don't need other files. */
function cleanSource(source: string): string {
  return source.replace(
    /import\s+["']\.\.\/src\/[^"']+\.sol["']\s*;\s*\n?/g,
    ''
  );
}

function dockerArgs(tmpDir: string, cmd: string): string[] {
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  return [
    'run', '--rm',
    '--network', 'none',
    '--memory', '512m',
    '--cpus', '1',
    '--tmpfs', '/tmp:size=100m',
    '-v', `${path.join(tmpDir, 'src')}:/project/src:ro`,
    '-v', `${path.join(tmpDir, 'foundry.toml')}:/project/foundry.toml:ro`,
    '-v', `${outDir}:/project/out`,
    DOCKER_IMAGE,
    cmd,
  ];
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: false });
    let output = '';
    const timer = timeoutMs
      ? setTimeout(() => {
          proc.kill('SIGKILL');
        }, timeoutMs)
      : undefined;

    proc.stdout?.on('data', (d) => { output += d.toString(); });
    proc.stderr?.on('data', (d) => { output += d.toString(); });
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ output, exitCode: code ?? -1 });
    });
  });
}

/**
 * Walk the out/ directory and find all *.json artifacts (skipping build-info).
 * Returns an array of { contractName, filePath }.
 */
function findArtifacts(outDir: string): Array<{ contractName: string; filePath: string }> {
  const results: Array<{ contractName: string; filePath: string }> = [];
  if (!fs.existsSync(outDir)) return results;
  for (const solDir of fs.readdirSync(outDir)) {
    if (solDir === 'build-info') continue;
    const full = path.join(outDir, solDir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const jsonFile of fs.readdirSync(full).filter((f) => f.endsWith('.json'))) {
      results.push({
        contractName: jsonFile.replace(/\.json$/, ''),
        filePath: path.join(full, jsonFile),
      });
    }
  }
  return results;
}

/**
 * Compile a single Solidity source to bytecode and ABI.
 * Writes a temp Foundry project, runs forge build in Docker, reads the artifact.
 */
export async function compileSource(
  source: string,
  contractNameOverride?: string
): Promise<CompileResult> {
  const tmpDir = path.join(
    os.tmpdir(),
    `prophet-compile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const srcDir = path.join(tmpDir, 'src');

  try {
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'foundry.toml'), FOUNDRY_TOML);

    const filename = getSourceFilename(source);
    const cleaned = cleanSource(source);
    fs.writeFileSync(path.join(srcDir, filename), cleaned);

    const { exitCode, output } = await runCommand(
      'docker',
      dockerArgs(tmpDir, 'forge build --names'),
      tmpDir,
      TIMEOUT_MS
    );

    if (exitCode !== 0) {
      throw new Error(`Compilation failed:\n${output.slice(-2000)}`);
    }

    const outDir = path.join(tmpDir, 'out');
    const artifacts = findArtifacts(outDir);
    console.log(`[compile] Found ${artifacts.length} artifacts: ${artifacts.map((a) => a.contractName).join(', ')}`);

    if (artifacts.length === 0) {
      throw new Error(`No artifacts found after build. Output:\n${output.slice(-500)}`);
    }

    // Try to match: exact override name, then actual source contract name, then first non-Test artifact
    const preferredName = contractNameOverride ?? getContractName(source);
    let chosen =
      artifacts.find((a) => a.contractName === preferredName) ??
      artifacts.find((a) => a.contractName === getContractName(source)) ??
      artifacts.find((a) => !a.contractName.endsWith('Test') && a.contractName !== 'Script') ??
      artifacts[0];

    console.log(`[compile] Using artifact: ${chosen.contractName} (requested: ${preferredName})`);

    const artifact = JSON.parse(fs.readFileSync(chosen.filePath, 'utf-8'));
    const bytecode =
      typeof artifact.bytecode?.object === 'string'
        ? artifact.bytecode.object
        : typeof artifact.bytecode === 'string'
          ? artifact.bytecode
          : (artifact.deployedBytecode?.object ?? artifact.deployedBytecode);
    const abi = Array.isArray(artifact.abi) ? artifact.abi : [];

    if (!bytecode || typeof bytecode !== 'string') {
      throw new Error('No bytecode in artifact');
    }

    const hex = bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`;
    return { bytecode: hex, abi, contractName: chosen.contractName };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
