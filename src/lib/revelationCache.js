/**
 * revelationCache.js — Dónde vive el texto del día una vez escrito.
 *
 * Dos capas, y la segunda existe porque la primera necesita configuración:
 *
 *   1. Workers KV — GLOBAL. Un texto por número y por día para todo el planeta:
 *      doce generaciones diarias como máximo, sin importar cuánta gente entre.
 *      Requiere crear un namespace y declararlo en wrangler.jsonc.
 *
 *   2. Cache API — POR CENTRO DE DATOS. No requiere configurar absolutamente
 *      nada: `caches.default` está siempre disponible en el runtime. Cada colo
 *      genera una vez por número y por día, así que con visitantes repartidos
 *      por el mundo cuesta más que KV, pero frente a "generar en cada visita" la
 *      diferencia es de órdenes de magnitud.
 *
 * La segunda capa no es un reemplazo de la primera: es lo que hace que el
 * control de costos funcione DESDE EL PRIMER DESPLIEGUE, antes de que nadie se
 * acuerde de crear el namespace. Cuando KV aparece, pasa a mandar sola.
 */

/** Tres días: la misma fecha local sigue viva ~50 h por husos horarios. */
export const CACHE_TTL_SECONDS = 259200;

/** Clave por número y fecha — nunca por usuario: el texto se comparte. */
const kvKey = (number, dateKey) => `rev:v1:${number}:${dateKey}`;

/**
 * La Cache API guarda Responses indexadas por Request, así que hace falta una
 * URL. Este host no existe ni se resuelve nunca: es solo un identificador.
 */
const edgeKey = (number, dateKey) =>
  new Request(`https://cache.oraculo.local/rev/v1/${number}/${dateKey}`);

/**
 * Busca el texto del día.
 * @returns {Promise<{ text: string, source: 'cache-kv' | 'cache-edge' } | null>}
 */
export async function readCachedRevelation(env, number, dateKey) {
  if (env.REVELATIONS) {
    try {
      const text = await env.REVELATIONS.get(kvKey(number, dateKey));
      if (text) return { text, source: 'cache-kv' };
    } catch (error) {
      console.warn(`KV no disponible para leer: ${error.message}`);
    }
  }

  try {
    const hit = await caches.default.match(edgeKey(number, dateKey));
    if (hit) return { text: await hit.text(), source: 'cache-edge' };
  } catch (error) {
    console.warn(`Cache API no disponible para leer: ${error.message}`);
  }

  return null;
}

/**
 * Guarda el texto en las dos capas.
 *
 * Se escribe con `waitUntil` para que la persona no espere a que termine: ya
 * tiene su revelación, lo que falta es solo para el que venga después.
 */
export function writeCachedRevelation(env, ctx, number, dateKey, text) {
  if (env.REVELATIONS) {
    ctx.waitUntil(
      env.REVELATIONS.put(kvKey(number, dateKey), text, { expirationTtl: CACHE_TTL_SECONDS }).catch(
        (error) => console.warn(`KV no disponible para escribir: ${error.message}`),
      ),
    );
  }

  ctx.waitUntil(
    caches.default
      .put(
        edgeKey(number, dateKey),
        // El TTL de la Cache API sale de la cabecera de la respuesta guardada.
        new Response(text, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': `max-age=${CACHE_TTL_SECONDS}`,
          },
        }),
      )
      .catch((error) => console.warn(`Cache API no disponible para escribir: ${error.message}`)),
  );
}
