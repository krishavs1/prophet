/**
 * HTTP server: expose analyzer to frontend.
 * POST /analyze { "source": "contract Solidity..." } -> ProphetReport
 * POST /simulate { "source": "...", "contractName": "...", "vulnerabilities": [...] } -> streams output
 */
import http from 'node:http';
import { analyze } from './analyzer.js';
import { simulateContract } from './services/simulationService.js';
import type { Vulnerability } from './types/report.js';

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

  if (req.method === 'POST' && path === '/simulate') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { source, contractName, vulnerabilities } = JSON.parse(body) as {
        source?: string;
        contractName?: string;
        vulnerabilities?: Vulnerability[];
      };
      if (typeof source !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid "source" string' }));
        return;
      }

      // Set up SSE headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Stream simulation output
      const result = await simulateContract(
        source,
        contractName || 'Contract',
        vulnerabilities || [],
        (chunk, isError) => {
          // Send chunk as SSE event
          const eventType = isError ? 'error' : 'output';
          res.write(`event: ${eventType}\n`);
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      );

      // Send final result
      res.write(`event: result\n`);
      res.write(`data: ${JSON.stringify(result)}\n\n`);
      res.end();
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
  console.log(`[agent] POST /analyze with { "source": "..." } to get a report. GET /health for health check.`);
});
