/**
 * reveal.js — El texto que se revela palabra por palabra.
 *
 * Decisión de accesibilidad: el texto completo está en el DOM desde el primer
 * instante y solo se anima su opacidad. Un lector de pantalla lo lee entero de
 * una vez, y se puede seleccionar y copiar aunque la animación siga corriendo.
 * Un efecto de máquina de escribir que va agregando caracteres al DOM no
 * permite nada de eso.
 *
 * Se anima por palabra, no por letra: a este ritmo el ojo lee palabras enteras,
 * y letra por letra sobre 100 palabras daría o una espera eterna o un temblor.
 */

import { gsap } from '../lib/gsap.js';
import { prefersReducedMotion } from '../scene/quality.js';

/**
 * Parte el texto en párrafos y palabras envueltas en <span>.
 * @returns {HTMLElement[]} los spans de palabra, en orden de lectura
 */
function typeset(container, text) {
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const words = [];
  const nodes = paragraphs.map((block) => {
    const p = document.createElement('p');
    p.className = 'revelation__paragraph';

    for (const word of block.split(/\s+/)) {
      const span = document.createElement('span');
      span.className = 'revelation__word';
      span.textContent = word;
      p.append(span, document.createTextNode(' '));
      words.push(span);
    }
    return p;
  });

  container.replaceChildren(...nodes);
  return words;
}

/**
 * Escribe el texto en el contenedor y lo revela.
 *
 * @param {HTMLElement} container
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.stagger=0.035]  segundos entre palabra y palabra
 * @returns {Promise<void>}
 */
export function revealText(container, text, { stagger = 0.035 } = {}) {
  const words = typeset(container, text);

  if (prefersReducedMotion()) {
    gsap.set(words, { opacity: 1, y: 0, filter: 'none' });
    return Promise.resolve();
  }

  gsap.set(words, { opacity: 0, y: 8, filter: 'blur(5px)' });

  return new Promise((resolve) => {
    gsap.to(words, {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.85,
      // Un texto largo no puede tardar el triple que uno corto: el paso entre
      // palabras se acorta a medida que crece el texto, y el total queda
      // siempre entre unos 4 y 7 segundos.
      stagger: Math.min(stagger, 5 / Math.max(words.length, 1)),
      ease: 'power2.out',
      onComplete: resolve,
    });
  });
}

/** Muestra el texto ya revelado, sin animación. Lo usa el estado "ya consultaste". */
export function showText(container, text) {
  const words = typeset(container, text);
  gsap.set(words, { opacity: 1, y: 0, filter: 'none' });
}
