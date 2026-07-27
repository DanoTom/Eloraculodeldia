/**
 * app.js — El flujo del oráculo.
 *
 * Cuatro pantallas y un solo camino entre ellas:
 *
 *   umbral ──(enviás el formulario)──▶ ceremonia ──▶ revelación
 *      ▲                                                  │
 *      └────(al día siguiente)──── velo cerrado ◀──────────┘
 *
 * Lo único con algo de astucia acá es que la llamada a la IA arranca en el
 * mismo instante que la ceremonia y se espera recién al final. Los siete
 * segundos de la animación son también los siete segundos que tarda el modelo:
 * el usuario nunca ve un spinner porque nunca hay nada que esperar.
 */

import { gsap } from './lib/gsap.js';

import { ARCHETYPES } from './core/archetypes.js';
import { castOracle, dayNumber } from './core/numerology.js';
import {
  OracleInputError,
  formatShortDate,
  isRealDate,
  msUntilNextLocalMidnight,
  todayKey,
} from './core/dates.js';
import { logCast, setDebug } from './core/debug.js';
import { OracleScene, isWebGLAvailable } from './scene/OracleScene.js';
import { prefersReducedMotion } from './scene/quality.js';

import { fetchRevelation } from './app/api.js';
import { Ceremony } from './app/ceremony.js';
import { HoldToClose } from './app/holdToClose.js';
import { dissolveText, revealText, showText } from './app/reveal.js';
import {
  forget,
  isPersistent,
  readIdentity,
  readTodaysConsultation,
  saveConsultation,
  saveIdentity,
  sealConsultation,
} from './app/storage.js';

/* ------------------------------------------------------------------ */
/* Nodos                                                               */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const screens = {
  gate: $('screen-gate'),
  ceremony: $('screen-ceremony'),
  revelation: $('screen-revelation'),
  locked: $('screen-locked'),
};

const form = $('oracle-form');
const nameInput = $('field-name');
const daySelect = $('field-day');
const monthSelect = $('field-month');
const yearSelect = $('field-year');
const errorEl = $('form-error');
const submitButton = $('submit');

/**
 * Encuadre de la escena 3D en cada pantalla.
 *
 * Cuando hay que leer, la figura se corre atrás; cuando el número aterriza, se
 * adueña de la pantalla. Es la escenografía moviéndose con el relato.
 */
const FRAMING = {
  gate: { opacity: 0.3, offsetY: 0.25, scale: 1.15 },
  ceremony: { opacity: 0.16, offsetY: 0.1, scale: 1.3 },
  climax: { opacity: 0.9, offsetY: 0.1, scale: 1.05 },
  // La revelación es un texto largo: la figura baja a puro fondo. Correrla hacia
  // arriba no alcanzaba —ahí está el número y el arquetipo en versalitas, y las
  // líneas doradas los volvían ilegibles—, así que se queda centrada y tenue.
  revelation: { opacity: 0.15, offsetY: 0, scale: 1.2 },
  locked: { opacity: 0.5, offsetY: 0.3, scale: 0.95 },
};

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

let scene = null;
let ceremony = null;
let countdownTimer = null;
let busy = false;

/* ------------------------------------------------------------------ */
/* Pantallas                                                           */
/* ------------------------------------------------------------------ */

function showScreen(name, { animate = true } = {}) {
  for (const [key, node] of Object.entries(screens)) {
    if (key !== name) node.hidden = true;
  }

  const target = screens[name];
  target.hidden = false;

  if (scene && FRAMING[name]) {
    const { opacity, offsetY, scale } = FRAMING[name];
    scene.setFigureOpacity(opacity, { duration: 1.2 });
    scene.setFraming({ offsetY, scale, duration: 1.2 });
  }

  if (animate) {
    gsap.fromTo(
      target,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Formulario                                                          */
/* ------------------------------------------------------------------ */

function option(value, label, { selected = false, disabled = false } = {}) {
  const node = document.createElement('option');
  node.value = String(value);
  node.textContent = label;
  node.selected = selected;
  node.disabled = disabled;
  return node;
}

/**
 * Tres selects en vez de `<input type="date">`.
 *
 * El control nativo se ve distinto en cada sistema, ignora casi todo el CSS y
 * en escritorio obliga a navegar un calendario para llegar a 1978. Tres listas
 * se ven iguales en todos lados, se completan con el teclado y entran en la
 * identidad visual.
 */
function buildDateSelects() {
  const currentYear = new Date().getFullYear();

  daySelect.replaceChildren(
    option('', 'Día', { selected: true, disabled: true }),
    ...Array.from({ length: 31 }, (_, i) => option(i + 1, String(i + 1))),
  );

  monthSelect.replaceChildren(
    option('', 'Mes', { selected: true, disabled: true }),
    ...MONTHS.map((label, i) => option(i + 1, label)),
  );

  yearSelect.replaceChildren(
    option('', 'Año', { selected: true, disabled: true }),
    ...Array.from({ length: 120 }, (_, i) => {
      const year = currentYear - i;
      return option(year, String(year));
    }),
  );
}

function prefillFromIdentity() {
  const identity = readIdentity();
  if (!identity) return;

  const [year, month, day] = identity.birthDate.split('-').map(Number);
  nameInput.value = identity.name;
  daySelect.value = String(day);
  monthSelect.value = String(month);
  yearSelect.value = String(year);
}

function showError(message) {
  errorEl.textContent = message;
  gsap.fromTo(errorEl, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.3 });
}

/**
 * Lee y valida el formulario.
 * @returns {{ name: string, birthDate: string } | null}
 */
function readForm() {
  errorEl.textContent = '';

  const name = nameInput.value.trim();
  if (!name) {
    showError('El oráculo necesita tu nombre.');
    nameInput.focus();
    return null;
  }

  // Una cadena sin ninguna letra A-Z (solo dígitos o símbolos) no tiene número.
  if (!/\p{L}/u.test(name)) {
    showError('Ese nombre no tiene letras que el oráculo pueda leer.');
    nameInput.focus();
    return null;
  }

  const day = Number(daySelect.value);
  const month = Number(monthSelect.value);
  const year = Number(yearSelect.value);

  if (!day || !month || !year) {
    showError('Falta tu fecha de nacimiento completa.');
    return null;
  }

  // 30 de febrero: los tres selects son válidos por separado y la combinación no.
  if (!isRealDate(year, month, day)) {
    showError(`El ${day} de ${MONTHS[month - 1]} de ${year} no existe.`);
    return null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  return { name, birthDate: `${year}-${pad(month)}-${pad(day)}` };
}

/* ------------------------------------------------------------------ */
/* Cuenta regresiva                                                    */
/* ------------------------------------------------------------------ */

function startCountdown() {
  stopCountdown();

  const node = $('locked-countdown');
  const sr = $('locked-countdown-sr');

  const tick = () => {
    const remaining = msUntilNextLocalMidnight();

    // Cruzó la medianoche con la página abierta: el día cambió y el bloqueo ya
    // no corresponde. Se recarga y el oráculo vuelve a estar disponible.
    if (remaining <= 0) {
      location.reload();
      return;
    }

    const total = Math.floor(remaining / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n) => String(n).padStart(2, '0');

    node.textContent = `${pad(hours)} : ${pad(minutes)} : ${pad(seconds)}`;
    // Para lectores de pantalla, en palabras y sin repetir cada segundo.
    sr.textContent = `Faltan ${hours} horas y ${minutes} minutos para la próxima medianoche.`;
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

/* ------------------------------------------------------------------ */
/* Revelación                                                          */
/* ------------------------------------------------------------------ */

function paintRevelation({ name, number }) {
  const archetype = ARCHETYPES[number] ?? ARCHETYPES[1];

  $('rev-number').textContent = String(number);
  $('rev-archetype').textContent = archetype.title;
  $('rev-salutation').textContent = `${name},`;
  $('rev-seal').textContent = 'Cuando termines de leer, cierra el velo.';

  return $('rev-body');
}

/**
 * Arma el gesto de cierre y encadena lo que pasa al soltarlo.
 *
 * El orden importa: primero se sella en localStorage y recién después se anima.
 * Si alguien cierra la pestaña en mitad de la disolución, el velo ya quedó
 * cerrado; al revés, volvería a encontrarse el texto que creyó haber soltado.
 */
function armSeal(number) {
  const seal = $('seal');
  seal.hidden = false;

  // El gesto aparece con retraso, después de que el texto terminó de revelarse:
  // ofrecer "cerrar" mientras todavía se está escribiendo sería apurar la lectura.
  gsap.fromTo(seal, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.1, ease: 'power2.out' });

  // Con una revelación de cien palabras, el gesto queda abajo del pliegue: la
  // acción más importante de la pantalla no se ve. Desplazar hasta él cuando
  // aparece lo resuelve y además dice algo — terminaste de leer, esto es lo que
  // sigue.
  seal.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
  });

  return new HoldToClose($('close-veil'), $('seal-arc'), async () => {
    sealConsultation();

    // La figura crece y se aclara: lo que se apaga es el texto, no el número.
    scene?.setFigureOpacity(0.75, { duration: 1.4 });

    await dissolveText($('rev-body'));
    await new Promise((resolve) => gsap.to(seal, { opacity: 0, duration: 0.5, onComplete: resolve }));

    paintTrace(readTodaysConsultation() ?? { number, dateKey: todayKey() });
    showScreen('locked');
    startCountdown();
  });
}

/** Pinta la huella: lo único que sobrevive al cierre. */
function paintTrace(consultation) {
  const archetype = ARCHETYPES[consultation.number] ?? ARCHETYPES[1];

  $('locked-eyebrow').textContent = formatShortDate(consultation.dateKey);
  $('locked-number').textContent = String(consultation.number);
  $('locked-archetype').textContent = archetype.title;
}

/* ------------------------------------------------------------------ */
/* El camino principal                                                 */
/* ------------------------------------------------------------------ */

async function consult({ name, birthDate }) {
  if (busy) return;
  busy = true;
  submitButton.disabled = true;

  let cast;
  try {
    cast = castOracle({ name, birthDate });
  } catch (error) {
    // Solo puede pasar si algo se coló entre la validación y acá.
    showError(error instanceof OracleInputError ? error.message : 'Algo salió mal con esos datos.');
    busy = false;
    submitButton.disabled = false;
    return;
  }

  logCast(cast);
  saveIdentity({ name, birthDate });

  // La IA arranca YA, en paralelo con la ceremonia. Nadie la espera.
  const revelationPromise = fetchRevelation({
    numbers: {
      expression: cast.expression.number,
      lifeMission: cast.lifeMission.number,
      day: cast.day.number,
      personal: cast.personal.number,
    },
    dateKey: cast.dateKey,
  });

  // Marca si el texto ya llegó, sin esperarlo: hace falta más abajo para saber
  // si la ceremonia terminó antes que la IA.
  let textPending = true;
  revelationPromise.then(() => {
    textPending = false;
  });

  showScreen('ceremony');

  // La ceremonia mide posiciones con getBoundingClientRect, así que hay que
  // dejar pasar un cuadro para que el navegador aplique el layout de la
  // pantalla recién mostrada.
  await new Promise((resolve) => requestAnimationFrame(resolve));

  ceremony = new Ceremony({ field: $('ceremony-field'), caption: $('ceremony-caption') });

  const skipButton = $('skip');
  skipButton.hidden = false;

  await ceremony.play(cast, {
    onPersonalNumber: (number) => {
      scene?.setFigure(number);
      if (scene && FRAMING.climax) {
        scene.setFigureOpacity(FRAMING.climax.opacity, { duration: 1.4 });
        scene.setFraming({ ...FRAMING.climax, duration: 1.4 });
      }
    },
  });

  // Terminada la animación no queda nada que saltar: el botón solo confundiría
  // a quien lo apriete esperando adelantar la espera del texto.
  skipButton.hidden = true;

  if (textPending) ceremony.hold();
  const revelation = await revelationPromise;
  ceremony.release();

  saveConsultation({
    dateKey: cast.dateKey,
    name: cast.input.name,
    birthDate: cast.input.birthDate,
    number: cast.personal.number,
    numbers: {
      expression: cast.expression.number,
      lifeMission: cast.lifeMission.number,
      day: cast.day.number,
      personal: cast.personal.number,
    },
    revelation: revelation.text,
    source: revelation.source,
  });

  const body = paintRevelation({ name: cast.input.name, number: cast.personal.number });

  showScreen('revelation');
  ceremony.destroy();
  await revealText(body, revelation.text);

  armSeal(cast.personal.number);
  busy = false;
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

function wireEvents() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = readForm();
    if (values) consult(values);
  });

  $('skip').addEventListener('click', () => ceremony?.skip());
}

/**
 * Vuelve a mostrar la revelación de hoy sin animarla.
 *
 * Es el caso de quien consultó y recargó sin haber cerrado el velo: el texto
 * sigue siendo suyo, con su gesto de cierre todavía disponible. Recargar no
 * cierra nada; solo el gesto cierra.
 */
function restoreRevelation(consultation) {
  const body = paintRevelation({ name: consultation.name, number: consultation.number });
  $('rev-seal').textContent = 'Esto se te reveló hoy. Cuando termines, cierra el velo.';
  showText(body, consultation.revelation);
  showScreen('revelation', { animate: false });
  armSeal(consultation.number);
}

/**
 * @param {number} figure  número inicial
 * @param {keyof FRAMING} state  pantalla con la que arranca la sesión — la
 *   escena se encuadra para ESA, no siempre para el umbral. `showScreen` corre
 *   antes de que la escena exista, así que su llamada a `setFraming` se pierde y
 *   el encuadre inicial hay que darlo acá.
 */
async function startScene(figure, state) {
  if (!isWebGLAvailable()) {
    document.body.classList.add('no-webgl');
    return null;
  }

  const framing = FRAMING[state] ?? FRAMING.gate;

  const instance = new OracleScene($('scene'), {
    figure,
    figureOpacity: 0,
    figureOffsetY: framing.offsetY,
    figureScale: framing.scale,
  });

  await instance.init();
  instance.start().reveal({ duration: 3 });
  instance.setFigureOpacity(framing.opacity, { duration: 2.4 });
  return instance;
}

async function boot() {
  buildDateSelects();

  const consultation = readTodaysConsultation();

  /**
   * Tres estados, y el que manda es si el velo está CERRADO, no si hubo consulta:
   *   · sin consulta        → el umbral
   *   · consulta abierta    → la revelación, con su gesto de cierre
   *   · consulta cerrada    → la huella
   */
  const state = !consultation ? 'gate' : consultation.sealed ? 'locked' : 'revelation';

  // Antes de consultar, la figura es la del Número del Día, que es igual para
  // todos y no necesita ningún dato personal. Después, es el número propio.
  const initialFigure = consultation ? consultation.number : dayNumber(todayKey()).number;

  wireEvents();

  if (state === 'locked') {
    paintTrace(consultation);
    showScreen('locked', { animate: false });
    startCountdown();
  } else if (state === 'revelation') {
    restoreRevelation(consultation);
  } else {
    prefillFromIdentity();
    showScreen('gate', { animate: false });
    gsap.to('[data-enter]', {
      opacity: 1,
      y: 0,
      duration: 1.2,
      delay: 0.3,
      stagger: 0.12,
      ease: 'power3.out',
      startAt: { y: 16 },
    });
  }

  scene = await startScene(initialFigure, state);

  // Herramientas de consola. `Oraculo.forget()` borra el bloqueo y es lo que
  // hace falta para probar el flujo entero más de una vez por día.
  window.Oraculo = {
    scene,
    forget: () => {
      forget();
      location.reload();
    },
    setDebug,
    cast: castOracle,
    almacenamiento: isPersistent ? 'localStorage' : 'memoria (sin persistencia)',
  };
}

boot().catch((error) => {
  console.error('[oráculo] no se pudo iniciar:', error);
  document.body.classList.add('no-webgl');
  showScreen('gate', { animate: false });
  gsap.set('[data-enter]', { opacity: 1 });
});
