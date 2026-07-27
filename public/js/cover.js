/**
 * cover.js — Portada.
 *
 * Muestra la figura correspondiente al Número del Día de HOY: el mismo número
 * para todo el mundo, sin pedir nada a cambio. Es el anticipo del producto —
 * el número personal, que necesita nombre y fecha, es el que llega después.
 */

import { gsap } from './lib/gsap.js';
import { OracleScene, isWebGLAvailable } from './scene/OracleScene.js';
import { ARCHETYPES } from './core/archetypes.js';
import { dayNumber } from './core/numerology.js';
import { debugLog } from './core/debug.js';
import { formatShortDate, todayKey } from './core/dates.js';

const today = todayKey();
const day = dayNumber(today);
const archetype = ARCHETYPES[day.number];

debugLog(`[oráculo] Número del Día ${today}: ${day.steps.join(' → ')} → ${day.number}`);

document.getElementById('day-number').textContent = String(day.number);
document.getElementById('day-label').textContent = `${archetype.title} · ${formatShortDate(today)}`;

const enters = document.querySelectorAll('[data-enter]');

async function boot() {
  if (!isWebGLAvailable()) {
    document.body.classList.add('no-webgl');
    return;
  }

  const scene = new OracleScene(document.getElementById('scene'), {
    figure: day.number,
    // El texto de la portada ocupa la mitad inferior, así que la figura sube y
    // se achica para quedarse íntegra en la mitad de arriba.
    figureOffsetY: 1.05,
    figureScale: 0.78,
  });
  await scene.init();
  scene.start().reveal({ duration: 3.2 });
  window.Oraculo = { scene };
}

// La escena y el texto entran en paralelo: el texto no espera a que WebGL esté
// listo, así que si la GPU tarda (o falla), la portada sigue siendo legible.
boot().catch((error) => {
  console.error('[oráculo] la escena no pudo iniciarse:', error);
  document.body.classList.add('no-webgl');
});

gsap.to(enters, {
  opacity: 1,
  y: 0,
  duration: 1.4,
  delay: 0.35,
  stagger: 0.16,
  ease: 'power3.out',
  startAt: { y: 18 },
});
