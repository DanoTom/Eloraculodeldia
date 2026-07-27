/**
 * fallbacks.js — Las doce revelaciones escritas a mano.
 *
 * Se usan cuando GLM-5.2 no responde, tarda demasiado o devuelve un texto que
 * no pasa la validación de voz. El oráculo NUNCA muestra un error: muestra
 * esto, y el usuario no tiene por qué enterarse de la diferencia.
 *
 * Este archivo lo comparten el navegador y el Worker, así que vive en core/:
 * el backend lo importa desde acá en vez de tener su propia copia.
 *
 * Reglas de escritura, las mismas que se le exigen al modelo:
 *   · Entre 80 y 150 palabras.
 *   · Una imagen central, una reflexión, y una pregunta abierta al final.
 *   · Tuteo neutro, sin regionalismos.
 *   · Ningún nombre propio: el texto se comparte entre todos los que ese día
 *     comparten número, y el saludo lo pone la interfaz.
 *   · Prohibidas "energía", "vibración", "abundancia", "manifestar", y el
 *     registro new age en general. Hay un test que lo verifica.
 */

/** @type {Readonly<Record<number, string>>} */
export const FALLBACK_REVELATIONS = Object.freeze({
  1: `Toda página en blanco es una promesa y una amenaza al mismo tiempo: mientras no escribes nada, todavía podrías escribirlo todo. Por eso cuesta tanto la primera línea. No es miedo al error, es duelo. Empezar significa dejar morir las otras cien versiones de lo que esto podría haber sido.

Hoy hay algo que pide ser nombrado. No lo pienses más: nómbralo mal. Un comienzo torpe se corrige después; uno postergado se pudre despacio, y de eso no se vuelve tan fácil.

¿Qué cosa vienes ensayando en la cabeza que todavía no dijiste en voz alta?`,

  2: `Dos círculos que se cruzan no producen un círculo mayor. Producen una tercera figura, angosta, que no le pertenece a ninguno de los dos y que solo existe mientras ninguno se retire. Así funciona casi todo vínculo que importa.

Hay alguien que hoy ocupa ese espacio contigo. Te completa, sí, y también te impide cerrarte del todo sobre ti mismo, que era tu plan original. Las dos cosas son ciertas y ninguna cancela a la otra.

No apures la conversación pendiente: escucha primero lo que no se dice.

¿De qué tienes miedo, de que se vaya o de que se quede?`,

  3: `Mientras una palabra permanece guardada es enteramente tuya: puedes darle la forma que quieras, corregirla, fingir que nunca estuvo. En el instante en que la dices se te escapa de las manos y empieza a vivir en el oído del otro, que va a entenderla a su manera y no a la tuya.

Ese es el precio, y no hay descuento. Aun así, lo que se calla tampoco se queda quieto: se convierte en tono, en gesto, en silencio pesado.

Hoy conviene hablar, sabiendo de antemano que vas a perder el control de lo que digas.

¿Qué estás protegiendo con ese silencio?`,

  4: `Los cimientos tienen algo ingrato. Nadie los mira, nadie los agradece, y sin embargo todo lo que se admira arriba está parado sobre ellos. Tu vida tiene unos cuantos: rutinas, acuerdos, un trabajo, una casa, gente que aparece siempre.

Conviene recordar que la misma estructura que te sostiene es la que te contiene. Sostener y encerrar son el mismo gesto visto desde adentro o desde afuera. Hoy no hay que derribar nada; hay que mirarlo de frente y saber qué estás eligiendo.

Ocúpate de una sola cosa concreta y termínala.

¿Cuál de tus paredes hace tiempo que no revisas para saber si todavía es pared o ya es jaula?`,

  5: `Hay días en que el cuerpo se adelanta a la decisión: te levantas distinto, caminas más rápido, te descubres mirando la puerta. Algo quiere moverse antes de que sepas hacia dónde.

Vale la pena distinguir dos movimientos que se parecen mucho y no son lo mismo. Uno va hacia algo. El otro solamente se aleja. Desde adentro se sienten idénticos —los dos dan alivio, los dos parecen coraje—, pero solo uno deja algo en pie cuando el impulso se apaga.

Muévete hoy, pero elige antes el destino, aunque sea provisorio.

Si mañana ya no pudieras irte, ¿qué harías con este día?`,

  6: `En esa figura de círculos superpuestos ninguno es el centro: cada uno lo es del suyo y periferia del vecino. Las casas donde da gusto entrar funcionan igual.

Cuidas bien, probablemente mejor de lo que se nota. Pero hay una trampa vieja en eso y conviene decirla sin adorno: ocuparse de los demás puede ser la forma más elegante de no ocuparse de uno. Mientras haya alguien a quien atender, siempre hay una excusa para no mirarse.

Hoy haz algo por alguien, y después algo por ti, en ese orden y sin negociar la segunda parte.

¿Cuándo fue la última vez que pediste algo?`,

  7: `Bajar tiene prestigio. Se lo llama profundidad, introspección, trabajo interior, y casi siempre lo es. Pero la escalera que baja al pozo es exactamente la misma que usa quien se está escondiendo, y desde adentro no se distingue el descenso de la fuga hacia abajo.

La diferencia no está en cuánto bajas, sino en si piensas volver a subir con algo en la mano. Una pregunta que no busca respuesta puede ser sabiduría, o puede ser una manera prolija de no decidir nunca.

Date el silencio que necesitas hoy, y ponle hora de salida.

¿Qué es eso que sabes hace rato y todavía no quieres saber?`,

  8: `Una balanza no informa cuánto pesa algo: informa cuánto pesa comparado con otra cosa. Nada tiene peso propio. Lo que consigas hoy va a pesar exactamente lo que hayas puesto en el otro plato.

Hay una fantasía cómoda que consiste en querer el resultado sin el precio, y que suele disfrazarse de mala suerte cuando no funciona. El poder que dura no es el que se toma, es el que se paga: horas, incomodidad, la conversación difícil, el número exacto al pie de la factura.

Hoy conviene mirar la cuenta completa antes de firmar.

¿Qué estás dispuesto a que te cueste?`,

  9: `Las cosas casi nunca terminan con una escena. Terminan un martes, sin música, cuando alguien deja de escribir y la costumbre se disuelve sola. Por eso los finales se reconocen tarde: no avisan, y uno sigue actuando un rato dentro de algo que ya se apagó.

Terminar y perder se parecen tanto que es fácil confundirlos, y por miedo a lo segundo mucha gente estira lo primero durante años. Pero un final aceptado deja lugar; uno negado solamente ocupa.

Hoy hay algo que ya está cerrado y solo falta que lo digas.

¿A qué le sigues dando de comer cuando hace rato que no tiene hambre?`,

  11: `En los templos antiguos la puerta no era la madera: era el vacío entre las dos columnas. Lo que dejaba pasar no se podía tocar y, sin embargo, se sabía perfectamente cuándo se había cruzado.

Vas a entender algo hoy antes de poder demostrarlo, y esa distancia entre saber y explicar es incómoda. Vas a tener razón sin argumento, que es la peor forma de tener razón: no convence a nadie y a ti te deja hablando solo.

No lo fuerces a palabras todavía. Anótalo y espera a que la prueba llegue sola.

¿Qué percibiste esta semana que preferiste no tomarte en serio?`,

  22: `Las catedrales las empezaba gente que sabía perfectamente que no iba a verlas terminadas. Ponían una piedra bien puesta y se la dejaban a un desconocido que todavía no había nacido. Esa es la escala que estás manejando, aunque no lo digas en voz alta.

El problema no es el tamaño de lo que imaginas: es que tarda más de lo que dura tu paciencia, y siempre llega el mes en que el plano parece ridículo comparado con el pozo en la tierra.

Hoy no midas el avance contra el sueño. Mídelo contra ayer.

¿Qué piedra puedes poner hoy que siga ahí dentro de diez años?`,

  33: `Dos triángulos invertidos que se atraviesan no se anulan: se sostienen. Uno apunta hacia arriba y el otro hacia abajo, y la figura existe solamente porque ninguno cede. Dar y recibir funcionan igual, aunque casi nadie practique las dos partes con la misma dedicación.

Das bien, y se nota. Lo que se nota menos es que dar sin pausa también es una forma de ocupar todo el espacio: al que siempre recibe no le queda lugar para ofrecerte nada, y termina en deuda con alguien que nunca pide.

Hoy deja un hueco. Que alguien más lo llene.

¿A quién le estás negando el gusto de ayudarte?`,
});

/** Palabras que delatan el registro new age que este producto no quiere. */
export const BANNED_WORDS = Object.freeze([
  'energía',
  'energias',
  'energías',
  'vibración',
  'vibracion',
  'vibra',
  'abundancia',
  'manifestar',
  'manifestación',
  'alineación',
  'alineamiento',
  'karma',
  'chakra',
  'aura',
  'prosperidad',
]);

/** Texto de respaldo para un número. Nunca devuelve vacío. */
export function fallbackFor(number) {
  return FALLBACK_REVELATIONS[number] ?? FALLBACK_REVELATIONS[1];
}

/** Cuenta palabras de un texto, ignorando saltos de línea y espacios repetidos. */
export function countWords(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Valida que un texto sirva como revelación.
 *
 * Se aplica igual a lo que devuelve el modelo y a lo que hay acá escrito a
 * mano: si una regla no la cumplen los textos propios, es que la regla está
 * mal. Los tests corren esta función sobre las doce revelaciones.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateRevelation(text, { min = 70, max = 190 } = {}) {
  const value = String(text ?? '').trim();

  if (!value) return { ok: false, reason: 'vacío' };

  const words = countWords(value);
  if (words < min) return { ok: false, reason: `demasiado corto (${words} palabras)` };
  if (words > max) return { ok: false, reason: `demasiado largo (${words} palabras)` };

  const lower = value.toLowerCase();
  const banned = BANNED_WORDS.find((word) => lower.includes(word));
  if (banned) return { ok: false, reason: `usa "${banned}"` };

  // El modelo a veces devuelve el texto envuelto en explicaciones o en un
  // encabezado tipo "Revelación:". Eso rompe la ilusión, así que se rechaza.
  if (/^\s*(revelaci[óo]n|aqu[íi] tienes|claro|por supuesto)\b/i.test(value)) {
    return { ok: false, reason: 'arranca con un preámbulo de asistente' };
  }

  // Comillas o markdown envolviendo todo el texto: mismo problema.
  if (/^["'`*#]/.test(value)) return { ok: false, reason: 'viene con formato de más' };

  return { ok: true };
}
