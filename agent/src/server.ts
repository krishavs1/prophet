/**
 * HTTP server: expose analyzer to frontend.
 * POST /analyze { "source": "..." } -> ProphetReport
 * POST /generate-attack { "source": "...", "report"?: ProphetReport } -> { testCode }
 * POST /simulate { "source": "...", "testCode": "...", "contractName"?: string } -> SSE stream
 * POST /generate-patch { "originalCode": "...", "crashTrace": "..." } -> Patched code
 */
import http from 'node:http';
import type { ProphetReport } from './types/report.js';
import { analyze } from './analyzer.js';
import { generateAttack, generateAttackFromReport } from './services/attackGenerator.js';
import { generatePatch, generateFixFromReport } from './services/patchGenerator.js';
import { runFoundryTests } from './services/simulationService.js';
import { compileSource } from './services/compileService.js';
import { get0GAccountBalance } from './services/0gService.js';
import { uploadAuditData, downloadAuditData, is0GStorageAvailable } from './services/0gStorageService.js';
import { insertAudit, listAudits, getAudit, updateAudit, deleteAudit, savePayloadLocally, loadPayloadLocally } from './db.js';
import type { AuditPayload } from './services/0gStorageService.js';

const PORT = Number(process.env.PORT) || 3001;

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const fullUrl = req.url ?? '';
  const path = fullUrl.split('?')[0];
  const queryStr = fullUrl.split('?')[1] ?? '';
  const query = Object.fromEntries(new URLSearchParams(queryStr));
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'prophet-agent' }));
    return;
  }

  if (req.method === 'GET' && path === '/account') {
    try {
      const balance = await get0GAccountBalance();
      if (balance === null) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: '0G not configured or unavailable. Set PRIVATE_KEY_DEPLOYER and ensure broker is initialized.' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(balance));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && path === '/analyze') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const parsed = JSON.parse(body) as { source?: string; premium?: boolean };
      const { source, premium } = parsed;
      if (typeof source !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "source" string' }));
        return;
      }
      const report = await analyze(source, { premium });
      res.writeHead(200);
      res.end(JSON.stringify(report));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && path === '/generate-attack') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const parsed = JSON.parse(body) as { source?: string; report?: ProphetReport };
      const { source, report } = parsed;
      if (typeof source !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "source" string' }));
        return;
      }
      const testCode =
        report && report.contract_name
          ? await generateAttackFromReport(source, report)
          : await generateAttack(source);
      res.writeHead(200);
      res.end(JSON.stringify({ testCode }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && path === '/simulate') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let streamStarted = false;
    try {
      const parsed = JSON.parse(body) as {
        source?: string;
        testCode?: string;
        contractName?: string;
      };
      const { source, testCode, contractName } = parsed;
      if (typeof source !== 'string' || typeof testCode !== 'string') {
        res.writeHead(400);
        res.end(
          JSON.stringify({ error: 'Missing or invalid "source" or "testCode" string' })
        );
        return;
      }
      const name =
        contractName && contractName.length > 0
          ? contractName
          : (source.match(/contract\s+(\w+)/)?.[1] ?? 'Contract');
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      streamStarted = true;
      for await (const msg of runFoundryTests({
        source,
        testCode,
        contractName: name,
      })) {
        try {
          res.write(`data: ${JSON.stringify(msg)}\n`);
        } catch (writeErr) {
          // Client likely disconnected; stop streaming
          break;
        }
      }
    } catch (e) {
      if (streamStarted) {
        try {
          res.write(`data: ${JSON.stringify({ chunk: `[prophet] Error: ${(e as Error).message}\n`, done: true })}\n`);
        } catch {
          // ignore
        }
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(e) }));
        return;
      }
    } finally {
      if (streamStarted && !res.writableEnded) {
        res.end();
      }
    }
    return;
  }

  if (req.method === 'POST' && path === '/generate-fix') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const parsed = JSON.parse(body) as { source?: string; report?: Partial<ProphetReport>; simulationTrace?: string };
      const { source, report, simulationTrace } = parsed;
      if (typeof source !== 'string' || !report) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "source" or "report"' }));
        return;
      }
      const contractName = report.contract_name ?? source.match(/contract\s+(\w+)/)?.[1] ?? 'Contract';
      const fullReport: ProphetReport = {
        contract_name: contractName,
        source_hash: report.source_hash ?? '',
        risk_score: report.risk_score ?? 0,
        risk_level: report.risk_level ?? 'low',
        summary: report.summary ?? '',
        vulnerabilities: report.vulnerabilities ?? [],
        exploit_paths: report.exploit_paths ?? [],
        fix_suggestions: report.fix_suggestions ?? [],
        meta: report.meta ?? { generated_at: '', generator: '', inference_backend: 'local', version: '' },
      };
      const patchedCode = await generateFixFromReport(source, fullReport, simulationTrace);
      res.writeHead(200);
      res.end(JSON.stringify({ patchedCode }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && path === '/compile') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const parsed = JSON.parse(body) as { source?: string; contractName?: string };
      const { source, contractName } = parsed;
      if (typeof source !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "source" string' }));
        return;
      }
      const result = await compileSource(source, contractName);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String((e as Error).message) }));
    }
    return;
  }

  if (req.method === 'POST' && path === '/generate-patch') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { originalCode, crashTrace } = JSON.parse(body) as {
        originalCode?: string;
        crashTrace?: string;
      };
      if (typeof originalCode !== 'string' || typeof crashTrace !== 'string') {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            error: 'Missing or invalid "originalCode" or "crashTrace" strings',
          })
        );
        return;
      }
      const patchedCode = await generatePatch(originalCode, crashTrace);
      res.writeHead(200);
      res.end(JSON.stringify({ patchedCode }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // ── Audit persistence (0G Storage) ──

  if (req.method === 'POST' && path === '/audit/save') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const parsed = JSON.parse(body) as {
        walletAddress?: string;
        contractSource?: string;
        contractName?: string;
        report?: ProphetReport;
        testCode?: string;
        simulationLogs?: AuditPayload['simulationLogs'];
        patchedCode?: string;
        deploymentTx?: string;
      };
      const { walletAddress, contractSource, contractName, report, testCode, simulationLogs, patchedCode, deploymentTx } = parsed;
      if (!walletAddress || !contractSource || !report) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'walletAddress, contractSource, and report are required' }));
        return;
      }

      const payload: AuditPayload = {
        contractSource,
        contractName: contractName ?? report.contract_name ?? 'Contract',
        report,
        testCode,
        simulationLogs,
        patchedCode,
        deploymentTx,
        timestamp: Date.now(),
      };

      let zgResult: { rootHash: string; txHash: string } | null = null;
      try {
        zgResult = await uploadAuditData(payload);
      } catch (e) {
        console.warn('[audit/save] 0G upload failed, saving index anyway:', (e as Error).message);
      }

      const record = insertAudit({
        walletAddress,
        contractName: payload.contractName,
        riskLevel: report.risk_level ?? 'low',
        riskScore: report.risk_score ?? 0,
        status: zgResult ? 'uploaded' : 'pending',
        zgRootHash: zgResult?.rootHash ?? null,
        zgTxHash: zgResult?.txHash ?? null,
        createdAt: payload.timestamp,
      });

      savePayloadLocally(record.id, payload);

      res.writeHead(200);
      res.end(JSON.stringify({
        id: record.id,
        rootHash: record.zgRootHash,
        txHash: record.zgTxHash,
        status: record.status,
      }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String((e as Error).message) }));
    }
    return;
  }

  if (req.method === 'GET' && path === '/audits') {
    try {
      const wallet = query.wallet;
      const records = listAudits(wallet);
      res.writeHead(200);
      res.end(JSON.stringify({ audits: records }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String((e as Error).message) }));
    }
    return;
  }

  const auditMatch = path.match(/^\/audit\/([^/]+)$/);

  if (req.method === 'DELETE' && auditMatch) {
    try {
      const id = auditMatch[1];
      const deleted = deleteAudit(id);
      if (!deleted) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Audit not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String((e as Error).message) }));
    }
    return;
  }

  const retryMatch = path.match(/^\/audit\/([^/]+)\/retry$/);
  if (req.method === 'POST' && retryMatch) {
    try {
      const id = retryMatch[1];
      const record = getAudit(id);
      if (!record) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Audit not found' }));
        return;
      }
      if (record.zgRootHash) {
        res.writeHead(200);
        res.end(JSON.stringify({ id, rootHash: record.zgRootHash, status: 'uploaded' }));
        return;
      }
      const payload = loadPayloadLocally(id) as AuditPayload | null;
      if (!payload) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'No local payload to upload' }));
        return;
      }
      const zgResult = await uploadAuditData(payload);
      updateAudit(id, {
        zgRootHash: zgResult.rootHash,
        zgTxHash: zgResult.txHash,
        status: 'uploaded',
      });
      res.writeHead(200);
      res.end(JSON.stringify({ id, rootHash: zgResult.rootHash, txHash: zgResult.txHash, status: 'uploaded' }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String((e as Error).message) }));
    }
    return;
  }

  if (req.method === 'GET' && auditMatch) {
    try {
      const id = auditMatch[1];
      const record = getAudit(id);
      if (!record) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Audit not found' }));
        return;
      }

      let payload: AuditPayload | null = null;

      if (record.zgRootHash) {
        try {
          payload = await downloadAuditData(record.zgRootHash);
        } catch (e) {
          console.warn(`[audit/:id] 0G download failed, trying local cache:`, (e as Error).message);
        }
      }

      if (!payload) {
        payload = loadPayloadLocally(id) as AuditPayload | null;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ record, payload }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String((e as Error).message) }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[agent] Prophet analyzer listening on http://localhost:${PORT}`);
  console.log(`[agent] Endpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /account - 0G balance (main + inference sub-accounts)`);
  console.log(`  POST /analyze - Analyze contract (returns ProphetReport)`);
  console.log(`  POST /generate-attack - Generate Foundry test (optional report for targeted attacks)`);
  console.log(`  POST /simulate - Run Foundry tests, stream output`);
  console.log(`  POST /generate-fix - Generate patched contract from analysis report`);
  console.log(`  POST /generate-patch - Generate patched contract from crash trace`);
  console.log(`  POST /compile - Compile contract to bytecode + ABI for deployment`);
  console.log(`  POST /audit/save - Save audit to 0G Storage + local index`);
  console.log(`  GET  /audits?wallet=0x... - List audit history`);
  console.log(`  GET  /audit/:id - Fetch full audit from 0G Storage`);
  console.log(`[agent] 0G Storage: ${is0GStorageAvailable() ? 'configured' : 'not configured (set PRIVATE_KEY_DEPLOYER)'}`);
});
