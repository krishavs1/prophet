/**
 * Lightweight JSON-file audit index + local payload cache.
 * Index stores metadata for fast dashboard listing.
 * Full payloads are cached locally and also uploaded to 0G when available.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface AuditRecord {
  id: string;
  walletAddress: string;
  contractName: string;
  riskLevel: string;
  riskScore: number;
  status: 'uploaded' | 'pending' | 'failed';
  zgRootHash: string | null;
  zgTxHash: string | null;
  createdAt: number;
}

const DB_PATH = path.join(
  process.env.PROPHET_DATA_DIR || path.resolve(process.cwd(), '.prophet-data'),
  'audits.json'
);

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAll(): AuditRecord[] {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as AuditRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: AuditRecord[]) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

export function insertAudit(record: Omit<AuditRecord, 'id'>): AuditRecord {
  const all = readAll();
  const entry: AuditRecord = { id: crypto.randomUUID(), ...record };
  all.unshift(entry);
  writeAll(all);
  return entry;
}

export function listAudits(walletAddress?: string): AuditRecord[] {
  const all = readAll();
  if (!walletAddress) return all;
  const lower = walletAddress.toLowerCase();
  return all.filter((r) => r.walletAddress.toLowerCase() === lower);
}

export function getAudit(id: string): AuditRecord | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function updateAudit(id: string, patch: Partial<AuditRecord>): AuditRecord | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all);
  return all[idx];
}

export function deleteAudit(id: string): boolean {
  const all = readAll();
  const filtered = all.filter((r) => r.id !== id);
  if (filtered.length === all.length) return false;
  writeAll(filtered);
  deletePayloadLocally(id);
  return true;
}

// ── Local payload cache ──

const PAYLOADS_DIR = path.join(
  process.env.PROPHET_DATA_DIR || path.resolve(process.cwd(), '.prophet-data'),
  'payloads'
);

export function savePayloadLocally(id: string, payload: unknown): void {
  if (!fs.existsSync(PAYLOADS_DIR)) {
    fs.mkdirSync(PAYLOADS_DIR, { recursive: true });
  }
  fs.writeFileSync(
    path.join(PAYLOADS_DIR, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf-8'
  );
}

export function loadPayloadLocally(id: string): unknown | null {
  const filePath = path.join(PAYLOADS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function deletePayloadLocally(id: string): void {
  const filePath = path.join(PAYLOADS_DIR, `${id}.json`);
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}
