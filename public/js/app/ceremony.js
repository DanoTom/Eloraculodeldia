/**
 * ceremony.js — La descomposición del nombre.
 *
 * Seis actos, encadenados en una sola línea de tiempo de GSAP:
 *
 *   1. El nombre aparece letra por letra.
 *   2. Cada letra gira sobre su eje y vuelve convertida en su número.
 *   3. Los números se dispersan y flotan.
 *   4. Se reúnen en el centro y se funden en el Número de Expresión.
 *   5. Aparecen los tres números —Expresión, Misión de Vida, Día—.
 *   6. Los tres colapsan en el Número Personal del Día.
 *
 * Dura unos siete segundos, y esa duración no es decorativa: es el tiempo que
 * tarda la llamada a la IA. La ceremonia no es una pantalla de carga disfrazada
 * —ocurriría igual sin red— pero está calibrada para que la espera quede
 * escondida adentro del rito.
 *
 * Con `prefers-reduced-motion` los seis actos se comprimen en un fundido de un
 * segundo: se ve el mismo resultado, sin nada girando.
 *
 * La animación es DOM + CSS, no three.js. El texto tiene que ser nítido,
 * seleccionable y legible por un lector de pantalla; un canvas no da nada de eso.
 */

import { gsap } from '../lib/gsap.js';
import { prefersReducedMotion } from '../scene/quality.js';

const CAPTIONS = {
  name: 'tu nombre',
  values: 'cada letra guarda un número',
  expression: 'lo que tu nombre pronuncia',
  triad: 'lo que trajiste, y lo que hoy pesa en el aire',
  personal: 'tu número de hoy',
};

const TRIAD_LABELS = [
  ['expression', 'Expresión'],
  ['lifeMission', 'Misión de Vida'],
  ['day', 'Día'],
];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

export class Ceremony {
  /**
   * @param {object} nodes
   * @param {HTMLElement} nodes.field     contenedor de las letras y los números
   * @param {HTMLElement} nodes.caption   línea de texto que acompaña cada acto
   */
  constructor({ field, caption }) {
    this.field = field;
    this.caption = caption;
    this.timeline = null;
  }

  /**
   * Corre la ceremonia completa.
   *
   * @param {object} cast  el resultado de castOracle()
   * @param {object} [hooks]
   * @param {(number: number) => void} [hooks.onPersonalNumber]  se dispara justo
   *   cuando el número final aterriza, para que la escena 3D transmute a la vez.
   * @returns {Promise<void>}  se resuelve cuando termina
   *
   * PRECONDICIÓN: la pantalla de la ceremonia ya tiene que estar visible. El
   * primer paso mide posiciones con getBoundingClientRect, y sobre un elemento
   * con `display: none` todas las medidas son cero.
   */
  play(cast, { onPersonalNumber } = {}) {
    this._build(cast);

    return new Promise((resolve) => {
      this.timeline = prefersReducedMotion()
        ? this._reducedTimeline(cast, onPersonalNumber)
        : this._fullTimeline(cast, onPersonalNumber);
      this.timeline.eventCallback('onComplete', resolve);
    });
  }

  /** Salta al final. Lo usa el botón de omitir y cualquier interrupción. */
  skip() {
    this.timeline?.progress(1);
  }

  /**
   * Sostiene la espera cuando la ceremonia termina antes que el texto.
   *
   * Pasa en dos casos reales: con `prefers-reduced-motion` la animación dura un
   * segundo, y en una red lenta el modelo puede tardar más que los siete
   * segundos del rito. Sin esto, el número se queda quieto en la pantalla sin
   * que nada indique que todavía falta algo.
   */
  hold(text = 'el texto todavía se está formando') {
    // Se escribe directo, sin el fundido de `_say`: la clase `is-waiting` trae
    // una animación CSS sobre la opacidad, y las animaciones CSS le ganan al
    // estilo en línea que escribe GSAP. Encadenar las dos solo haría que el
    // texto cambiara a destiempo.
    gsap.killTweensOf(this.caption);
    this.caption.textContent = text;
    this.caption.classList.add('is-waiting');
  }

  /** Deshace `hold`. */
  release() {
    this.caption.classList.remove('is-waiting');
    gsap.set(this.caption, { opacity: 1 });
  }

  destroy() {
    this.timeline?.kill();
    this.timeline = null;
    this.field.replaceChildren();
    this.caption.textContent = '';
  }

  /* ---------------------------------------------------------------- */
  /* Construcción del DOM                                              */
  /* ---------------------------------------------------------------- */

  _build(cast) {
    const { letters } = cast.expression;

    // Los nombres largos tienen que entrar igual en un teléfono: el tamaño de
    // los glifos baja con la cantidad de letras.
    this.field.style.setProperty('--glyph-count', String(letters.length));

    this.glyphs = letters.map(({ char, value }) => {
      const glyph = el('span', 'glyph');
      glyph.append(el('span', 'glyph__face glyph__face--letter', char));
      glyph.append(el('span', 'glyph__face glyph__face--value', value));
      return glyph;
    });

    this.row = el('div', 'ceremony__row');
    this.row.append(...this.glyphs);

    this.tokens = TRIAD_LABELS.map(([key, label]) => {
      const token = el('div', 'token');
      token.append(el('span', 'token__number', cast[key].number));
      token.append(el('span', 'token__label', label));
      return token;
    });

    this.triad = el('div', 'ceremony__triad');
    this.triad.append(...this.tokens);

    this.expressionNode = el('div', 'ceremony__sum', cast.expression.number);
    this.personalNode = el('div', 'ceremony__final', cast.personal.number);
    if (cast.personal.isMaster) this.personalNode.classList.add('is-master');

    this.field.replaceChildren(this.row, this.expressionNode, this.triad, this.personalNode);

    this.letterFaces = this.glyphs.map((g) => g.querySelector('.glyph__face--letter'));
    this.valueFaces = this.glyphs.map((g) => g.querySelector('.glyph__face--value'));

    // Se mide ANTES de tocar nada. El orden importa: `gsap.set` de más abajo
    // aplica transformaciones, y una vez aplicadas getBoundingClientRect ya no
    // devuelve la posición natural en el layout, que es la que hace falta.
    this._measureConvergence();

    gsap.set(this.glyphs, { opacity: 0, y: 26, rotationX: -60 });
    gsap.set(this.valueFaces, { opacity: 0, rotationX: 90 });
    gsap.set([this.expressionNode, this.personalNode], { opacity: 0, scale: 0.6 });
    gsap.set(this.tokens, { opacity: 0, y: 18 });
    gsap.set(this.triad, { opacity: 0 });
  }

  /**
   * Distancia de cada elemento al centro del campo, medida SIN transformaciones
   * aplicadas.
   *
   * Se hace una sola vez y se guarda: `x`/`y` de GSAP son relativos a la
   * posición natural en el layout, que no cambia, así que estos números siguen
   * valiendo aunque en el momento de converger el elemento esté desplazado y
   * rotado por el acto anterior. Medir en caliente daría el destino equivocado.
   */
  _measureConvergence() {
    const field = this.field.getBoundingClientRect();
    const cx = field.left + field.width / 2;
    const cy = field.top + field.height / 2;

    const store = (node) => {
      const rect = node.getBoundingClientRect();
      node._toCenter = {
        x: cx - (rect.left + rect.width / 2),
        y: cy - (rect.top + rect.height / 2),
      };
    };

    this.glyphs.forEach(store);
    this.tokens.forEach(store);
  }

  _say(text) {
    return () => {
      gsap.to(this.caption, {
        opacity: 0,
        duration: 0.25,
        onComplete: () => {
          this.caption.textContent = text;
          gsap.to(this.caption, { opacity: 1, duration: 0.45 });
        },
      });
    };
  }

  /* ---------------------------------------------------------------- */
  /* Línea de tiempo completa                                          */
  /* ---------------------------------------------------------------- */

  _fullTimeline(cast, onPersonalNumber) {
    const tl = gsap.timeline();
    const glyphs = this.glyphs;

    // ACTO 1 — el nombre se escribe solo.
    tl.call(this._say(CAPTIONS.name));
    tl.to(glyphs, {
      opacity: 1,
      y: 0,
      rotationX: 0,
      duration: 0.7,
      stagger: 0.055,
      ease: 'power3.out',
    });

    // ACTO 2 — cada letra gira y vuelve hecha número.
    tl.call(this._say(CAPTIONS.values), null, '+=0.25');
    tl.to(this.letterFaces, {
      opacity: 0,
      rotationX: -90,
      duration: 0.45,
      stagger: 0.05,
      ease: 'power2.in',
    }, '>-0.1');
    tl.to(this.valueFaces, {
      opacity: 1,
      rotationX: 0,
      duration: 0.45,
      stagger: 0.05,
      ease: 'power2.out',
    }, '<0.12');

    // ACTO 3 — los números se sueltan y flotan.
    tl.to(
      glyphs,
      {
        x: () => gsap.utils.random(-70, 70),
        y: () => gsap.utils.random(-52, 52),
        rotation: () => gsap.utils.random(-22, 22),
        scale: () => gsap.utils.random(0.86, 1.16),
        duration: 1.15,
        stagger: { each: 0.03, from: 'random' },
        ease: 'sine.inOut',
      },
      '+=0.2',
    );

    // ACTO 4 — se reúnen y se funden en el Número de Expresión.
    tl.to(
      glyphs,
      {
        x: (i, node) => node._toCenter.x,
        y: (i, node) => node._toCenter.y,
        rotation: 0,
        scale: 0.35,
        opacity: 0,
        duration: 0.85,
        stagger: { each: 0.018, from: 'edges' },
        ease: 'power2.inOut',
      },
      '+=0.15',
    );
    tl.call(this._say(CAPTIONS.expression), null, '<0.35');
    tl.to(this.expressionNode, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }, '>-0.3');

    // ACTO 5 — los tres números se ponen en fila.
    tl.call(this._say(CAPTIONS.triad), null, '+=0.35');
    tl.to(this.expressionNode, { opacity: 0, scale: 0.8, duration: 0.4, ease: 'power2.in' }, '<');
    tl.set(this.triad, { opacity: 1 });
    tl.to(this.tokens, { opacity: 1, y: 0, duration: 0.55, stagger: 0.12, ease: 'power3.out' }, '>-0.1');

    // ACTO 6 — colapsan en el número personal.
    tl.to(
      this.tokens,
      {
        x: (i, node) => node._toCenter.x,
        y: (i, node) => node._toCenter.y,
        scale: 0.4,
        opacity: 0,
        duration: 0.8,
        stagger: 0.05,
        ease: 'power2.inOut',
      },
      '+=0.7',
    );
    tl.call(this._say(CAPTIONS.personal), null, '<0.4');
    tl.call(() => onPersonalNumber?.(cast.personal.number), null, '<0.15');
    tl.to(this.personalNode, { opacity: 1, scale: 1, duration: 0.9, ease: 'back.out(1.5)' }, '>-0.35');
    tl.to({}, { duration: 0.7 }); // un respiro antes de la revelación

    return tl;
  }

  /* ---------------------------------------------------------------- */
  /* Versión con movimiento reducido                                   */
  /* ---------------------------------------------------------------- */

  _reducedTimeline(cast, onPersonalNumber) {
    // Nada gira, nada se dispersa: se muestra el resultado y se sigue.
    gsap.set([this.row, this.triad, this.expressionNode], { display: 'none' });

    const tl = gsap.timeline();
    tl.call(this._say(CAPTIONS.personal));
    tl.call(() => onPersonalNumber?.(cast.personal.number));
    tl.to(this.personalNode, { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' });
    tl.to({}, { duration: 0.4 });
    return tl;
  }
}
