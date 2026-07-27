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

import { fetchRevelation } from './app/api.js';
import { Ceremony } from './app/ceremony.js';
import { revealText, showText } from './app/reveal.js';
import {
  forget,
  isPersistent,
  readIdentity,
  readTodaysConsultation,
  saveConsultation,
  saveIdentity,
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

function paintRevelation({ name, number, text }) {
  const archetype = ARCHETYPES[number] ?? ARCHETYPES[1];

  $('rev-number').textContent = String(number);
  $('rev-archetype').textContent = archetype.title;
  $('rev-salutation').textContent = `${name},`;
  $('rev-seal').textContent = 'El velo se cierra hasta la próxima medianoche.';

  return $('rev-body');
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

  const body = paintRevelation({
    name: cast.input.name,
    number: cast.personal.number,
    text: revelation.text,
  });

  showScreen('revelation');
  ceremony.destroy();
  await revealText(body, revelation.text);

  busy = false;
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

function wireEvents(consultation) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = readForm();
    if (values) consult(values);
  });

  $('skip').addEventListener('click', () => ceremony?.skip());

  $('recall').addEventListener('click', () => {
    const body = paintRevelation({
      name: consultation.name,
      number: consultation.number,
      text: consultation.revelation,
    });
    $('rev-seal').textContent = 'Esto ya te fue revelado hoy. El velo se cierra hasta la medianoche.';
    showText(body, consultation.revelation);
    showScreen('revelation');
  });
}

async function startScene(figure) {
  if (!isWebGLAvailable()) {
    document.body.classList.add('no-webgl');
    return null;
  }

  const instance = new OracleScene($('scene'), {
    figure,
    figureOpacity: 0,
    figureOffsetY: FRAMING.gate.offsetY,
    figureScale: FRAMING.gate.scale,
  });

  await instance.init();
  instance.start().reveal({ duration: 3 });
  instance.setFigureOpacity(FRAMING.gate.opacity, { duration: 2.4 });
  return instance;
}

async function boot() {
  buildDateSelects();

  const consultation = readTodaysConsultation();
  const locked = Boolean(consultation);

  // Antes de consultar, la figura del día es la de todos: el Número del Día,
  // que no necesita ningún dato personal. Ya consultado, es el número propio.
  const initialFigure = locked ? consultation.number : dayNumber(todayKey()).number;

  wireEvents(consultation);

  if (locked) {
    // El epígrafe dice la fecha y el arquetipo del día: repetir el titular
    // ("el velo ya se abrió") arriba del titular no aportaba nada.
    const archetype = ARCHETYPES[consultation.number] ?? ARCHETYPES[1];
    $('locked-eyebrow').textContent = `${formatShortDate(consultation.dateKey)} · ${archetype.title}`;

    showScreen('locked', { animate: false });
    startCountdown();
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

  scene = await startScene(initialFigure);
  if (scene) {
    const framing = FRAMING[locked ? 'locked' : 'gate'];
    scene.setFigureOpacity(framing.opacity, { duration: 2.4 });
  }

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
