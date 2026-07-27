/**
 * numerology.test.js — Tests del núcleo de cálculo.
 *
 * Sin framework, a propósito: son aserciones planas que corren igual en el
 * navegador y en Node, así que el mismo archivo sirve para depurar en vivo
 * desde la consola y para tener un `npm test` que falle en CI.
 *
 *   Navegador  →  abrir /lab.html y ejecutar `Oraculo.test()` en la consola
 *                 (o cargar /lab.html?test=1, que los corre solo).
 *   Node       →  npm test
 *
 * Todos los valores esperados están calculados a mano en los comentarios: si
 * un test falla, el comentario dice cuál era la cuenta correcta.
 */

import {
  ORACLE_NUMBERS,
  castOracle,
  dayNumber,
  digitSum,
  expressionNumber,
  letterValue,
  lifeMissionNumber,
  normalizeName,
  personalDayNumber,
  reduceNumber,
  reduceWithTrace,
} from '../core/numerology.js';
import { ARCHETYPES } from '../core/archetypes.js';
import { FALLBACK_REVELATIONS, countWords, fallbackFor, validateRevelation } from '../core/fallbacks.js';
import { isRealDate, parseDateParts, toDateKey, todayKey } from '../core/dates.js';

/* ------------------------------------------------------------------ */
/* Mini-arnés de tests                                                 */
/* ------------------------------------------------------------------ */

const IN_BROWSER = typeof window !== 'undefined';

function createRunner() {
  const failures = [];
  let passed = 0;

  const show = (value) => (Array.isArray(value) ? `[${value.join(', ')}]` : String(value));

  const equal = (a, b) =>
    Array.isArray(a) && Array.isArray(b)
      ? a.length === b.length && a.every((item, i) => item === b[i])
      : Object.is(a, b);

  return {
    failures,
    get passed() {
      return passed;
    },

    /** Compara actual vs esperado (números, strings o arrays de números). */
    is(label, actual, expected) {
      if (equal(actual, expected)) passed += 1;
      else failures.push({ label, esperado: show(expected), obtenido: show(actual) });
    },

    /** Verifica que `fn` lance un OracleInputError con el código indicado. */
    throws(label, fn, code) {
      try {
        fn();
        failures.push({ label, esperado: `error ${code}`, obtenido: 'no lanzó' });
      } catch (error) {
        if (error?.code === code) passed += 1;
        else failures.push({ label, esperado: `error ${code}`, obtenido: `${error?.code ?? error}` });
      }
    },

    ok(label, condition) {
      if (condition) passed += 1;
      else failures.push({ label, esperado: 'true', obtenido: 'false' });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Los tests                                                           */
/* ------------------------------------------------------------------ */

function testPrimitives(t) {
  t.is('digitSum(47)', digitSum(47), 11);
  t.is('digitSum(1990)', digitSum(1990), 19);
  t.is('digitSum(0)', digitSum(0), 0);
  t.is('digitSum(9)', digitSum(9), 9);

  t.is('letterValue(A)', letterValue('A'), 1);
  t.is('letterValue(i) minúscula', letterValue('i'), 9);
  t.is('letterValue(ó) con tilde → O', letterValue('ó'), 6);
  t.is('letterValue(ñ) → N', letterValue('ñ'), 5);
  t.is('letterValue(espacio)', letterValue(' '), 0);

  t.is('normalizeName(José)', normalizeName('José'), 'JOSE');
  t.is('normalizeName(Iñaki)', normalizeName('Iñaki'), 'INAKI');
  t.is('normalizeName(  ana  )', normalizeName('  ana  '), 'ANA');
  t.is('normalizeName(Ana-Sofía)', normalizeName('Ana-Sofía'), 'ANASOFIA');
  t.is('normalizeName(a1b2)', normalizeName('a1b2'), 'AB');
  t.is('normalizeName(null)', normalizeName(null), '');
}

function testReduction(t) {
  // Reducción común hasta 1-9.
  t.is('reduce 27 → 9', reduceNumber(27), 9); // 2+7
  t.is('reduce 10 → 1', reduceNumber(10), 1);
  t.is('reduce 9 → 9', reduceNumber(9), 9);
  t.is('reduce 99 → 9', reduceNumber(99), 9); // 99 → 18 → 9
  t.is('reduce 1990 → 1', reduceNumber(1990), 1); // 19 → 10 → 1

  // Regla de los maestros: se corta ANTES de seguir reduciendo.
  t.is('reduce 11 → 11', reduceNumber(11), 11);
  t.is('reduce 22 → 22', reduceNumber(22), 22);
  t.is('reduce 33 → 33', reduceNumber(33), 33);
  t.is('reduce 29 → 11', reduceNumber(29), 11); // 2+9 = 11, se detiene
  t.is('reduce 47 → 11', reduceNumber(47), 11); // 4+7 = 11, se detiene
  t.is('reduce 1975 → 22', reduceNumber(1975), 22); // 1+9+7+5 = 22
  t.is('reduce 2299 → 22', reduceNumber(2299), 22); // 2+2+9+9 = 22

  // Rastro completo (lo consume la animación).
  t.is('trace 47', reduceWithTrace(47).steps, [47, 11]);
  t.is('trace 1990', reduceWithTrace(1990).steps, [1990, 19, 10, 1]);
  t.is('trace 7 (ya reducido)', reduceWithTrace(7).steps, [7]);
  t.is('47 es maestro', reduceWithTrace(47).isMaster, true);
  t.is('27 no es maestro', reduceWithTrace(27).isMaster, false);

  // allowMaster:false ignora la excepción y baja siempre a un dígito.
  t.is('47 sin maestros → 2', reduceNumber(47, { allowMaster: false }), 2);
  t.is('trace 47 sin maestros', reduceWithTrace(47, { allowMaster: false }).steps, [47, 11, 2]);
  t.is('33 sin maestros → 6', reduceNumber(33, { allowMaster: false }), 6);

  t.throws('reduce(-1) lanza', () => reduceNumber(-1), 'numero_invalido');
  t.throws('reduce(1.5) lanza', () => reduceNumber(1.5), 'numero_invalido');
}

function testExpression(t) {
  // ANA = 1+5+1 = 7
  t.is('Expresión ANA', expressionNumber('Ana').number, 7);
  t.is('Expresión ANA (suma cruda)', expressionNumber('Ana').sum, 7);

  // LUZ = 3+3+8 = 14 → 5
  t.is('Expresión LUZ', expressionNumber('Luz').number, 5);

  // SOFIA = 1+6+6+9+1 = 23 → 5
  t.is('Expresión SOFIA', expressionNumber('Sofía').number, 5);

  // DANIEL = 4+1+5+9+5+3 = 27 → 9
  t.is('Expresión DANIEL', expressionNumber('Daniel').number, 9);

  // MARIA = 4+1+9+9+1 = 24 → 6
  t.is('Expresión MARIA', expressionNumber('María').number, 6);

  // JOSE = 1+6+1+5 = 13 → 4  (con y sin tilde deben coincidir)
  t.is('Expresión JOSE', expressionNumber('Jose').number, 4);
  t.is('Expresión JOSÉ = JOSE', expressionNumber('José').number, expressionNumber('Jose').number);

  // INAKI = 9+5+1+2+9 = 26 → 8
  t.is('Expresión IÑAKI', expressionNumber('Iñaki').number, 8);

  // ANASOFIA = 1+5+1+1+6+6+9+1 = 30 → 3  (se ignoran guiones y tildes)
  t.is('Expresión Ana-Sofía', expressionNumber('Ana-Sofía').number, 3);

  // Maestros por nombre:
  // ABEL     = 1+2+5+3 = 11
  // FEDERICO = 6+5+4+5+9+9+3+6 = 47 → 11
  // ROCIO    = 9+6+3+9+6 = 33
  t.is('Expresión ABEL → 11', expressionNumber('Abel').number, 11);
  t.is('Expresión FEDERICO → 11', expressionNumber('Federico').number, 11);
  t.is('Expresión FEDERICO (suma)', expressionNumber('Federico').sum, 47);
  t.is('Expresión ROCIO → 33', expressionNumber('Rocío').number, 33);
  t.is('ROCIO es maestro', expressionNumber('Rocío').isMaster, true);

  // Desglose letra por letra (lo usa la animación de descomposición).
  const luz = expressionNumber('Luz');
  t.is('LUZ tiene 3 letras', luz.letters.length, 3);
  t.is('LUZ valores', luz.letters.map((l) => l.value), [3, 3, 8]);
  t.is('LUZ normalizado', luz.normalized, 'LUZ');
  t.is('Ana-Sofía descarta el guión', expressionNumber('Ana-Sofía').discarded, '-');

  t.throws('nombre vacío lanza', () => expressionNumber(''), 'nombre_vacio');
  t.throws('nombre solo dígitos lanza', () => expressionNumber('123'), 'nombre_vacio');
  t.throws('nombre solo espacios lanza', () => expressionNumber('   '), 'nombre_vacio');
}

function testLifeMission(t) {
  // 1990-05-29 → día 29→11 · mes 5 · año 1990→1 · suma 17 → 8
  const a = lifeMissionNumber('1990-05-29');
  t.is('Misión 1990-05-29', a.number, 8);
  t.is('Misión 1990-05-29 · día', a.parts.day.value, 11);
  t.is('Misión 1990-05-29 · año', a.parts.year.value, 1);
  t.is('Misión 1990-05-29 · suma', a.sum, 17);

  // 2000-01-01 → 1 · 1 · 2000→2 · suma 4
  t.is('Misión 2000-01-01', lifeMissionNumber('2000-01-01').number, 4);

  // 1988-11-22 → día 22 · mes 11 · año 1988→26→8 · suma 41 → 5
  const b = lifeMissionNumber('1988-11-22');
  t.is('Misión 1988-11-22 (día y mes maestros)', b.number, 5);
  t.is('Misión 1988-11-22 · suma', b.sum, 41);

  // 1975-12-03 → día 3 · mes 12→3 · año 1975→22 · suma 28 → 10 → 1
  t.is('Misión 1975-12-03 (año maestro)', lifeMissionNumber('1975-12-03').number, 1);

  // 1980-02-29 → día 29→11 · mes 2 · año 1980→18→9 · suma 22 → maestro
  const c = lifeMissionNumber('1980-02-29');
  t.is('Misión 1980-02-29 → 22', c.number, 22);
  t.is('Misión 1980-02-29 es maestro', c.isMaster, true);

  // Un objeto Date local debe dar lo mismo que su string ISO.
  t.is(
    'Misión acepta Date',
    lifeMissionNumber(new Date(1990, 4, 29)).number,
    lifeMissionNumber('1990-05-29').number,
  );
}

function testDayNumber(t) {
  // 2026-07-27 → 2+7 + 0+7 + 2+0+2+6 = 26 → 8
  t.is('Día 2026-07-27', dayNumber('2026-07-27').number, 8);
  t.is('Día 2026-07-27 · suma', dayNumber('2026-07-27').sum, 26);

  // 2025-01-01 → 1 + 1 + 9 = 11 → maestro
  t.is('Día 2025-01-01 → 11', dayNumber('2025-01-01').number, 11);

  // 2024-12-31 → 4 + 3 + 8 = 15 → 6
  t.is('Día 2024-12-31', dayNumber('2024-12-31').number, 6);
}

function testPersonalDay(t) {
  // 7 + 8 + 8 = 23 → 5
  t.is('Personal 7+8+8', personalDayNumber({ expression: 7, lifeMission: 8, day: 8 }).number, 5);

  // Maestros que se suman: 11 + 22 + 11 = 44 → 8
  t.is('Personal 11+22+11', personalDayNumber({ expression: 11, lifeMission: 22, day: 11 }).number, 8);

  // Lectura completa: Ana · 1990-05-29 · 2026-07-27 → 7 + 8 + 8 = 23 → 5
  const ana = castOracle({ name: 'Ana', birthDate: '1990-05-29', date: '2026-07-27' });
  t.is('castOracle Ana · expresión', ana.expression.number, 7);
  t.is('castOracle Ana · misión', ana.lifeMission.number, 8);
  t.is('castOracle Ana · día', ana.day.number, 8);
  t.is('castOracle Ana · personal', ana.personal.number, 5);
  t.is('castOracle Ana · atajo .number', ana.number, 5);
  t.is('castOracle Ana · dateKey', ana.dateKey, '2026-07-27');
  t.is('castOracle conserva el nombre con tilde', castOracle({ name: 'José ', birthDate: '2000-01-01' }).input.name, 'José');

  // Federico · 1980-02-29 · 2025-01-01 → 11 + 22 + 11 = 44 → 8
  t.is(
    'castOracle Federico (tres maestros)',
    castOracle({ name: 'Federico', birthDate: '1980-02-29', date: '2025-01-01' }).personal.number,
    8,
  );

  // La misma persona el mismo día siempre da lo mismo.
  const once = castOracle({ name: 'Ana', birthDate: '1990-05-29', date: '2026-07-27' }).number;
  const twice = castOracle({ name: 'ana', birthDate: '1990-05-29', date: '2026-07-27' }).number;
  t.is('el cálculo es determinista y no distingue mayúsculas', once, twice);
}

function testDates(t) {
  t.is('toDateKey pasa ISO', toDateKey('2026-07-27'), '2026-07-27');
  t.is('toDateKey de un Date local', toDateKey(new Date(2026, 6, 27)), '2026-07-27');

  // La trampa clásica: `new Date('2026-01-01')` es UTC y en América cae el 31.
  // Estas dos aserciones fallarían si el módulo usara toISOString().
  t.is('medianoche local no se corre de día', toDateKey(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  t.is('las 23:30 locales no se corren de día', toDateKey(new Date(2026, 0, 1, 23, 30)), '2026-01-01');
  t.is('todayKey tiene formato YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(todayKey()), true);

  t.ok('1980-02-29 es bisiesto válido', isRealDate(1980, 2, 29));
  t.ok('1981-02-29 no existe', !isRealDate(1981, 2, 29));

  t.throws('30 de febrero lanza', () => parseDateParts('2025-02-30'), 'fecha_inexistente');
  t.throws('mes 13 lanza', () => parseDateParts('2025-13-01'), 'fecha_inexistente');
  t.throws('formato suelto lanza', () => parseDateParts('27/07/2026'), 'fecha_formato');
  t.throws('sin fecha lanza', () => parseDateParts(undefined), 'fecha_formato');
}

/**
 * El mapa de figuras tiene que ser TOTAL: cualquier suma posible de tres
 * números del oráculo debe reducir a un número que tenga arquetipo y figura.
 * El rango real es 3 (1+1+1) a 99 (33+33+33).
 */
function testCoverage(t) {
  const reachable = new Set();
  for (let sum = 3; sum <= 99; sum += 1) reachable.add(reduceNumber(sum));

  const orphans = [...reachable].filter((n) => !ORACLE_NUMBERS.includes(n));
  t.is('ninguna suma cae fuera de ORACLE_NUMBERS', orphans, []);

  const missing = ORACLE_NUMBERS.filter((n) => !ARCHETYPES[n]);
  t.is('todos los números tienen arquetipo', missing, []);

  const figures = ORACLE_NUMBERS.map((n) => ARCHETYPES[n].figure);
  t.is('cada número tiene una figura distinta', new Set(figures).size, ORACLE_NUMBERS.length);

  // Ningún arquetipo debe usar la palabra prohibida del brief editorial.
  const banned = ORACLE_NUMBERS.filter((n) =>
    /energ[íi]a|vibraci[óo]n|abundancia/i.test(`${ARCHETYPES[n].motifs.join(' ')} ${ARCHETYPES[n].tension}`),
  );
  t.is('sin clichés new age en los arquetipos', banned, []);
}

/**
 * Los textos de respaldo tienen que cumplir exactamente las mismas reglas que
 * se le exigen al modelo. Si una regla no la cumplen los textos propios, la
 * regla está mal escrita.
 */
function testFallbacks(t) {
  for (const number of ORACLE_NUMBERS) {
    const text = FALLBACK_REVELATIONS[number];
    t.ok(`hay respaldo para el ${number}`, typeof text === 'string' && text.length > 0);
    if (!text) continue;

    const words = countWords(text);
    t.ok(`respaldo ${number}: 80-150 palabras (tiene ${words})`, words >= 80 && words <= 150);
    t.is(`respaldo ${number} pasa la validación`, validateRevelation(text).ok, true);

    // Ningún texto puede nombrar a nadie: se comparte entre todos los que ese
    // día tienen ese número.
    t.ok(`respaldo ${number} termina preguntando o llamando a la acción`, /[?¿]|\.\s*$/.test(text.trim()));
  }

  t.ok('fallbackFor devuelve algo ante un número desconocido', fallbackFor(999).length > 0);

  // El validador tiene que rechazar de verdad.
  t.is('rechaza vacío', validateRevelation('').ok, false);
  t.is('rechaza corto', validateRevelation('Dos palabras.').ok, false);
  t.is('rechaza "energía"', validateRevelation(`${'palabra '.repeat(90)}energía.`).ok, false);
  t.is('rechaza "abundancia"', validateRevelation(`${'palabra '.repeat(90)}abundancia.`).ok, false);
  t.is('rechaza preámbulo de asistente', validateRevelation(`Aquí tienes ${'palabra '.repeat(90)}`).ok, false);
  t.is('rechaza texto entrecomillado', validateRevelation(`"${'palabra '.repeat(90)}"`).ok, false);
  t.is('acepta un texto correcto', validateRevelation('palabra '.repeat(100)).ok, true);

  t.is('countWords ignora espacios repetidos', countWords('  una   dos \n\n tres '), 3);
}

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

const SUITES = [
  ['Primitivas (letras y dígitos)', testPrimitives],
  ['Reducción y números maestros', testReduction],
  ['1 · Número de Expresión', testExpression],
  ['2 · Número de Misión de Vida', testLifeMission],
  ['3 · Número del Día', testDayNumber],
  ['4 · Número Personal del Día', testPersonalDay],
  ['Fechas en hora local', testDates],
  ['Cobertura de figuras y arquetipos', testCoverage],
  ['Revelaciones de respaldo y validación de voz', testFallbacks],
];

/**
 * Corre toda la batería.
 * @returns {{ passed: number, failed: number, total: number, failures: object[] }}
 */
export function runNumerologyTests({ log = true } = {}) {
  const t = createRunner();
  const start = Date.now();

  for (const [, suite] of SUITES) suite(t);

  const result = {
    passed: t.passed,
    failed: t.failures.length,
    total: t.passed + t.failures.length,
    failures: t.failures,
    ms: Date.now() - start,
  };

  if (log) report(result);
  return result;
}

function report({ passed, failed, total, failures, ms }) {
  const ok = failed === 0;
  const headline = `${ok ? '✓' : '✗'} numerología — ${passed}/${total} tests en ${ms}ms`;

  if (IN_BROWSER) {
    const style = `color:${ok ? '#9ad6a0' : '#e58b8b'};font-weight:600`;
    console.log(`%c${headline}`, style);
    if (!ok) console.table(failures);
  } else {
    console.log(headline);
    if (!ok) {
      for (const f of failures) {
        console.log(`  ✗ ${f.label}\n      esperado: ${f.esperado}\n      obtenido: ${f.obtenido}`);
      }
    }
  }
}

export default runNumerologyTests;
