/**
 * storage.js — Memoria local del oráculo.
 *
 * Dos cosas separadas a propósito:
 *
 *   · IDENTIDAD  (nombre + fecha de nacimiento) — persiste entre días, solo
 *     para no hacerte tipear lo mismo cada mañana.
 *   · CONSULTA   (la revelación de hoy) — se borra sola cuando cambia el día.
 *
 * Separarlas es lo que hace que "cambió la fecha → nueva consulta" sea una
 * consecuencia del diseño y no una rutina de limpieza que hay que acordarse de
 * llamar.
 *
 * Se guarda en texto plano. Hashear no protegería nada: el dato es del usuario,
 * está en su propio navegador, y para saludarlo por su nombre hay que poder
 * leerlo. Lo que sí importa es que el nombre NUNCA sale del dispositivo — a la
 * API solo viajan números.
 *
 * El bloqueo es deliberadamente local. Otro navegador, otra puerta: es parte de
 * la mística, no un agujero que haya que tapar. Sin cookies de servidor ni
 * huellas digitales.
 */

import { todayKey } from '../core/dates.js';

const NAMESPACE = 'oraculo:v1';
const KEY_IDENTITY = `${NAMESPACE}:identidad`;
const KEY_CONSULTATION = `${NAMESPACE}:consulta`;

/**
 * localStorage puede no existir: modo privado de Safari, cookies bloqueadas,
 * iframes con restricciones. En ese caso el sitio tiene que seguir funcionando,
 * así que se cae a un Map en memoria. El bloqueo diario dura entonces lo que
 * dure la pestaña, que es lo máximo honesto que se puede prometer ahí.
 */
function createStore() {
  try {
    const probe = `${NAMESPACE}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { kind: 'localStorage', store: window.localStorage };
  } catch {
    const memory = new Map();
    return {
      kind: 'memoria',
      store: {
        getItem: (k) => (memory.has(k) ? memory.get(k) : null),
        setItem: (k, v) => memory.set(k, String(v)),
        removeItem: (k) => memory.delete(k),
      },
    };
  }
}

const { kind, store } = createStore();

/** 'localStorage' o 'memoria'. La interfaz lo usa para avisar si corresponde. */
export const storageKind = kind;
export const isPersistent = kind === 'localStorage';

function read(key) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // JSON corrupto por una versión vieja o por edición manual: se descarta.
    try {
      store.removeItem(key);
    } catch {
      /* nada que hacer */
    }
    return null;
  }
}

function write(key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Cuota llena. No es motivo para romper la experiencia.
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Identidad                                                           */
/* ------------------------------------------------------------------ */

/** @returns {{ name: string, birthDate: string } | null} */
export function readIdentity() {
  const value = read(KEY_IDENTITY);
  if (!value?.name || !value?.birthDate) return null;
  return { name: String(value.name), birthDate: String(value.birthDate) };
}

export function saveIdentity({ name, birthDate }) {
  return write(KEY_IDENTITY, { name, birthDate, savedAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* Consulta del día                                                    */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} Consultation
 * @property {string} dateKey     'YYYY-MM-DD' local del día de la consulta
 * @property {string} name        con el que se saludó
 * @property {string} birthDate
 * @property {number} number      Número Personal del Día
 * @property {object} numbers     { expression, lifeMission, day, personal }
 * @property {string} [revelation] el texto revelado — se BORRA al cerrar el velo
 * @property {boolean} [sealed]   true una vez que se cerró el velo
 * @property {string} source      'ai' | 'cache' | 'fallback' | 'fallback-local'
 * @property {string} createdAt
 */

/**
 * La consulta de HOY, o null si no hay o si es de otro día.
 *
 * Cuando encuentra una vieja la borra en el acto: esa es toda la lógica de
 * "si cambia la fecha, limpiar el bloqueo".
 *
 * @returns {Consultation | null}
 */
export function readTodaysConsultation(now = new Date()) {
  const value = read(KEY_CONSULTATION);
  if (!value) return null;

  if (value.dateKey !== todayKey(now)) {
    clearConsultation();
    return null;
  }

  // Una consulta sellada YA NO tiene texto: eso es lo normal, no un dato roto.
  // Lo único que siempre tiene que estar es el número.
  if (!value.number || (!value.sealed && !value.revelation)) {
    clearConsultation();
    return null;
  }

  return value;
}

/**
 * Cierra el velo: borra el texto de la revelación y deja la huella.
 *
 * Después de esto queda el número, el arquetipo y la fecha —suficiente para
 * recordar qué te dijo el día— pero el texto no se puede volver a leer. Es
 * intencional: lo que se puede releer cuando uno quiere no se lee con la misma
 * atención.
 *
 * Recargar la página NO cierra el velo. Solo este gesto lo cierra.
 */
export function sealConsultation() {
  const current = read(KEY_CONSULTATION);
  if (!current) return false;

  const { revelation, ...trace } = current;
  return write(KEY_CONSULTATION, { ...trace, sealed: true, sealedAt: new Date().toISOString() });
}

/** @param {Omit<Consultation, 'createdAt'>} consultation */
export function saveConsultation(consultation) {
  return write(KEY_CONSULTATION, { ...consultation, createdAt: new Date().toISOString() });
}

export function clearConsultation() {
  try {
    store.removeItem(KEY_CONSULTATION);
  } catch {
    /* nada que hacer */
  }
}

/** Borra todo. Solo se usa desde la consola, para depurar el flujo. */
export function forget() {
  try {
    store.removeItem(KEY_CONSULTATION);
    store.removeItem(KEY_IDENTITY);
  } catch {
    /* nada que hacer */
  }
}
