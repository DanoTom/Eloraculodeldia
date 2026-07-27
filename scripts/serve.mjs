/**
 * scripts/serve.mjs — Servidor estático mínimo para public/.
 *
 * `npm run dev` (wrangler pages dev) es lo que hay que usar para probar las
 * Pages Functions. Este servidor es para el caso de todos los días: mirar la
 * escena 3D sin levantar el runtime de Workers ni depender de la red.
 *
 *   npm run serve            → http://localhost:4321
 *   npm run serve -- 8080    → otro puerto
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // `normalize` colapsa los `..`, y el prefijo se verifica después: sin esto,
  // un GET /../../etc/passwd serviría cualquier cosa del disco.
  let filePath = resolve(join(ROOT, normalize(decodeURIComponent(url.pathname))));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  // Permite /lab además de /lab.html.
  if (!existsSync(filePath) && existsSync(`${filePath}.html`)) {
    filePath = `${filePath}.html`;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`El Oráculo del Día — http://localhost:${PORT}`);
  console.log(`  portada       http://localhost:${PORT}/`);
  console.log(`  laboratorio   http://localhost:${PORT}/lab.html`);
});
