import { aEntero, interpretarEntero } from './precio';
import type { CampoLibro, Resultado } from './resultado';

/**
 * Validación de los campos de un libro, compartida por el alta manual, la
 * edición y las dos ingestas de Excel (FR-002, FR-019).
 *
 * Es una sola función a propósito: si cada flujo validara por su cuenta, un
 * Excel podría crear un libro que el formulario habría rechazado. Recibe
 * `unknown` en los cuatro campos porque las celdas de Excel no ofrecen
 * garantías de tipo, y devuelve los valores ya recortados y convertidos.
 */

export interface CamposLibro {
  titulo: string;
  editorial: string;
  stock: number;
  precio: number;
}

export interface CamposLibroCrudos {
  titulo: unknown;
  editorial: unknown;
  stock: unknown;
  precio: unknown;
}

function invalido(campo: CampoLibro, mensaje: string): Resultado<never> {
  return { ok: false, error: { tipo: 'validacion', campo, mensaje } };
}

/**
 * Texto no vacío tras recortar. Acepta números porque una celda de Excel con el
 * título "1984" llega como número: rechazarla dejaría afuera un libro válido, y
 * convertirla es exacto, no una interpretación.
 */
function aTexto(valor: unknown): string | null {
  if (typeof valor === 'string') {
    const recortado = valor.trim();
    return recortado === '' ? null : recortado;
  }

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return String(valor);
  }

  return null;
}

/**
 * El título y el precio se validan también por separado porque el Excel de
 * **actualización de precios** trae sólo esas dos columnas: sin esto, ese flujo
 * necesitaría su propia validación y podría aceptar un precio que el alta
 * rechaza, o al revés.
 */
export function validarTitulo(valor: unknown): Resultado<string> {
  const titulo = aTexto(valor);
  return titulo === null
    ? invalido('titulo', 'El título no puede estar vacío.')
    : { ok: true, valor: titulo };
}

export function validarPrecio(valor: unknown): Resultado<number> {
  const leido = aEntero(valor);
  return leido.valido
    ? { ok: true, valor: leido.precio }
    : invalido('precio', MENSAJES_PRECIO[leido.motivo]);
}

export function validarCamposLibro(input: CamposLibroCrudos): Resultado<CamposLibro> {
  // El orden es parte del contrato: `ErrorNegocio` reporta un solo campo, así
  // que sin una precedencia fija el motivo informado en el reporte de un Excel
  // dependería de un detalle de implementación.
  const titulo = validarTitulo(input.titulo);
  if (!titulo.ok) {
    return titulo;
  }

  const editorial = aTexto(input.editorial);
  if (editorial === null) {
    return invalido('editorial', 'La editorial no puede estar vacía.');
  }

  const stockLeido = interpretarEntero(input.stock);
  if (!stockLeido.valido) {
    return invalido('stock', MENSAJES_STOCK[stockLeido.motivo]);
  }
  if (stockLeido.entero < 0) {
    return invalido('stock', 'El stock no puede ser negativo.');
  }

  const precio = validarPrecio(input.precio);
  if (!precio.ok) {
    return precio;
  }

  return {
    ok: true,
    valor: {
      titulo: titulo.valor,
      editorial,
      stock: stockLeido.entero,
      precio: precio.valor,
    },
  };
}

/**
 * Los mensajes distinguen el campo ausente del no numérico y del decimal
 * porque son tres correcciones distintas para quien arregla el archivo, y
 * porque `ErrorNegocio` no lleva el motivo aparte: si los tres dijeran lo
 * mismo, el reporte perdería la distinción que exige FR-040 (e).
 */
const MENSAJES_STOCK = {
  ausente: 'Falta el stock.',
  no_numerico: 'El stock no es un número.',
  con_decimales: 'El stock no puede tener decimales: se cuenta en ejemplares enteros.',
} as const;

const MENSAJES_PRECIO = {
  ausente: 'Falta el precio.',
  no_numerico: 'El precio no es un número.',
  con_decimales: 'El precio no puede tener decimales: los precios son enteros.',
  no_positivo: 'El precio debe ser mayor que cero.',
} as const;
