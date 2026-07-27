/**
 * worker.js — El punto de entrada de Cloudflare Workers.
 *
 * Cloudflare sirve todo lo que hay en public/ desde su red sin invocar este
 * código; el Worker solo existe para /api/*. Es el mismo runtime que usaban las
 * Pages Functions (V8 isolates, fetch/Request/Response estándar): lo único que
 * cambia es que las rutas se declaran acá en vez de deducirse de los nombres de
 * archivo.
 *
 * Por qué Workers y no Pages: Cloudflare puso Pages en modo mantenimiento y
 * Workers con Static Assets es el camino recomendado. Los handlers no se
 * enteran —reciben (request, env, ctx) y devuelven una Response—, así que
 * siguen siendo portables.
 */

import { handleHealth } from './api/health.js';
import { handleRevelation } from './api/revelation.js';
import { json } from './lib/respond.js';

/** Tabla de rutas: path → método → handler. */
const ROUTES = {
  '/api/health': { GET: handleHealth },
  '/api/revelation': { POST: handleRevelation },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      // Cualquier otra cosa es un archivo estático. `not_found_handling` en
      // wrangler.jsonc se encarga de devolver public/404.html si no existe.
      return env.ASSETS.fetch(request);
    }

    const route = ROUTES[url.pathname];
    if (!route) {
      return json({ error: 'esa puerta no existe' }, 404);
    }

    const handler = route[request.method];
    if (!handler) {
      return json({ error: 'método no permitido' }, 405, { allow: Object.keys(route).join(', ') });
    }

    try {
      return await handler(request, env, ctx);
    } catch (error) {
      // Red de seguridad. `handleRevelation` ya atrapa lo suyo y responde con
      // el texto de respaldo; esto es para lo que nadie previó, y existe para
      // que un error jamás se filtre como una traza al navegador.
      console.error(`[oráculo] ${url.pathname} explotó:`, error?.stack ?? error);
      return json({ error: 'algo se interpuso' }, 500);
    }
  },
};
