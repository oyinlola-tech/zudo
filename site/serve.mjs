#!/usr/bin/env node
/**
 * Local dev server that behaves like the Vercel deployment:
 * clean URLs, the rewrites in vercel.json, and our own 404 page with a 404 status.
 *
 *   node serve.mjs [port]        # default 8000
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const config = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const rewrites = new Map(config.rewrites.map((r) => [r.source, r.destination]));

const TYPES = {
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
};

async function fileFor(urlPath) {
  const candidates = [];
  const clean = urlPath.replace(/\/+$/, '') || '/index.html';
  candidates.push(clean);
  if (config.cleanUrls && !extname(clean)) candidates.push(clean + '.html');
  candidates.push(join(clean, 'index.html'));
  for (const c of candidates) {
    const abs = join(ROOT, normalize(c).replace(/^(\.\.[/\\])+/, ''));
    if (!abs.startsWith(ROOT)) continue;
    try {
      const s = await stat(abs);
      if (s.isFile()) return abs;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  let abs = await fileFor(urlPath);
  let status = 200;

  const bare = urlPath.replace(/\/$/, '') || '/';
  if (!abs && rewrites.has(urlPath)) abs = await fileFor(rewrites.get(urlPath));
  if (!abs && rewrites.has(bare)) abs = await fileFor(rewrites.get(bare));

  if (!abs) {
    status = 404;
    abs = await fileFor('/404.html');
  }

  if (!abs) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('404');
  }

  const body = await readFile(abs);
  res.writeHead(status, {
    'content-type': TYPES[extname(abs)] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  res.end(body);
  console.log(`${status}  ${urlPath}`);
}).listen(PORT, () => {
  console.log(`Zudo site on http://localhost:${PORT} (clean URLs + vercel.json rewrites)`);
});
