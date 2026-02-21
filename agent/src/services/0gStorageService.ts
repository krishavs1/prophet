/**
 * 0G Decentralized Storage service.
 * Uploads/downloads audit payloads (JSON) to the 0G Storage Network.
 */
import { ethers } from 'ethers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProphetReport } from '../types/report.js';

export interface AuditPayload {
  contractSource: string;
  contractName: string;
  report: ProphetReport;
  testCode?: string;
  simulationLogs?: Array<{ text: string; type: string; timestamp: number }>;
  patchedCode?: string;
  deploymentTx?: string;
  timestamp: number;
}

const rawKey = process.env.PRIVATE_KEY_DEPLOYER;
const PRIVATE_KEY = rawKey?.startsWith('0x') ? rawKey : rawKey ? `0x${rawKey}` : undefined;
const RPC_URL =
  process.env['0G_RPC_URL'] ||
  process.env.RPC_URL_SEPOLIA ||
  'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC =
  process.env.ZG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';

let zgSdk: typeof import('@0glabs/0g-ts-sdk') | null = null;

async function loadSdk() {
  if (!zgSdk) {
    try {
      zgSdk = await import('@0glabs/0g-ts-sdk');
    } catch (e) {
      console.error('[0G-Storage] Failed to import @0glabs/0g-ts-sdk:', e);
      return null;
    }
  }
  return zgSdk;
}

function getSigner(): ethers.Wallet | null {
  if (!PRIVATE_KEY || PRIVATE_KEY === '0x...' || PRIVATE_KEY === '') return null;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Wallet(PRIVATE_KEY, provider);
}

/**
 * Upload audit data as JSON to 0G decentralized storage.
 * Returns { rootHash, txHash } on success, or null if 0G storage is unavailable.
 */
export async function uploadAuditData(
  data: AuditPayload
): Promise<{ rootHash: string; txHash: string } | null> {
  const sdk = await loadSdk();
  if (!sdk) {
    console.warn('[0G-Storage] SDK unavailable, skipping upload');
    return null;
  }

  const signer = getSigner();
  if (!signer) {
    console.warn('[0G-Storage] No signer configured, skipping upload');
    return null;
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `prophet-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
  );

  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');

    const file = await sdk.ZgFile.fromFilePath(tmpFile);
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr !== null) {
      throw new Error(`Merkle tree generation failed: ${treeErr}`);
    }

    const rootHash = tree?.rootHash() ?? '';
    console.log(`[0G-Storage] Uploading audit (rootHash: ${rootHash})...`);

    const indexer = new sdk.Indexer(INDEXER_RPC);

    const [tx, uploadErr] = await (indexer as any).upload(file, RPC_URL, signer);
    if (uploadErr !== null) {
      throw new Error(`Upload failed: ${uploadErr}`);
    }

    await file.close();
    console.log(`[0G-Storage] Upload complete. TX: ${JSON.stringify(tx)}`);

    const txHash = typeof tx === 'string' ? tx : (tx as any)?.txHash ?? (tx as any)?.hash ?? '';
    return { rootHash, txHash: String(txHash) };
  } catch (e) {
    console.error('[0G-Storage] Upload error:', e);
    throw e;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
  }
}

/**
 * Download audit data from 0G storage by root hash.
 * Returns the parsed AuditPayload, or null if unavailable.
 */
export async function downloadAuditData(
  rootHash: string
): Promise<AuditPayload | null> {
  const sdk = await loadSdk();
  if (!sdk) {
    console.warn('[0G-Storage] SDK unavailable, skipping download');
    return null;
  }

  const outputPath = path.join(
    os.tmpdir(),
    `prophet-audit-dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
  );

  try {
    const indexer = new sdk.Indexer(INDEXER_RPC);
    const err = await indexer.download(rootHash, outputPath, true);
    if (err !== null) {
      throw new Error(`Download failed: ${err}`);
    }

    const content = fs.readFileSync(outputPath, 'utf-8');
    return JSON.parse(content) as AuditPayload;
  } catch (e) {
    console.error('[0G-Storage] Download error:', e);
    return null;
  } finally {
    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
  }
}

/**
 * Check if 0G storage is configured (has key + SDK).
 */
export function is0GStorageAvailable(): boolean {
  return (
    PRIVATE_KEY !== undefined &&
    PRIVATE_KEY !== '0x...' &&
    PRIVATE_KEY !== ''
  );
}
