/**
 * dates.js — Manejo de fechas en hora LOCAL.
 *
 * Regla de oro de este módulo: nunca usar `new Date('YYYY-MM-DD')`.
 * Ese constructor interpreta el string como UTC, así que en cualquier huso
 * horario negativo (toda América) devuelve el día anterior. Como el bloqueo
 * diario del oráculo depende de "qué día es HOY para vos", todo se resuelve
 * con los componentes locales de Date.
 *
 * Sin dependencias. ESM puro: funciona en el navegador y en Node.
 */

/** Error de entrada del usuario, con código para mapearlo a un mensaje de la UI. */
export class OracleInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OracleInputError';
    this.code = code;
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n, width = 2) => String(n).padStart(width, '0');

/**
 * Valida que un trío (año, mes, día) sea una fecha real del calendario.
 * Rechaza cosas como 2025-02-30 o 2025-13-01, que un Date normal "corrige"
 * en silencio deslizando al mes siguiente.
 */
export function isRealDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  probe.setFullYear(year); // years 0-99 would otherwise map to 1900-1999
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

/**
 * Normaliza cualquier entrada de fecha a `{ year, month, day }` locales.
 *
 * Acepta:
 *  - string 'YYYY-MM-DD' (lo que devuelve `<input type="date">`)
 *  - un objeto Date (se leen sus componentes locales)
 *  - un objeto `{ year, month, day }`
 *
 * @throws {OracleInputError} si la fecha no existe o el formato es desconocido.
 */
export function parseDateParts(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new OracleInputError('fecha_invalida', 'La fecha recibida no es válida.');
    }
    return { year: input.getFullYear(), month: input.getMonth() + 1, day: input.getDate() };
  }

  if (typeof input === 'string') {
    const match = ISO_DATE.exec(input.trim());
    if (!match) {
      throw new OracleInputError('fecha_formato', `Se esperaba una fecha 'YYYY-MM-DD', llegó "${input}".`);
    }
    const [, y, m, d] = match;
    const parts = { year: Number(y), month: Number(m), day: Number(d) };
    if (!isRealDate(parts.year, parts.month, parts.day)) {
      throw new OracleInputError('fecha_inexistente', `La fecha ${input} no existe en el calendario.`);
    }
    return parts;
  }

  if (input && typeof input === 'object') {
    const parts = { year: Number(input.year), month: Number(input.month), day: Number(input.day) };
    if (!isRealDate(parts.year, parts.month, parts.day)) {
      throw new OracleInputError('fecha_inexistente', 'La fecha indicada no existe en el calendario.');
    }
    return parts;
  }

  throw new OracleInputError('fecha_formato', 'No se recibió ninguna fecha.');
}

/** Formatea a la clave canónica 'YYYY-MM-DD' que usa el bloqueo diario. */
export function toDateKey(input) {
  const { year, month, day } = parseDateParts(input);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** La clave del día de hoy, en hora local del visitante. */
export function todayKey(now = new Date()) {
  return toDateKey(now);
}

/**
 * Milisegundos que faltan para la próxima medianoche local.
 * Lo usa el estado "ya consultaste hoy" para la cuenta regresiva
 * ("vuelve cuando el sol se oculte y vuelva a nacer").
 */
export function msUntilNextLocalMidnight(now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/** Fecha larga en castellano, ej. "27 de julio de 2026". Solo para presentación. */
export function formatLongDate(input, locale = 'es') {
  const { year, month, day } = parseDateParts(input);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Fecha corta, ej. "27 de julio". Para etiquetas donde el año sobra: el oráculo
 * siempre habla de hoy, y una fecha larga en versalitas espaciadas se parte en
 * dos líneas.
 */
export function formatShortDate(input, locale = 'es') {
  const { year, month, day } = parseDateParts(input);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  });
}
