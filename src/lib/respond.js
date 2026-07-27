/**
 * respond.js — Respuestas JSON del backend.
 *
 * Todo lo que sale de /api/* pasa por acá, para que las cabeceras sean las
 * mismas en todas partes y nadie se olvide del `no-store`: las respuestas del
 * oráculo dependen del día, y basta con que un intermediario cachee una para
 * que alguien reciba la revelación de ayer.
 */

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}
