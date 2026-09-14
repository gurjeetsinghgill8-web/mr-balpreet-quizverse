/**
 * QUIZVERSE — preview the built static site exactly as a host would serve it.
 *
 *   npm run build:static
 *   node tools/serve-dist.mjs        → http://127.0.0.1:4320
 *
 * Useful before uploading to Netlify/Cloudflare: if it plays here, it plays there.
 * (No API routes: this is the static half of the product.)
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 4320);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const clean = path.normalize(urlPath).replace(/^([/\\])+/, '');
  let target = path.join(ROOT, clean === '' ? 'index.html' : clean);
  if (!target.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

  let info = await stat(target).catch(() => null);
  if (info && info.isDirectory()) {
    target = path.join(target, 'index.html');
    info = await stat(target).catch(() => null);
  }
  if (!info) {
    // single-page-app fallback, like Netlify's /* → /index.html rewrite
    target = path.join(ROOT, 'index.html');
    info = await stat(target).catch(() => null);
  }
  if (!info) { res.writeHead(404).end('Not found'); return; }

  const body = await readFile(target);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Static preview → http://127.0.0.1:${PORT}/  (serving ${ROOT})`);
});
