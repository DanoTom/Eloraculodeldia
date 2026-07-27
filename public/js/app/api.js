/**
 * api.js — Cliente de /api/revelation.
 *
 * Contrato de diseño: esta función NUNCA falla. Si la red se cae, si la
 * Function devuelve 500, si el usuario está sin conexión o si la respuesta
 * tarda demasiado, devuelve el texto de respaldo del número correspondiente y
 * sigue adelante. El oráculo no muestra pantallas de error.
 *
 * Lo que se manda: los cuatro números y la fecha. Nada más.
 * El nombre NO viaja: la revelación se cachea por "número + fecha" y se
 * comparte entre todos los que ese día comparten número, así que un texto
 * personalizado sería un texto con el nombre de otra persona. El saludo lo pone
 * la interfaz, del lado del navegador, y el nombre nunca sale del dispositivo.
 */

import { fallbackFor } from '../core/fallbacks.js';
import { debugLog } from '../core/debug.js';

const ENDPOINT = '/api/revelation';

/** Más que esto y la ceremonia se queda esperando con cara de pregunta. */
const TIMEOUT_MS = 22000;

/**
 * @param {object} input
 * @param {object} input.numbers  { expression, lifeMission, day, personal }
 * @param {string} input.dateKey  'YYYY-MM-DD'
 * @returns {Promise<{ text: string, source: string, number: number }>}
 */
export async function fetchRevelation({ numbers, dateKey }) {
  const number = numbers.personal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ numbers, dateKey }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`el servidor respondió ${response.status}`);
    }

    const data = await response.json();
    if (!data?.text) throw new Error('respuesta sin texto');

    debugLog(`[oráculo] revelación (${data.source}) para el ${number} del ${dateKey}`);
    return { text: data.text, source: data.source ?? 'ai', number };
  } catch (error) {
    // Se registra pero no se propaga: el respaldo local es una respuesta
    // legítima, no un plan de emergencia a medio hacer.
    console.warn(`[oráculo] usando el texto de respaldo — ${error.message}`);
    return { text: fallbackFor(number), source: 'fallback-local', number };
  } finally {
    clearTimeout(timer);
  }
}
