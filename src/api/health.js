/**
 * health.js  →  GET /api/health
 *
 * Verifica de una sola mirada que el despliegue quedó bien cableado.
 *
 * Dos modos:
 *
 *   /api/health           — solo presencia. No sale a la red, contesta al
 *                           instante. Dice si el secreto y el binding de KV
 *                           existen (nunca su valor).
 *
 *   /api/health?probe=1   — además PRUEBA la clave contra NVIDIA.
 *
 * El segundo modo existe porque presencia y validez no son lo mismo, y esa
 * diferencia es justo donde se pierde media tarde: la variable puede estar
 * cargada y la clave ser inválida, estar cortada al pegarla, o el modelo puede
 * no estar habilitado en esa cuenta. Un diagnóstico que solo dice "la variable
 * existe" tranquiliza sin informar.
 *
 * La prueba usa el listado de modelos, que no consume tokens, y si el modelo
 * exacto no aparece devuelve los GLM que sí están disponibles — porque el error
 * más probable a esa altura es un identificador de modelo equivocado.
 */

import { json } from '../lib/respond.js';
import { MODEL, NIM_MODELS_URL } from '../lib/nim.js';

/** La prueba no debería colgar el diagnóstico. */
const PROBE_TIMEOUT_MS = 12000;

export async function handleHealth(request, env) {
  const url = new URL(request.url);

  const body = {
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
  };

  if (url.searchParams.has('probe')) {
    body.nvidia = await probeNvidia(env);
  } else {
    body.sugerencia = 'Agregá ?probe=1 para comprobar que la clave de NVIDIA funciona de verdad.';
  }

  return json(body);
}

/**
 * Pregunta a NVIDIA si la clave sirve y si el modelo está disponible.
 * Nunca lanza: cualquier problema se devuelve como diagnóstico legible.
 */
async function probeNvidia(env) {
  if (!env.NVIDIA_API_KEY) {
    return {
      clave: 'ausente',
      veredicto:
        'No hay NVIDIA_API_KEY cargada. El sitio funciona con los textos de respaldo. ' +
        'Para activar GLM: Settings → Variables and Secrets → Add → tipo Secret.',
    };
  }

  // Una clave pegada de más o de menos es el error más común y el más difícil de
  // ver a ojo, así que se informa la longitud (nunca el contenido).
  const shape = { largo: String(env.NVIDIA_API_KEY).length };
  if (/\s/.test(env.NVIDIA_API_KEY)) {
    shape.aviso = 'La clave contiene espacios o saltos de línea — probablemente se pegó de más.';
  }

  try {
    const response = await fetch(NIM_MODELS_URL, {
      headers: {
        authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        clave: 'presente',
        ...shape,
        autentica: false,
        httpStatus: response.status,
        veredicto:
          'NVIDIA rechaza la clave. Revisá que esté completa, sin espacios al principio ni al final, ' +
          'y que siga vigente.',
      };
    }

    if (!response.ok) {
      return {
        clave: 'presente',
        ...shape,
        autentica: null,
        httpStatus: response.status,
        veredicto: `NVIDIA respondió ${response.status}. No es un problema de la clave: reintentá en un rato.`,
      };
    }

    const data = await response.json();
    const ids = Array.isArray(data?.data) ? data.data.map((m) => m?.id).filter(Boolean) : [];
    const disponible = ids.includes(MODEL);

    return {
      clave: 'presente',
      ...shape,
      autentica: true,
      httpStatus: 200,
      modelo: MODEL,
      modeloDisponible: disponible,
      modelosVisibles: ids.length,
      // Si el modelo exacto no está, mostrar los GLM que sí: a esta altura el
      // error más probable es un identificador equivocado, no la clave.
      glmDisponibles: disponible ? undefined : ids.filter((id) => /glm/i.test(id)).slice(0, 10),
      veredicto: disponible
        ? '✓ Todo listo. La clave autentica y el modelo está disponible: las revelaciones las escribe GLM.'
        : `La clave funciona, pero "${MODEL}" no aparece entre los modelos de esta cuenta. ` +
          'Mirá glmDisponibles y decime cuál corresponde.',
    };
  } catch (error) {
    return {
      clave: 'presente',
      ...shape,
      autentica: null,
      veredicto: `No se pudo consultar a NVIDIA: ${error.message}`,
    };
  }
}
