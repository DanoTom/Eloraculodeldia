/**
 * health.js  →  GET /api/health
 *
 * Verifica tres cosas de una sola mirada:
 *   1. que el Worker esté desplegado y respondiendo,
 *   2. que la variable secreta NVIDIA_API_KEY esté cargada en el entorno
 *      (informa si está o no; JAMÁS su valor),
 *   3. que el binding de Workers KV para el caché de revelaciones exista.
 *
 * Es la primera URL que hay que abrir después de un despliegue.
 */

import { json } from '../lib/respond.js';

export async function handleHealth(request, env) {
  return json({
    service: 'el-oraculo-del-dia',
    status: 'ok',
    runtime: 'cloudflare-workers',
    now: new Date().toISOString(),
    // Zona horaria del centro de datos que atendió: siempre UTC en Workers.
    // Queda anotado porque el bloqueo diario se resuelve en el navegador, con
    // hora LOCAL del visitante, y esa diferencia es fácil de olvidar.
    serverTimeZone: 'UTC',
    bindings: {
      // Solo presencia. Filtrar la clave por un endpoint de diagnóstico sería
      // exactamente el problema que este backend viene a evitar.
      NVIDIA_API_KEY: Boolean(env.NVIDIA_API_KEY),
      REVELATIONS_KV: Boolean(env.REVELATIONS),
    },
    colo: request.headers.get('cf-ray')?.split('-')[1] ?? null,
  });
}
