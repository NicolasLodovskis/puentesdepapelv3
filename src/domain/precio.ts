/**
 * Único borde de entrada del precio (R5 enmendado, PRD RF-01/RF-31, FR-040).
 *
 * El precio es un **entero de unidad de moneda**: el sistema no maneja centavos.
 * Esta función convierte lo que llega del formulario o de una celda de Excel a
 * ese entero, o lo rechaza con el motivo. No redondea nunca: alterar un importe
 * por cuenta propia corrompe un dato de precio, y un precio mal aplicado no se
 * distingue después de uno correcto (Principio II). Ante la duda, se reporta.
 *
 * Nunca lanza. Un archivo de 5.000 filas no puede caerse por una celda mala:
 * tiene que reportarla (FR-019, FR-030).
 */

export type MotivoPrecioInvalido =
  /** No hay dato: celda vacía, sólo espacios, null o undefined. */
  | 'ausente'
  /** Hay dato pero no es un número interpretable sin adivinar. */
  | 'no_numerico'
  /** Es numérico con parte decimal distinta de cero. No se redondea. */
  | 'con_decimales'
  /** Es un entero, pero no es > 0. */
  | 'no_positivo';

export type ResultadoPrecio =
  { valido: true; precio: number } | { valido: false; motivo: MotivoPrecioInvalido };

/**
 * Un signo opcional, dígitos, y opcionalmente UN separador decimal —coma o
 * punto, indistintos— seguido de dígitos. Deliberadamente estricta: deja afuera
 * la notación científica, los símbolos de moneda, el texto acompañante y el
 * separador de miles. Todo eso exigiría interpretar la intención del archivo.
 */
const NUMERO = /^([+-]?)(\d+)(?:[.,](\d+))?$/;

/** Motivos que puede dar la lectura de un entero, antes de juzgar su signo. */
export type MotivoEnteroInvalido = Exclude<MotivoPrecioInvalido, 'no_positivo'>;

export type ResultadoEntero =
  { valido: true; entero: number } | { valido: false; motivo: MotivoEnteroInvalido };

/**
 * Lectura de un entero desde lo que llega de la UI o de una celda de Excel, sin
 * juzgar su signo: devuelve el entero tal cual, incluidos el cero y los
 * negativos. Es el borde numérico **compartido** por el precio (entero > 0) y
 * por el stock (entero >= 0), que tienen la misma tolerancia de formato y sólo
 * difieren en el rango admitido. Una segunda implementación acá haría que un
 * `"3,00"` fuera aceptable como precio y no como stock, o al revés.
 */
export function interpretarEntero(valor: unknown): ResultadoEntero {
  if (valor === null || valor === undefined) {
    return { valido: false, motivo: 'ausente' };
  }

  if (typeof valor === 'number') {
    return desdeNumero(valor);
  }

  if (typeof valor !== 'string') {
    // Booleanos, objetos, arreglos, fechas, símbolos, funciones, bigint.
    return { valido: false, motivo: 'no_numerico' };
  }

  const recortado = valor.trim();
  if (recortado === '') {
    return { valido: false, motivo: 'ausente' };
  }

  const coincidencia = NUMERO.exec(recortado);
  if (coincidencia === null) {
    return { valido: false, motivo: 'no_numerico' };
  }

  const [, signo = '', enteros = '', decimales] = coincidencia;

  // Se evalúan los decimales antes que el signo: para quien corrige el archivo,
  // "tiene decimales" es el arreglo concreto, y un valor negativo con decimales
  // tiene los dos problemas.
  if (decimales !== undefined && /[^0]/.test(decimales)) {
    return { valido: false, motivo: 'con_decimales' };
  }

  const entero = Number(`${signo}${enteros}`);

  // Más allá del entero seguro, el valor guardado no sería el escrito: la
  // conversión pierde precisión en silencio. Rechazarlo es preferible a
  // persistir un importe distinto del que dice el archivo.
  if (!Number.isSafeInteger(entero)) {
    return { valido: false, motivo: 'no_numerico' };
  }

  return { valido: true, entero };
}

export function aEntero(valor: unknown): ResultadoPrecio {
  const leido = interpretarEntero(valor);
  if (!leido.valido) {
    return leido;
  }

  return leido.entero > 0
    ? { valido: true, precio: leido.entero }
    : { valido: false, motivo: 'no_positivo' };
}

function desdeNumero(valor: number): ResultadoEntero {
  if (!Number.isFinite(valor)) {
    // NaN, Infinity, -Infinity.
    return { valido: false, motivo: 'no_numerico' };
  }

  if (!Number.isInteger(valor)) {
    return { valido: false, motivo: 'con_decimales' };
  }

  if (!Number.isSafeInteger(valor)) {
    return { valido: false, motivo: 'no_numerico' };
  }

  return { valido: true, entero: valor };
}
