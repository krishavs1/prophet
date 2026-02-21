/**
 * Compile Solidity source to bytecode + ABI for deployment.
 * Uses the same Docker Foundry sandbox as simulation; no test file needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';

const DOCKER_IMAGE = process.env.FORGE_DOCKER_IMAGE || 'prophet-forge';
const TIMEOUT_MS = Number(process.env.FORGE_TIMEOUT_MS) || 120_000;

function useDockerSandbox(): boolean {
  const val = process.env.USE_DOCKER_SANDBOX;
  if (val === undefined) return true;
  return val !== '0' && val.toLowerCase() !== 'false';
}

function getForgeCommand(): string {
  if (process.env.FORGE_PATH) return process.env.FORGE_PATH;
  const candidates = [
    path.join(os.homedir(), '.foundry', 'bin', 'forge'),
    '/opt/render/.foundry/bin/forge',
    '/root/.foundry/bin/forge',
    '/home/render/.foundry/bin/forge',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'forge';
}

function installLocalDeps(tmpDir: string, source: string): void {
  const forgeCmd = getForgeCommand();
  execSync(`git init`, { cwd: tmpDir, stdio: 'pipe' });
  execSync(`${forgeCmd} install foundry-rs/forge-std --no-git`, { cwd: tmpDir, stdio: 'pipe', timeout: TIMEOUT_MS });
  if (source.includes('@openzeppelin')) {
    execSync(`${forgeCmd} install OpenZeppelin/openzeppelin-contracts --no-git`, { cwd: tmpDir, stdio: 'pipe', timeout: TIMEOUT_MS });
    const tomlPath = path.join(tmpDir, 'foundry.toml');
    let toml = fs.readFileSync(tomlPath, 'utf-8');
    toml = toml.replace(
      'remappings = ["forge-std/=lib/forge-std/src/"]',
      'remappings = ["forge-std/=lib/forge-std/src/", "@openzeppelin/=lib/openzeppelin-contracts/"]'
    );
    fs.writeFileSync(tomlPath, toml);
  }
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

/**
 * Fix invalid calldata assembly for Solidity 0.8+ (Error 1397).
 * Replaces direct calldata access (add(data, 0x20), mload(data)) with
 * calldatacopy + call using data.offset and data.length.
 */
function fixCalldataAssembly(source: string): string {
  return source.replace(
    /(\s*)let result := call\(gas\(\), target, 0, add\(data, 0x20\), mload\(data\), 0, 0\)/g,
    (_, indent) =>
      `${indent}calldatacopy(0, data.offset, data.length)\n${indent}let result := call(gas(), target, 0, 0, data.length, 0, 0)`
  );
}

const BRACE_ONLY = /^\s*}\s*$/;

/**
 * Fix Error 7858 (modifier at file level): often caused by an extra `}` that closed
 * the contract before the modifier. Removes one of two consecutive brace-only lines
 * before the modifier line so the modifier stays inside the contract.
 */
function fixModifierOutsideContract(source: string, modifierLineNum: number): string {
  const lines = source.split('\n');
  const before = lines.slice(0, Math.min(modifierLineNum, lines.length));
  for (let i = before.length - 2; i >= 0; i--) {
    if (BRACE_ONLY.test(before[i]!) && BRACE_ONLY.test(before[i + 1]!)) {
      const fixed = [...before];
      fixed.splice(i + 1, 1);
      return fixed.concat(lines.slice(before.length)).join('\n');
    }
  }
  return source;
}

/** Extract line number from Solidity error line like "  --> src/X.sol:95:1:" or ":95:1". */
function parseErrorLineNum(output: string): number | null {
  const m = output.match(/:(\d+):\d+:\s*$/m) || output.match(/\b(\d+):\d+:/);
  return m ? parseInt(m[1]!, 10) : null;
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
    let cleaned = fixCalldataAssembly(cleanSource(source));
    fs.writeFileSync(path.join(srcDir, filename), cleaned);

    let exitCode: number;
    let output: string;

    const runBuild = async (src: string) => {
      fs.writeFileSync(path.join(srcDir, filename), src);
      if (useDockerSandbox()) {
        return runCommand(
          'docker',
          dockerArgs(tmpDir, 'forge build --names'),
          tmpDir,
          TIMEOUT_MS
        );
      }
      const forgeCmd = getForgeCommand();
      installLocalDeps(tmpDir, src);
      return runCommand(forgeCmd, ['build', '--names'], tmpDir, TIMEOUT_MS);
    };

    ({ exitCode, output } = await runBuild(cleaned));

    // Retry once on Error 7858 (modifier outside contract) by removing a duplicate }
    if (exitCode !== 0 && output.includes('7858') && output.includes('modifier')) {
      const lineNum = parseErrorLineNum(output);
      if (lineNum != null) {
        cleaned = fixModifierOutsideContract(cleaned, lineNum);
        const retry = await runBuild(cleaned);
        if (retry.exitCode === 0) {
          ({ exitCode, output } = retry);
        }
      }
    }

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
