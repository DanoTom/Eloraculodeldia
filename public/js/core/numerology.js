/**
 * numerology.js — Núcleo de cálculo (numerología pitagórica).
 *
 * Sin dependencias, sin estado, sin efectos secundarios: entra un nombre y una
 * fecha, sale un objeto con todos los números y su rastro de reducción.
 * ESM puro: se importa igual desde el navegador, desde una Pages Function y
 * desde Node (los tests).
 *
 * Los cuatro números:
 *   1. Expresión         — las letras del nombre.
 *   2. Misión de Vida    — la fecha de nacimiento.
 *   3. Número del Día    — la fecha de la consulta.
 *   4. Personal del Día  — la suma de los tres anteriores. Es el que dispara
 *                          la revelación, y el único que le importa al usuario.
 *
 * REGLA DE LOS MAESTROS: al reducir se corta en 11, 22 o 33 en vez de seguir
 * hasta un dígito. La comprobación ocurre ANTES de cada paso de reducción, así
 * que 47 → 11 se detiene en 11 (no sigue a 2), y 29 → 11 también.
 *
 * Cada función devuelve además `steps`: la cadena completa de reducción
 * (ej. [47, 11]). No es adorno — es lo que alimenta la animación de
 * descomposición del nombre y lo que se imprime en consola para depurar.
 *
 * IMPORTANTE: estos números nunca se muestran crudos al usuario. La UI solo
 * los expone envueltos en la narrativa; en consola se ven completos con
 * `?debug=1` (ver debug.js).
 */

import { OracleInputError, parseDateParts, toDateKey, todayKey } from './dates.js';

/** Números maestros: la reducción se detiene acá. */
export const MASTER_NUMBERS = Object.freeze([11, 22, 33]);
const MASTER_SET = new Set(MASTER_NUMBERS);

/** Los números que el oráculo puede llegar a entregar, en orden de presentación. */
export const ORACLE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);

/**
 * Tabla pitagórica: cada fila es el valor 1..9 y las letras que lo llevan.
 *   1 A J S · 2 B K T · 3 C L U · 4 D M V · 5 E N W
 *   6 F O X · 7 G P Y · 8 H Q Z · 9 I R
 */
const PYTHAGOREAN_ROWS = ['AJS', 'BKT', 'CLU', 'DMV', 'ENW', 'FOX', 'GPY', 'HQZ', 'IR'];

/** Mapa letra → valor, derivado de las filas de arriba. */
export const LETTER_VALUES = Object.freeze(
  PYTHAGOREAN_ROWS.reduce((map, letters, index) => {
    for (const letter of letters) map[letter] = index + 1;
    return map;
  }, Object.create(null)),
);

/**
 * Normaliza un nombre a las 26 letras del alfabeto latino básico.
 *
 * Descompone en NFD y borra los diacríticos combinantes, de modo que
 * José → JOSE, Iñaki → INAKI, Begoña → BEGONA. Esto es deliberado: la tabla
 * pitagórica solo define A-Z, y tratar 'Ñ' como 'N' es la convención usada en
 * numerología en castellano.
 *
 * Todo lo que no sea A-Z (espacios, guiones, apóstrofos, dígitos) se descarta.
 */
export function normalizeName(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/** Valor pitagórico de un carácter suelto, o 0 si no es una letra A-Z. */
export function letterValue(char) {
  return LETTER_VALUES[normalizeName(char)] ?? 0;
}

/** Suma de los dígitos de un entero no negativo. 47 → 11. */
export function digitSum(value) {
  let remaining = Math.abs(Math.trunc(value));
  let total = 0;
  while (remaining > 0) {
    total += remaining % 10;
    remaining = Math.floor(remaining / 10);
  }
  return total;
}

function assertCountable(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new OracleInputError('numero_invalido', `${label} debe ser un entero no negativo, llegó ${value}.`);
  }
}

/**
 * Reduce un número por suma de dígitos hasta 1-9, deteniéndose en 11, 22 o 33.
 * Devuelve el rastro completo del descenso.
 *
 * @param {number} value          entero no negativo
 * @param {object} [options]
 * @param {boolean} [options.allowMaster=true]  si es false, reduce siempre a 1-9
 * @returns {{ value: number, steps: number[], isMaster: boolean }}
 *
 * @example reduceWithTrace(47) // → { value: 11, steps: [47, 11], isMaster: true }
 * @example reduceWithTrace(27) // → { value: 9,  steps: [27, 9],  isMaster: false }
 * @example reduceWithTrace(47, { allowMaster: false }) // → { value: 2, steps: [47, 11, 2] }
 */
export function reduceWithTrace(value, { allowMaster = true } = {}) {
  assertCountable(value, 'El valor a reducir');

  const steps = [value];
  let current = value;

  while (current > 9) {
    if (allowMaster && MASTER_SET.has(current)) break;
    current = digitSum(current);
    steps.push(current);
  }

  return { value: current, steps, isMaster: MASTER_SET.has(current) };
}

/** Igual que `reduceWithTrace` pero devuelve solo el número final. */
export function reduceNumber(value, options) {
  return reduceWithTrace(value, options).value;
}

/**
 * 1) NÚMERO DE EXPRESIÓN — la firma sonora del nombre.
 *
 * Cada letra vale 1-9 según la tabla pitagórica; se suman todas y se reduce.
 *
 * @returns {{
 *   number: number, sum: number, steps: number[], isMaster: boolean,
 *   normalized: string, letters: Array<{ index: number, char: string, value: number }>,
 *   discarded: string
 * }}
 *
 * `letters` es lo que consume la animación de descomposición: cada letra con
 * su índice y su valor, en orden de aparición.
 */
export function expressionNumber(name, options) {
  const normalized = normalizeName(name);

  if (normalized.length === 0) {
    throw new OracleInputError('nombre_vacio', 'El nombre no contiene ninguna letra legible.');
  }

  const letters = [...normalized].map((char, index) => ({
    index,
    char,
    value: LETTER_VALUES[char],
  }));

  const sum = letters.reduce((total, letter) => total + letter.value, 0);
  const { value, steps, isMaster } = reduceWithTrace(sum, options);

  // Caracteres que se ignoraron (espacios, dígitos, símbolos). La UI los usa
  // para avisar "solo tu primer nombre" sin bloquear el cálculo.
  const discarded = [...String(name ?? '')].filter((char) => normalizeName(char) === '').join('');

  return { number: value, sum, steps, isMaster, normalized, letters, discarded };
}

/**
 * 2) NÚMERO DE MISIÓN DE VIDA — la fecha de nacimiento.
 *
 * Se reduce día, mes y año POR SEPARADO (cada uno respetando la regla de los
 * maestros), se suman los tres resultados y se reduce una vez más. Reducir por
 * partes importa: un 29 de nacimiento aporta 11, no 2.
 *
 * @example lifeMissionNumber('1990-05-29')
 *   día 29 → 11 · mes 5 → 5 · año 1990 → 19 → 10 → 1 · suma 17 → 8
 */
export function lifeMissionNumber(birthDate, options) {
  const { year, month, day } = parseDateParts(birthDate);

  const parts = {
    day: reduceWithTrace(day, options),
    month: reduceWithTrace(month, options),
    year: reduceWithTrace(year, options),
  };

  const sum = parts.day.value + parts.month.value + parts.year.value;
  const { value, steps, isMaster } = reduceWithTrace(sum, options);

  return { number: value, sum, steps, isMaster, parts, date: toDateKey(birthDate) };
}

/**
 * 3) NÚMERO DEL DÍA — la fecha de la consulta, reducida entera.
 *
 * A diferencia de la Misión de Vida, acá la fecha se toma como un solo bloque:
 * se suman TODOS los dígitos de DD + MM + AAAA y se reduce el total.
 *
 * @example dayNumber('2026-07-27') // 2+7 + 0+7 + 2+0+2+6 = 26 → 8
 */
export function dayNumber(date = new Date(), options) {
  const { year, month, day } = parseDateParts(date);

  const sum = digitSum(day) + digitSum(month) + digitSum(year);
  const { value, steps, isMaster } = reduceWithTrace(sum, options);

  return { number: value, sum, steps, isMaster, date: toDateKey(date) };
}

/**
 * 4) NÚMERO PERSONAL DEL DÍA — el resultado que dispara la revelación.
 *
 * Expresión + Misión de Vida + Número del Día, reducido una última vez.
 */
export function personalDayNumber({ expression, lifeMission, day }, options) {
  assertCountable(expression, 'El número de Expresión');
  assertCountable(lifeMission, 'El número de Misión de Vida');
  assertCountable(day, 'El Número del Día');

  const sum = expression + lifeMission + day;
  const { value, steps, isMaster } = reduceWithTrace(sum, options);

  return { number: value, sum, steps, isMaster };
}

/**
 * Cálculo completo. Es el único punto de entrada que necesita la aplicación.
 *
 * @param {object} input
 * @param {string} input.name            primer nombre, tal cual lo tipeó la persona
 * @param {string|Date} input.birthDate  'YYYY-MM-DD' o Date
 * @param {string|Date} [input.date]     fecha de la consulta (por defecto, hoy local)
 * @param {object} [options]             se pasa tal cual a las reducciones
 * @returns {object} lectura completa, lista para la escena 3D y para el prompt de la IA
 */
export function castOracle({ name, birthDate, date = new Date() }, options) {
  const expression = expressionNumber(name, options);
  const lifeMission = lifeMissionNumber(birthDate, options);
  const day = dayNumber(date, options);

  const personal = personalDayNumber(
    { expression: expression.number, lifeMission: lifeMission.number, day: day.number },
    options,
  );

  return {
    // Entrada normalizada (el nombre se guarda tal cual lo escribió la persona,
    // para poder saludarla con sus tildes intactas).
    input: { name: String(name ?? '').trim(), birthDate: toDateKey(birthDate) },
    dateKey: toDateKey(date),
    today: todayKey(),

    expression,
    lifeMission,
    day,
    personal,

    /** Atajo: el número que le importa al usuario. */
    number: personal.number,
  };
}

/**
 * Resumen en una línea de una lectura, para logs y mensajes de error.
 * Nunca se muestra al usuario: los números crudos solo viven en consola.
 */
export function describeCast(cast) {
  const { expression: e, lifeMission: m, day: d, personal: p } = cast;
  return (
    `${cast.input.name || '(sin nombre)'} · ${cast.dateKey} — ` +
    `Expresión ${e.sum}→${e.number} · Misión ${m.sum}→${m.number} · ` +
    `Día ${d.sum}→${d.number} · Personal ${p.sum}→${p.number}`
  );
}
