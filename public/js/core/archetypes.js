/**
 * archetypes.js — El diccionario editorial del oráculo.
 *
 * Es la única fuente de verdad que conecta un número con:
 *   · su nombre público (`title`) — lo que ve el usuario,
 *   · su figura de geometría sagrada (`figure`) — lo que dibuja three.js,
 *   · su vocabulario (`motifs`, `tension`) — lo que se le pasa a GLM-5.2 como
 *     materia prima del prompt, para que la voz no derive a horóscopo genérico.
 *
 * Notas de tono, deliberadas y no negociables:
 *   · Nada de "energía", "vibración", "abundancia" ni "manifestar".
 *   · El registro es psicoanalítico y existencial, no esotérico comercial:
 *     deseo, falta, repetición, elección, finitud, otro.
 *   · Cada número lleva una `tension` — una contradicción interna, no una
 *     virtud. Es lo que evita que la revelación suene a cumplido.
 */

/**
 * @typedef {object} Archetype
 * @property {number} number
 * @property {string} title     nombre público del número
 * @property {string} figure    clave de la figura en SacredGeometry.js
 * @property {boolean} master   si es número maestro (11, 22, 33)
 * @property {string[]} motifs  imágenes concretas disponibles para la metáfora
 * @property {string} tension   la contradicción que la revelación debe habitar
 */

/** @type {Readonly<Record<number, Archetype>>} */
export const ARCHETYPES = Object.freeze({
  1: {
    number: 1,
    title: 'El Umbral',
    figure: 'tetrahedron',
    master: false,
    motifs: ['la primera línea sobre la página en blanco', 'el filo', 'lo que todavía no tiene nombre'],
    tension: 'empezar exige renunciar a todas las otras versiones posibles del comienzo',
  },
  2: {
    number: 2,
    title: 'La Vesica',
    figure: 'vesica',
    master: false,
    motifs: ['dos círculos que se cruzan', 'el umbral entre dos habitaciones', 'la espera'],
    tension: 'el otro es a la vez lo que te completa y lo que te impide cerrarte',
  },
  3: {
    number: 3,
    title: 'El Triángulo',
    figure: 'triad',
    master: false,
    motifs: ['la palabra dicha en voz alta', 'el eco', 'un tercero que aparece en la conversación'],
    tension: 'lo que se expresa deja de pertenecerte del todo',
  },
  4: {
    number: 4,
    title: 'La Piedra',
    figure: 'cube',
    master: false,
    motifs: ['los cimientos', 'la mesa de trabajo', 'lo que sostiene sin pedir nada'],
    tension: 'la estructura que te sostiene es también la que te contiene',
  },
  5: {
    number: 5,
    title: 'El Pentagrama',
    figure: 'pentagram',
    master: false,
    motifs: ['la puerta abierta', 'el cambio de estación', 'el cuerpo que se mueve antes que la decisión'],
    tension: 'la libertad sin dirección se parece bastante a la fuga',
  },
  6: {
    number: 6,
    title: 'La Flor',
    figure: 'flower',
    master: false,
    motifs: ['los círculos que se tocan', 'la casa', 'el cuidado como oficio silencioso'],
    tension: 'cuidar a otro puede ser una manera elegante de no mirarse',
  },
  7: {
    number: 7,
    title: 'El Retiro',
    figure: 'heptagram',
    master: false,
    motifs: ['el pozo', 'la biblioteca de noche', 'la pregunta que no busca respuesta'],
    tension: 'la profundidad y el escondite usan la misma escalera',
  },
  8: {
    number: 8,
    title: 'La Balanza',
    figure: 'octahedron',
    master: false,
    motifs: ['el peso justo', 'lo que se firma', 'la consecuencia que llega puntual'],
    tension: 'el poder solo se vuelve real cuando aceptas lo que cuesta',
  },
  9: {
    number: 9,
    title: 'El Cierre',
    figure: 'enneagram',
    master: false,
    motifs: ['la última página', 'el mar en invierno', 'lo que se suelta sin ceremonia'],
    tension: 'terminar algo se parece demasiado a perderlo',
  },
  11: {
    number: 11,
    title: 'Las Columnas',
    figure: 'pillars',
    master: true,
    motifs: ['dos columnas y el espacio entre ellas', 'la intuición antes del argumento', 'el relámpago'],
    tension: 'percibir de más y poder explicar de menos',
  },
  22: {
    number: 22,
    title: 'El Constructor',
    figure: 'tesseract',
    master: true,
    motifs: ['el plano y el edificio', 'la obra que sobrevive al que la piensa', 'la escala'],
    tension: 'lo que sueñas construir tarda más de lo que dura tu paciencia',
  },
  33: {
    number: 33,
    title: 'La Merkaba',
    figure: 'merkaba',
    master: true,
    motifs: ['dos triángulos que se atraviesan', 'la voz que enseña sin subir el tono', 'el don que pesa'],
    tension: 'dar demasiado también es una forma de ocupar todo el lugar',
  },
});

/** Devuelve el arquetipo de un número, o el del 1 si llega algo inesperado. */
export function archetypeFor(number) {
  return ARCHETYPES[number] ?? ARCHETYPES[1];
}
