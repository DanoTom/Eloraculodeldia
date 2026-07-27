/**
 * holdToClose.js — Mantener presionado para cerrar el velo.
 *
 * No es un botón: es un gesto. Cerrar borra la revelación para siempre, y un
 * clic suelto es demasiado barato para una acción que no se puede deshacer. Hay
 * que sostener el dedo mientras un arco dorado completa el círculo — la figura
 * que se cierra es la misma idea que el acto.
 *
 * ACCESIBILIDAD
 * Un gesto de mantener presionado deja afuera a mucha gente, así que hay tres
 * caminos al mismo resultado:
 *   · puntero  — pointerdown/up (mouse, tacto y lápiz con el mismo código),
 *   · teclado  — Espacio o Enter sostenidos hacen exactamente lo mismo,
 *   · directo  — un `click` que no vino de un puntero (tecnología de asistencia,
 *                control por voz) cierra en el acto, sin sostener nada.
 *
 * Con `prefers-reduced-motion` no hay arco ni espera: un clic alcanza.
 */

import { gsap } from '../lib/gsap.js';
import { prefersReducedMotion } from '../scene/quality.js';

/** Cuánto hay que sostener. Suficiente para ser deliberado, no tanto como para irritar. */
const HOLD_SECONDS = 1.15;

/**
 * Margen en píxeles antes de considerar que el dedo se fue del botón.
 * Sostener un dedo quieto sobre una pantalla igual se mueve unos píxeles; sin
 * este margen, el temblor normal de la mano abortaría el gesto.
 */
const STRAY_SLOP = 26;

export class HoldToClose {
  /**
   * @param {HTMLElement} button   el elemento que se sostiene
   * @param {SVGCircleElement} arc el círculo que se completa
   * @param {() => void} onComplete
   */
  constructor(button, arc, onComplete) {
    this.button = button;
    this.arc = arc;
    this.onComplete = onComplete;
    this.tween = null;
    this.fromPointer = false;
    this.done = false;

    // La longitud real del trazo depende del radio, que puede venir de CSS.
    // Medirla es más robusto que calcular 2πr con un radio escrito a mano.
    const length = arc.getTotalLength();
    gsap.set(arc, { strokeDasharray: length, strokeDashoffset: length });
    this.length = length;

    this._bind();
  }

  _bind() {
    const b = this.button;

    b.addEventListener('pointerdown', (event) => {
      // Solo el botón principal; un clic derecho no debería empezar nada.
      if (event.button !== 0) return;
      this.fromPointer = true;

      // El orden importa: primero arrancar, después capturar.
      // `setPointerCapture` dispara pointerout/pointerleave DE FORMA SINCRÓNICA
      // sobre el elemento anterior, así que capturar antes de arrancar deja el
      // gesto a merced de esos eventos.
      this.start();
      b.setPointerCapture?.(event.pointerId);
    });

    // Con captura de puntero, `pointerup` y `pointercancel` llegan a este botón
    // aunque el dedo se haya ido a otra parte de la pantalla. Justamente por eso
    // NO se escucha `pointerleave`: con captura no significa "se fue", y el que
    // dispara la propia captura cancelaría el gesto en el mismo instante en que
    // empieza.
    for (const type of ['pointerup', 'pointercancel']) {
      b.addEventListener(type, () => this.cancel());
    }

    // Alejar el dedo sí tiene que abortar — es la escapatoria natural de quien
    // se arrepiente a mitad del gesto. Como pointerleave no sirve acá, se mide.
    b.addEventListener('pointermove', (event) => {
      if (!this.tween) return;
      const r = b.getBoundingClientRect();
      const strayed =
        event.clientX < r.left - STRAY_SLOP ||
        event.clientX > r.right + STRAY_SLOP ||
        event.clientY < r.top - STRAY_SLOP ||
        event.clientY > r.bottom + STRAY_SLOP;
      if (strayed) this.cancel();
    });

    // Teclado: mismo modelo. `repeat` evita reiniciar el arco mientras la tecla
    // sigue apretada y el sistema manda eventos repetidos.
    b.addEventListener('keydown', (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (event.repeat) return;
      event.preventDefault();
      this.fromPointer = true;
      this.start();
    });
    b.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') this.cancel();
    });
    b.addEventListener('blur', () => this.cancel());

    // Salida directa: si llegó un `click` sin que nadie haya tocado ni tecleado,
    // vino de tecnología de asistencia. Ahí no hay gesto que sostener.
    b.addEventListener('click', () => {
      if (this.fromPointer || this.done) return;
      this.complete();
    });
  }

  start() {
    if (this.done) return;

    if (prefersReducedMotion()) {
      this.complete();
      return;
    }

    this.button.classList.add('is-holding');
    this.tween = gsap.to(this.arc, {
      strokeDashoffset: 0,
      duration: HOLD_SECONDS,
      ease: 'none',
      onComplete: () => this.complete(),
    });
  }

  cancel() {
    if (this.done || !this.tween) return;
    this.button.classList.remove('is-holding');

    // Matar PRIMERO y recién después animar la vuelta, con overwrite: si los dos
    // tweens conviven un instante sobre la misma propiedad, se pelean.
    this.tween.kill();
    this.tween = null;

    // Vuelve atrás más rápido de lo que avanzó: soltar tiene que sentirse como
    // un alivio inmediato, no como otra espera.
    gsap.to(this.arc, {
      strokeDashoffset: this.length,
      duration: 0.35,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }

  complete() {
    if (this.done) return;
    this.done = true;
    this.tween?.kill();
    this.button.classList.remove('is-holding');
    this.button.classList.add('is-sealed');
    this.button.disabled = true;
    gsap.set(this.arc, { strokeDashoffset: 0 });
    this.onComplete();
  }

  destroy() {
    this.tween?.kill();
  }
}
