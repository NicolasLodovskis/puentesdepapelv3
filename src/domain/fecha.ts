/**
 * Marcas temporales del sistema (R6, enmendado el 2026-08-02).
 *
 * Se guardan en la **hora de la librería (UTC-3)**, con el desfase explícito en
 * la propia cadena: `2026-08-01T22:08:40.583-03:00`. Abrir el `.db` con
 * cualquier visor muestra la hora en que la librera hizo la operación, sin
 * conversión mental, que es un modo de diagnóstico esperable en un sistema de un
 * solo archivo.
 *
 * Dos propiedades se conservan respecto de guardar en UTC, y de ellas depende
 * el historial:
 *
 * - **La marca sigue siendo inequívoca**: el desfase va escrito, así que no hay
 *   que adivinar en qué zona se registró.
 * - **El orden lexicográfico sigue siendo el cronológico**, porque el desfase es
 *   el mismo en todas las filas — Argentina no usa horario de verano. Es lo que
 *   hace correcto el `ORDER BY fecha` de SQLite, que no tiene tipo fecha nativo.
 *
 * Ésta es la **única** función que produce marcas temporales del sistema. Si
 * apareciera un segundo `toISOString()` suelto, las filas quedarían con desfases
 * mezclados y el orden del historial dejaría de ser confiable.
 */

/** Horas de desfase respecto de UTC. Fijo: Argentina no aplica horario de verano. */
export const DESFASE_UTC = -3;

const SUFIJO = '-03:00';
const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000;

/** Convierte un instante absoluto a su representación en la hora de la librería. */
export function aIsoLocal(instante: Date): string {
  const desplazado = new Date(instante.getTime() + DESFASE_UTC * MILISEGUNDOS_POR_HORA);
  // `toISOString` siempre entrega el formato con milisegundos y sufijo `Z`;
  // desplazado el instante, la parte de fecha y hora ya es la local y sólo resta
  // declarar el desfase real en lugar de `Z`.
  return desplazado.toISOString().replace('Z', SUFIJO);
}

/** El instante actual, en el formato y la zona en que el sistema persiste todo. */
export function ahora(): string {
  return aIsoLocal(new Date());
}
