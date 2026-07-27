/**
 * lib/gsap.js — Puente entre el build UMD de GSAP y los módulos ES.
 *
 * GSAP se sirve como un solo archivo UMD (/vendor/gsap/gsap.min.js) que deja
 * `window.gsap`. El importmap apunta el especificador "gsap" a este archivo,
 * así que el resto del código escribe `import { gsap } from 'gsap'` sin
 * enterarse de nada.
 *
 * El <script> clásico corre antes que cualquier módulo (los módulos son
 * diferidos por definición), de modo que para cuando esto se evalúa, GSAP ya
 * está en su lugar.
 */

const gsap = globalThis.gsap;

if (!gsap) {
  throw new Error(
    'GSAP no está cargado. Falta <script src="/vendor/gsap/gsap.min.js"> antes de los módulos ' +
      '(o hay que correr `npm run vendor`).',
  );
}

export { gsap };
export default gsap;
