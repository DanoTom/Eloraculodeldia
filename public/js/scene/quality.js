/**
 * quality.js — Decide cuánto puede pedirle la escena a este dispositivo.
 *
 * La meta declarada es 60fps también en móvil. Se ataca por dos vías:
 *
 *   1. Un perfil INICIAL conservador, deducido de lo que el navegador cuenta
 *      sobre sí mismo (tamaño de pantalla, núcleos, memoria, tipo de puntero).
 *   2. Un degradado AUTOMÁTICO en caliente: `FrameGuard` mide el tiempo real de
 *      cuadro y baja el perfil si la cosa se pone lenta. Ninguna heurística a
 *      priori le gana a medir.
 *
 * `prefers-reduced-motion` no es una preferencia de rendimiento sino de
 * accesibilidad: se respeta siempre, aunque la máquina sobre.
 */

/** @typedef {'high'|'medium'|'low'} Tier */

/** Presupuesto de cada nivel. */
export const TIERS = Object.freeze({
  high: { particles: 9000, maxPixelRatio: 2, bloom: true, particleSize: 9, nodeSize: 5.5 },
  medium: { particles: 4500, maxPixelRatio: 1.75, bloom: true, particleSize: 8.5, nodeSize: 5 },
  low: { particles: 1800, maxPixelRatio: 1.5, bloom: false, particleSize: 8, nodeSize: 4.5 },
});

const ORDER = ['high', 'medium', 'low'];

const query = (mediaQuery) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(mediaQuery).matches
    : false;

export const prefersReducedMotion = () => query('(prefers-reduced-motion: reduce)');

/**
 * Perfil inicial. Móvil o máquina modesta arrancan en `low`: es preferible
 * subir después de comprobar que rinde a arrancar lindo y trabarse en la
 * primera animación, que es justo el momento que el usuario está mirando.
 */
export function detectQuality() {
  if (typeof window === 'undefined') return buildProfile('medium');

  const width = window.innerWidth;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4; // solo en Chromium; 4 es un punto medio razonable
  const coarsePointer = query('(pointer: coarse)');

  let tier = 'high';
  if (coarsePointer || width < 900) tier = 'medium';
  if (width < 640 || cores <= 4 || memory <= 4) tier = 'low';

  return buildProfile(tier);
}

function buildProfile(tier) {
  const reduced = prefersReducedMotion();
  return {
    tier,
    ...TIERS[tier],
    // Con movimiento reducido: casi sin deriva, sin titileo y rotación mínima.
    reducedMotion: reduced,
    motionScale: reduced ? 0.15 : 1,
    twinkle: reduced ? 0 : 1,
    devicePixelRatio: Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      TIERS[tier].maxPixelRatio,
    ),
  };
}

/** El nivel inmediatamente inferior, o null si ya estamos abajo de todo. */
export function nextTierDown(tier) {
  const index = ORDER.indexOf(tier);
  return index >= 0 && index < ORDER.length - 1 ? ORDER[index + 1] : null;
}

export { buildProfile };

/**
 * Vigilante de rendimiento.
 *
 * Mantiene una media móvil del tiempo de cuadro. Si se sostiene por encima del
 * umbral durante suficientes cuadros seguidos, avisa una vez y se toma un
 * respiro antes de volver a evaluar (así una sola caída no desencadena un
 * derrumbe en cascada de calidad).
 */
export class FrameGuard {
  /**
   * @param {object} [options]
   * @param {number} [options.budgetMs=21]   presupuesto por cuadro (~48fps)
   * @param {number} [options.patience=90]   cuadros malos seguidos antes de bajar
   * @param {number} [options.warmup=60]     cuadros iniciales que se ignoran
   */
  constructor({ budgetMs = 21, patience = 90, warmup = 60 } = {}) {
    this.budgetMs = budgetMs;
    this.patience = patience;
    this.warmup = warmup;
    this.average = 16.7;
    this.frames = 0;
    this.strikes = 0;
  }

  /**
   * Registra un cuadro.
   * @returns {boolean} true una sola vez, cuando conviene bajar de nivel.
   */
  sample(deltaMs) {
    this.frames += 1;
    // Media exponencial: reacciona rápido pero no salta con un cuadro suelto.
    this.average += (Math.min(deltaMs, 100) - this.average) * 0.08;

    if (this.frames < this.warmup) return false;

    if (this.average > this.budgetMs) {
      this.strikes += 1;
      if (this.strikes >= this.patience) {
        this.strikes = 0;
        this.frames = 0; // nuevo período de calentamiento tras el cambio
        return true;
      }
    } else {
      this.strikes = Math.max(0, this.strikes - 2); // perdona rápido
    }

    return false;
  }

  get fps() {
    return this.average > 0 ? Math.round(1000 / this.average) : 0;
  }
}
