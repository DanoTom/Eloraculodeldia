/**
 * functions/api/health.js  →  GET /api/health
 *
 * Cloudflare Pages Functions: cada archivo bajo /functions es una ruta, y el
 * nombre del archivo es el path. No hay Express, ni servidor, ni `listen`: el
 * runtime son V8 isolates y el contrato es fetch/Request/Response estándar.
 *
 * Este endpoint existe para verificar tres cosas de una sola mirada, antes de
 * que haya lógica real que depurar:
 *   1. que el directorio /functions esté bien cableado al proyecto de Pages,
 *   2. que la variable secreta NVIDIA_API_KEY esté cargada en el entorno
 *      (informa si está o no; JAMÁS su valor),
 *   3. que el binding de Workers KV para el caché de revelaciones exista.
 *
 * La llamada real a GLM-5.2 vivirá en /functions/api/revelation.js.
 */

export async function onRequestGet({ env, request }) {
  const body = {
    service: 'el-oraculo-del-dia',
    status: 'ok',
    runtime: 'cloudflare-pages-functions',
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
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
