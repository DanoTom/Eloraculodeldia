/**
 * scripts/run-tests.mjs — Corre los tests del núcleo en Node y devuelve el
 * código de salida correcto para CI.
 *
 * Es el mismo archivo de tests que se puede ejecutar en la consola del
 * navegador con `Oraculo.test()`; acá solo se le pone un exit code.
 */

import { runNumerologyTests } from '../public/js/tests/numerology.test.js';

const { failed } = runNumerologyTests();
process.exit(failed === 0 ? 0 : 1);
