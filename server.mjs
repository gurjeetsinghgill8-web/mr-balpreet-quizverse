/**
 * QUIZVERSE — SERVER
 * ---------------------------------------------------------------------------
 * One process serves three things:
 *   1. the static app            (Implementation Path A — no build step)
 *   2. /api/*  REST API          (Path B — teacher accounts, quizzes, results)
 *   3. /api/ai/chat              (provider proxy so keys stay server-side)
 *
 * Exported as a factory so tests can boot a real server on a random port:
 *   const { server, url } = await createServer({ store: createMemoryStore() });
 *   node server.mjs            → http://127.0.0.1:4317
 */

import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

import { chat, PROVIDERS, friendlyMessage } from './packages/ai-service/provider.js';
import { mockChat } from './packages/ai-service/mock-provider.js';
import { createStore } from './server/storage.js';
import { createApi } from './server/api.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_AI_BODY = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
};

/**
 * Only these top-level directories are ever served to a browser. Everything else
 * (server code, tests, tools, .data with teacher records, .env) is unreachable —
 * a self-hosted school deployment must not leak its own source or its database.
 */
const PUBLIC_DIRS = new Set(['app', 'packages']);

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = path.normalize(decoded).replace(/^([/\\])+/, '');
  const first = clean.split(/[/\\]/)[0];
  if (!PUBLIC_DIRS.has(first)) return null; // allowlist, not a blocklist
  const full = path.join(root, clean);
  if (!full.startsWith(root)) return null; // path traversal guard
  return full;
}

/* ------------------------------------------------------------------ */
/* AI proxy helpers                                                    */
/* ------------------------------------------------------------------ */

function serverKeyFor(provider) {
  const specific = process.env[`QV_${String(provider || '').toUpperCase()}_KEY`];
  return specific || process.env.QV_AI_KEY || '';
}

function serverProvider() {
  return process.env.QV_AI_PROVIDER || (process.env.QV_AI_KEY ? 'openai' : 'mock');
}

function readJsonBody(req, limit = MAX_AI_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

/* ------------------------------------------------------------------ */
/* factory                                                             */
/* ------------------------------------------------------------------ */

/**
 * @param {object} [options]
 * @param {object} [options.store]  storage adapter (defaults to file storage)
 * @param {string} [options.secret] HMAC secret for teacher tokens
 * @param {string} [options.root]   directory to serve static files from
 */
export async function createServer({ store, secret, root = ROOT } = {}) {
  const dataDir = process.env.QV_DATA_DIR || path.join(ROOT, '.data');
  const chosenStore = store || await createStore({
    kind: process.env.QV_STORAGE || 'file',
    dir: dataDir,
    connectionString: process.env.QV_DATABASE_URL,
  });

  const apiSecret = secret || process.env.QV_API_SECRET || randomBytes(32).toString('hex');
  if (!secret && !process.env.QV_API_SECRET) {
    console.warn('[quizverse] QV_API_SECRET is not set — teacher tokens will be invalidated on restart.');
  }
  const api = createApi({ store: chosenStore, secret: apiSecret });

  const server = http.createServer(async (req, res) => {
    try {
      const requestPath = req.url.split('?')[0];

      /* ---------------- AI provider proxy ---------------- */
      if (requestPath === '/api/ai/status') {
        sendJson(res, 200, {
          ok: true,
          providers: Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, needsKey: p.needsKey, defaultModel: p.defaultModel || null })),
          serverProvider: serverProvider(),
          serverKeyConfigured: Boolean(process.env.QV_AI_KEY || process.env.QV_OPENAI_KEY || process.env.QV_ANTHROPIC_KEY || process.env.QV_GEMINI_KEY),
          serverBaseUrl: process.env.QV_AI_BASE_URL || null,
        });
        return;
      }

      if (requestPath === '/api/ai/chat' && req.method === 'POST') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: { code: 'bad_json', message: 'Malformed AI request.' } });
          return;
        }

        const provider = String(body.provider || serverProvider());
        const apiKey = String(body.apiKey || serverKeyFor(provider) || '');
        const baseUrl = body.baseUrl || process.env.QV_AI_BASE_URL || undefined;
        const model = body.model || process.env.QV_AI_MODEL || undefined;

        try {
          if (provider === 'mock') {
            const text = await mockChat({ ...body, delay_ms: body.delay_ms ?? 260 });
            sendJson(res, 200, { ok: true, text, model: 'mock-provider', usage: null, transport: 'mock' });
            return;
          }
          const result = await chat({
            provider,
            model,
            baseUrl,
            apiKey,
            messages: body.messages,
            temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
            maxTokens: body.maxTokens,
            timeoutMs: Math.min(120000, Number(body.timeout_ms) || 60000),
          });
          sendJson(res, 200, { ok: true, text: result.text, model: result.model, usage: result.usage, ms: result.ms, transport: 'proxy' });
        } catch (err) {
          const code = err && err.code ? err.code : 'http_error';
          sendJson(res, 200, {
            ok: false,
            error: {
              code,
              message: err && err.message ? err.message : friendlyMessage(code),
              detail: { status: (err && err.meta && err.meta.status) || null, provider },
            },
          });
        }
        return;
      }

      /* ---------------- REST API ---------------- */
      if (requestPath.startsWith('/api/')) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const handled = await api.handle(req, res, url);
        if (handled) return;
      }

      /* ---------------- static app ---------------- */
      if (requestPath === '/' || requestPath === '/index.html') {
        res.writeHead(302, { Location: '/app/' });
        res.end();
        return;
      }

      const filePath = safeJoin(root, req.url === '/' ? '/app/index.html' : req.url);
      if (!filePath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      let info = await stat(filePath).catch(() => null);
      let target = filePath;
      if (info && info.isDirectory()) {
        target = path.join(filePath, 'index.html');
        info = await stat(target).catch(() => null);
      }
      if (!info) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1 style="font-family:sans-serif">404 — not found</h1><p><a href="/">QUIZVERSE home</a></p>');
        return;
      }

      const body = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
      });
      res.end(body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Server error: ${err.message}`);
      }
    }
  });

  return {
    server,
    store: chosenStore,
    api,
    /** Start listening; returns the resolved base url. */
    async listen(port = 0, host = '127.0.0.1') {
      await new Promise((resolve) => server.listen(port, host, resolve));
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await chosenStore.close();
    },
  };
}

/* ------------------------------------------------------------------ */
/* direct run                                                          */
/* ------------------------------------------------------------------ */

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const LAN = process.argv.includes('--lan');
  const PORT = Number(process.env.PORT || 4317);
  const HOST = LAN ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');
  const dataDir = process.env.QV_DATA_DIR || path.join(ROOT, '.data');
  await mkdir(dataDir, { recursive: true });

  const app = await createServer({});
  const url = await app.listen(PORT, HOST);
  console.log(`QUIZVERSE running → ${url}/`);
  console.log(`Serving ${ROOT}`);
  console.log(`Storage: ${app.store.kind}${app.store.dir ? ` (${app.store.dir})` : ''}`);
  console.log(`AI provider: ${serverProvider()}${serverKeyFor(serverProvider()) ? ' (server key detected)' : ''} · proxy /api/ai/chat · mock provider available`);
  console.log('REST API: /api/health · /api/auth/* · /api/quizzes · /api/materials · /api/sessions · /api/results · /api/analytics');

  if (LAN) {
    const addresses = Object.values(networkInterfaces()).flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i.address);
    console.log('\nClassroom mode — open these on the phones, tablets and projector:');
    if (addresses.length) addresses.forEach((ip) => console.log(`   http://${ip}:${PORT}/`));
    else console.log('   (no LAN address found — check the Wi-Fi connection)');
    console.log('   Tip: allow Node.js through the firewall on first run, and keep this window open.');
  }
}
