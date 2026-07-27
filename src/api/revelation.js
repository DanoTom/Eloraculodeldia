/**
 * revelation.js  →  POST /api/revelation
 *
 * Genera la revelación del día con GLM-5.2 (NVIDIA NIM) y la cachea en Workers KV.
 *
 * QUÉ RECIBE
 *   { numbers: { expression, lifeMission, day, personal }, dateKey: 'YYYY-MM-DD' }
 *
 *   No recibe el nombre, y es deliberado. El texto se cachea por
 *   "número + fecha" y se comparte entre todos los visitantes que ese día
 *   comparten número; un texto con un nombre adentro sería, para casi todos,
 *   el nombre de otra persona. El saludo lo pone el navegador. Efecto lateral
 *   feliz: el nombre nunca sale del dispositivo.
 *
 * ECONOMÍA
 *   Doce números posibles × un día = como máximo doce generaciones diarias, sin
 *   importar cuánta gente entre. A partir de la primera visita de cada número,
 *   todo son lecturas de KV. Eso también hace que el endpoint sea inmune a que
 *   lo martillen: no hay forma de provocar una generación número trece.
 *
 * NUNCA DEVUELVE ERROR
 *   Si falta la clave, si NVIDIA no responde, o si el texto que vuelve no pasa
 *   la validación de voz, contesta 200 con el texto de respaldo escrito a mano.
 *   Un oráculo que muestra un 500 deja de ser un oráculo.
 *
 *   Lo que no valida no se cachea: así el próximo visitante vuelve a intentar
 *   la generación en vez de heredar un texto malo por el resto del día.
 */

import { ORACLE_NUMBERS } from '../../public/js/core/numerology.js';
import { ARCHETYPES } from '../../public/js/core/archetypes.js';
import { BANNED_WORDS, fallbackFor, validateRevelation } from '../../public/js/core/fallbacks.js';
import { json } from '../lib/respond.js';

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'z-ai/glm-5.2';

/** Tres días: la misma fecha local sigue viva ~50 h por husos horarios. */
const CACHE_TTL_SECONDS = 259200;

/** Por debajo del límite de la plataforma, con margen para leer y escribir KV. */
const NIM_TIMEOUT_MS = 20000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* La voz                                                              */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `Eres la voz de "El Oráculo del Día". Escribes una revelación breve por día.

REGISTRO
- Español neutro, tuteo. Nada de regionalismos ni de voseo.
- Poético pero seco. Preferís la imagen concreta a la palabra elevada.
- Debajo del texto hay lecturas de psicoanálisis y de filosofía existencial: el deseo, la falta, la repetición, la elección, la finitud, el otro. Se notan en cómo miras, nunca en el vocabulario. No cites autores ni uses jerga.
- Le hablas a un adulto inteligente que no quiere que lo halaguen.

ESTRUCTURA (tres movimientos, sin títulos ni viñetas)
1. Una imagen o metáfora central, concreta y sensorial.
2. Una reflexión que gire sobre una contradicción, no sobre una virtud.
3. Un llamado pequeño y concreto para hoy, o una pregunta abierta que quede sonando.

REGLAS DURAS
- Entre 80 y 150 palabras. Ni una más.
- Devuelve ÚNICAMENTE el texto. Sin título, sin comillas, sin markdown, sin preámbulo, sin firma.
- No nombres a la persona ni inventes un nombre: este texto lo van a leer muchas personas distintas.
- No menciones números, numerología, astrología, cartas, signos, ni nada del mecanismo que te trajo hasta acá. Quien lee no debe enterarse de que hubo un cálculo.
- Prohibidas estas palabras y todo su registro: energía, vibración, abundancia, manifestar, alineación, karma, chakra, aura, prosperidad, luz interior, universo (como entidad que conspira).
- Nada de autoayuda, ni promesas, ni predicciones de hechos concretos. No adivinas el futuro: describes una tensión que ya está ahí.
- No consueles. Si hay algo incómodo, decilo.`;

function buildUserPrompt(number, dateKey) {
  const archetype = ARCHETYPES[number] ?? ARCHETYPES[1];

  return [
    `Fecha de hoy: ${dateKey}.`,
    `Arquetipo del día: "${archetype.title}".`,
    `Imágenes disponibles (usa una, o encuentra otra del mismo mundo): ${archetype.motifs.join('; ')}.`,
    `La contradicción que el texto tiene que habitar: ${archetype.tension}.`,
    '',
    'Escribe la revelación de hoy.',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/**
 * Limpia lo que devuelve el modelo.
 *
 * Los modelos con razonamiento a veces emiten un bloque <think>, y casi todos
 * tienden a envolver la respuesta en comillas o negritas por más que se les
 * pida que no. Se saca acá en vez de rechazar el texto entero por un asterisco.
 */
function cleanModelText(raw) {
  return String(raw ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?[a-z_]+>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[«"'`]+|[»"'`]+\s*$/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * ¿Es `dateKey` una fecha plausible para "hoy"?
 *
 * El servidor corre en UTC y los visitantes están en cualquier huso, así que se
 * aceptan ayer, hoy y mañana. Sin esto, cualquiera podría pedir revelaciones
 * para el año 2400 y llenar KV de basura.
 */
function isPlausibleToday(dateKey, now = new Date()) {
  if (!ISO_DATE.test(dateKey)) return false;

  const asked = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(asked)) return false;

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(asked - today) <= 36 * 60 * 60 * 1000;
}

/** Los cuatro números tienen que ser números del oráculo. */
function readNumbers(body) {
  const numbers = body?.numbers;
  if (!numbers || typeof numbers !== 'object') return null;

  const keys = ['expression', 'lifeMission', 'day', 'personal'];
  const parsed = {};

  for (const key of keys) {
    const value = Number(numbers[key]);
    if (!ORACLE_NUMBERS.includes(value)) return null;
    parsed[key] = value;
  }

  return parsed;
}

/* ------------------------------------------------------------------ */
/* Llamada al modelo                                                   */
/* ------------------------------------------------------------------ */

async function generate(env, number, dateKey) {
  const response = await fetch(NIM_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.NVIDIA_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(number, dateKey) },
      ],
      // Temperatura alta: el mismo arquetipo sale todos los días y sin esto se
      // repetiría casi palabra por palabra.
      temperature: 0.95,
      top_p: 0.9,
      max_tokens: 700,
      stream: false,
    }),
    signal: AbortSignal.timeout(NIM_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`NIM ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = cleanModelText(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error('NIM devolvió una respuesta vacía');

  return text;
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export async function handleRevelation(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'cuerpo json inválido' }, 400);
  }

  const numbers = readNumbers(body);
  const dateKey = String(body?.dateKey ?? '');

  if (!numbers) return json({ error: 'números fuera del rango del oráculo' }, 400);
  if (!isPlausibleToday(dateKey)) return json({ error: 'fecha fuera de rango' }, 400);

  const number = numbers.personal;
  const cacheKey = `rev:v1:${number}:${dateKey}`;
  const kv = env.REVELATIONS;

  // 1 · ¿Ya lo escribimos hoy para este número?
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) return json({ text: cached, source: 'cache', number, dateKey });
    } catch (error) {
      console.warn(`KV no disponible para leer: ${error.message}`);
    }
  }

  // 2 · Sin clave configurada, el respaldo es la respuesta correcta, no un error.
  if (!env.NVIDIA_API_KEY) {
    return json({ text: fallbackFor(number), source: 'fallback', number, dateKey });
  }

  // 3 · Generar.
  try {
    const text = await generate(env, number, dateKey);
    const verdict = validateRevelation(text);

    if (!verdict.ok) {
      // A propósito no se cachea: el próximo visitante vuelve a probar suerte
      // en vez de quedarse con un texto flojo hasta la medianoche.
      console.warn(`Texto rechazado para el ${number} del ${dateKey}: ${verdict.reason}`);
      return json({ text: fallbackFor(number), source: 'fallback', number, dateKey });
    }

    if (kv) {
      // `waitUntil` deja que la escritura termine después de contestar: el
      // usuario no espera a KV para leer su revelación.
      ctx.waitUntil(
        kv
          .put(cacheKey, text, { expirationTtl: CACHE_TTL_SECONDS })
          .catch((error) => console.warn(`KV no disponible para escribir: ${error.message}`)),
      );
    }

    return json({ text, source: 'ai', number, dateKey });
  } catch (error) {
    console.warn(`Generación fallida para el ${number} del ${dateKey}: ${error.message}`);
    return json({ text: fallbackFor(number), source: 'fallback', number, dateKey });
  }
}

/** Palabras vetadas, expuestas para el health check y los tests. */
export const VETOED = BANNED_WORDS;
