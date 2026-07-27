/**
 * lab.js — Punto de entrada del laboratorio visual.
 *
 * Esta página existe para validar la base antes de construir el producto:
 *
 *   · que el campo de partículas se mueva de forma orgánica y sostenga 60fps,
 *   · que las doce figuras se dibujen y roten como corresponde,
 *   · que el núcleo numerológico dé los números correctos.
 *
 * Todo el núcleo queda colgado de `window.Oraculo` para poder hurgar desde la
 * consola: `Oraculo.cast({ name: 'Ana', birthDate: '1990-05-29' })`.
 */

import { gsap } from './lib/gsap.js';
import { OracleScene, isWebGLAvailable } from './scene/OracleScene.js';
import { ARCHETYPES } from './core/archetypes.js';
import { ORACLE_NUMBERS, castOracle } from './core/numerology.js';
import { logCast, setDebug } from './core/debug.js';
import { runNumerologyTests } from './tests/numerology.test.js';

/* ------------------------------------------------------------------ */
/* API de consola                                                      */
/* ------------------------------------------------------------------ */

/**
 * Calcula una lectura y la vuelca en consola de una sola vez.
 * Fuerza la depuración: si alguien llama a esto a mano, quiere ver los números.
 */
function cast(input) {
  const previous = setDebug(true);
  const result = castOracle(input);
  logCast(result);
  setDebug(previous);
  return result;
}

window.Oraculo = {
  cast,
  castOracle,
  test: runNumerologyTests,
  setDebug,
  ARCHETYPES,
  ORACLE_NUMBERS,
};

/* ------------------------------------------------------------------ */
/* Escena                                                              */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('scene');
const chipsEl = document.getElementById('chips');
const statsEl = document.getElementById('stats');
const resultEl = document.getElementById('test-result');

const figureEls = {
  number: document.getElementById('figure-number'),
  title: document.getElementById('figure-title'),
  key: document.getElementById('figure-key'),
  note: document.getElementById('figure-note'),
};

let scene = null;
let current = null;

/** Número inicial: `?n=7` para entrar directo a una figura. */
function initialNumber() {
  const requested = Number(new URLSearchParams(location.search).get('n'));
  return ORACLE_NUMBERS.includes(requested) ? requested : 1;
}

function renderChips(active) {
  chipsEl.replaceChildren(
    ...ORACLE_NUMBERS.map((number) => {
      const archetype = ARCHETYPES[number];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = archetype.master ? 'chip chip--master' : 'chip';
      button.textContent = String(number);
      button.title = `${number} · ${archetype.title}`;
      button.setAttribute('aria-pressed', String(number === active));
      button.addEventListener('click', () => select(number));
      return button;
    }),
  );
}

/**
 * @param {number} number
 * @param {object} [options]
 * @param {boolean} [options.updateScene=true]  false cuando la escena ya
 *   arrancó con ese número y solo hay que poner al día la interfaz.
 */
function applyNumber(number, { updateScene = true } = {}) {
  current = number;

  const archetype = ARCHETYPES[number];
  if (updateScene) scene?.setFigure(number);

  for (const chip of chipsEl.children) {
    chip.setAttribute('aria-pressed', String(Number(chip.textContent) === number));
  }

  figureEls.number.textContent = String(number);
  figureEls.title.textContent = archetype.title;
  figureEls.key.textContent = `${archetype.figure}${archetype.master ? ' · maestro' : ''}`;
  figureEls.note.textContent = archetype.tension;

  // La ficha entra desde abajo con un desenfoque mínimo: es la misma
  // transición que va a usar la revelación, probada en chico.
  gsap.fromTo(
    [figureEls.number, figureEls.title, figureEls.key, figureEls.note],
    { opacity: 0, y: 14, filter: 'blur(6px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.06, ease: 'power3.out' },
  );

  history.replaceState(null, '', `?n=${number}`);
}

function select(number) {
  if (number !== current) applyNumber(number);
}

function refreshStats() {
  if (!scene) return;
  const stats = scene.stats;
  for (const [key, value] of Object.entries(stats)) {
    const el = statsEl.querySelector(`[data-stat="${key}"]`);
    if (!el) continue;
    el.textContent = typeof value === 'boolean' ? (value ? 'sí' : 'no') : String(value);
  }
  const fpsEl = statsEl.querySelector('[data-stat="fps"]');
  fpsEl.dataset.state = stats.fps < 50 ? 'warn' : '';
}

/* ------------------------------------------------------------------ */
/* Tests desde la interfaz                                             */
/* ------------------------------------------------------------------ */

document.getElementById('run-tests').addEventListener('click', () => {
  const { passed, total, failed } = runNumerologyTests();
  resultEl.textContent = failed === 0 ? `✓ ${passed}/${total} tests` : `✗ ${failed} fallando — ver consola`;
  resultEl.dataset.state = failed === 0 ? 'ok' : 'fail';
});

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

async function boot() {
  const start = initialNumber();
  renderChips(start);

  if (!isWebGLAvailable()) {
    document.body.classList.add('no-webgl');
    resultEl.textContent = 'Sin WebGL en este navegador.';
    resultEl.dataset.state = 'fail';
    applyNumber(start, { updateScene: false });
    return;
  }

  // `?q=high|medium|low` fuerza el nivel de calidad: es la única forma de ver
  // los tres perfiles (y el camino con bloom) sin cambiar de dispositivo.
  const forced = new URLSearchParams(location.search).get('q');
  const quality = ['high', 'medium', 'low'].includes(forced) ? forced : undefined;

  // La figura se levanta un poco para no pisar el pie de figura ni el panel.
  scene = new OracleScene(canvas, { figure: start, figureOffsetY: 0.55, quality });
  await scene.init();
  scene.start().reveal();

  // La escena ya construyó la figura inicial en `init`, así que acá solo se
  // sincroniza la interfaz: pedirle un `setFigure` sería crear la misma figura
  // dos veces y hacerlas atravesarse en un fundido innecesario.
  applyNumber(start, { updateScene: false });

  setInterval(refreshStats, 500);
  window.Oraculo.scene = scene;

  // `?test=1` corre la batería sola al cargar — útil para revisar en el
  // teléfono, donde abrir la consola es incómodo.
  if (new URLSearchParams(location.search).has('test')) {
    document.getElementById('run-tests').click();
  }
}

boot().catch((error) => {
  console.error('[oráculo] la escena no pudo iniciarse:', error);
  document.body.classList.add('no-webgl');
  resultEl.textContent = 'La escena no pudo iniciarse — ver consola.';
  resultEl.dataset.state = 'fail';
});
