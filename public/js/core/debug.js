/**
 * debug.js — Consola de depuración del oráculo.
 *
 * El cálculo numerológico tiene que ser auditable sin filtrarse a la interfaz:
 * los números crudos van a la consola, nunca a la pantalla sin su envoltura
 * narrativa.
 *
 * Se activa con:
 *   · `?debug=1` en la URL,
 *   · `localStorage.setItem('oraculo:debug', '1')` (persiste entre recargas),
 *   · `ORACULO_DEBUG=1` como variable de entorno en Node,
 *   · o `Oraculo.setDebug(true)` desde la consola del navegador.
 */

const STORAGE_KEY = 'oraculo:debug';

function detectInitialState() {
  if (typeof process !== 'undefined' && process.env?.ORACULO_DEBUG) {
    return process.env.ORACULO_DEBUG !== '0';
  }
  if (typeof window === 'undefined') return false;

  try {
    const flag = new URLSearchParams(window.location.search).get('debug');
    if (flag !== null) return flag !== '0';
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // localStorage puede tirar en modo privado o con cookies bloqueadas.
    return false;
  }
}

let enabled = detectInitialState();

export const isDebugEnabled = () => enabled;

/** Activa o desactiva la depuración, y la recuerda entre recargas. */
export function setDebug(value) {
  enabled = Boolean(value);
  try {
    if (typeof window !== 'undefined') {
      if (enabled) window.localStorage.setItem(STORAGE_KEY, '1');
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* sin persistencia: da igual, la sesión actual ya quedó marcada */
  }
  return enabled;
}

const GROUP_STYLE = 'color:#e8d6a0;font-weight:600';
const DIM_STYLE = 'color:#8d84a8';

/** Agrupa logs en la consola. El callback solo corre si la depuración está activa. */
export function debugGroup(label, render) {
  if (!enabled) return;
  const group = console.groupCollapsed ?? console.group;
  group.call(console, `%c✦ ${label}`, GROUP_STYLE);
  try {
    render();
  } finally {
    console.groupEnd();
  }
}

export function debugLog(...args) {
  if (enabled) console.log(...args);
}

export function debugTable(rows, columns) {
  if (!enabled) return;
  if (console.table) console.table(rows, columns);
  else console.log(rows);
}

/** Formatea una cadena de reducción: [47, 11] → "47 → 11". */
const trace = (steps) => steps.join(' → ');

/**
 * Vuelca una lectura completa en la consola: las cuatro reducciones, el desglose
 * letra por letra y el número final. Es la herramienta principal para verificar
 * a mano cualquier cálculo.
 *
 * @param {import('./numerology.js').castOracle extends (...a:any)=>infer R ? R : object} cast
 */
export function logCast(cast) {
  if (!enabled) return;

  const { expression, lifeMission, day, personal } = cast;
  const master = (part) => (part.isMaster ? '  ★ maestro' : '');

  debugGroup(`Oráculo · ${cast.input.name || '(sin nombre)'} · ${cast.dateKey}`, () => {
    console.log(
      `%c${expression.normalized}%c  (${expression.letters.length} letras)`,
      GROUP_STYLE,
      DIM_STYLE,
    );
    debugTable(
      expression.letters.map(({ index, char, value }) => ({ '#': index + 1, letra: char, valor: value })),
      ['#', 'letra', 'valor'],
    );

    debugTable(
      [
        {
          número: '1 · Expresión',
          crudo: expression.sum,
          reducción: trace(expression.steps),
          resultado: expression.number + master(expression),
        },
        {
          número: '2 · Misión de Vida',
          crudo: lifeMission.sum,
          reducción: trace(lifeMission.steps),
          resultado: lifeMission.number + master(lifeMission),
        },
        {
          número: '3 · Del Día',
          crudo: day.sum,
          reducción: trace(day.steps),
          resultado: day.number + master(day),
        },
        {
          número: '4 · PERSONAL DEL DÍA',
          crudo: personal.sum,
          reducción: trace(personal.steps),
          resultado: personal.number + master(personal),
        },
      ],
      ['número', 'crudo', 'reducción', 'resultado'],
    );

    console.log(
      `%cMisión de Vida — día ${trace(lifeMission.parts.day.steps)} · ` +
        `mes ${trace(lifeMission.parts.month.steps)} · ` +
        `año ${trace(lifeMission.parts.year.steps)}`,
      DIM_STYLE,
    );
    console.log(
      `%c→ Número Personal del Día: %c${personal.number}${personal.isMaster ? ' (maestro)' : ''}`,
      DIM_STYLE,
      GROUP_STYLE,
    );
  });
}
