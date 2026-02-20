/**
 * HTTP server: expose analyzer to frontend.
 * POST /analyze { "source": "contract Solidity..." } -> ProphetReport
 * POST /generate-attack { "source": "contract..." } -> Foundry test code
 * POST /generate-patch { "originalCode": "...", "crashTrace": "..." } -> Patched code
 */
import http from 'node:http';
import { analyze } from './analyzer.js';
import { generateAttack } from './services/attackGenerator.js';
import { generatePatch } from './services/patchGenerator.js';

const PORT = Number(process.env.PORT) || 3001;

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = (req.url ?? '').split('?')[0];
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'prophet-agent' }));
    return;
  }

  if (req.method === 'POST' && path === '/analyze') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { source } = JSON.parse(body) as { source?: string };
      if (typeof source !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "source" string' }));
        return;
      }
      const report = await analyze(source);
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
      const { source } = JSON.parse(body) as { source?: string };
      if (typeof source !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "source" string' }));
        return;
      }
      const testCode = await generateAttack(source);
      res.writeHead(200);
      res.end(JSON.stringify({ testCode }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
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

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[agent] Prophet analyzer listening on http://localhost:${PORT}`);
  console.log(`[agent] Endpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  POST /analyze - Analyze contract (returns ProphetReport)`);
  console.log(`  POST /generate-attack - Generate Foundry invariant test`);
  console.log(`  POST /generate-patch - Generate patched contract from crash trace`);
});
