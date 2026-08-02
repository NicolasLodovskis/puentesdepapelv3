import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { plegarTexto } from '@/domain/normalizar-titulo';

/**
 * Lectura de un `.xlsx` y reconocimiento de sus encabezados (T038, FR-039).
 *
 * Es el borde donde el archivo de la librera se convierte en datos, y donde el
 * Principio II se juega antes que en ningún otro lado: acá se decide qué se
 * acepta sin interpretar y qué se rechaza por ambiguo. La regla de fondo es que
 * el lector **no adivina**: no hay sinónimos de encabezado, una columna
 * obligatoria repetida es un rechazo, y una celda vacía llega vacía.
 *
 * La misma función sirve a los dos flujos (RF-06 y RF-18): sólo cambia qué
 * columnas se le exigen. Si cada uno tuviera su lector, podrían divergir en qué
 * encabezado aceptan y el mismo archivo entraría por un lado y no por el otro.
 *
 * La lectura es **por streaming** (`WorkbookReader`): el archivo se recorre fila
 * por fila en vez de cargar el XML entero en memoria, que es lo que hace
 * sostenible el techo de 5.000 filas de RNF-03.
 */

/** Columnas obligatorias de cada flujo (FR-012, FR-016). No son intercambiables. */
export const COLUMNAS_PRECIOS = ['libro', 'precio'] as const;
export const COLUMNAS_ALTA_MASIVA = ['libro', 'editorial', 'stock', 'precio'] as const;

export interface FilaCruda {
  /**
   * Número de fila **en el archivo original**, contando el encabezado y las
   * filas vacías que haya arriba: es lo que permite a la librera ir a la fila
   * exacta de su Excel cuando el reporte la nombra.
   */
  numeroFila: number;
  /** Valores de las columnas obligatorias, por su nombre canónico. */
  valores: Record<string, unknown>;
}

/**
 * El `tipo` es el que fija el contrato del endpoint
 * (contracts/server-actions.md), que define una sola forma de fallo por
 * encabezados. `repetidas` y `encontrados` lo completan con lo que FR-039 exige
 * informar: sin la lista de lo encontrado, la librera lee "falta la columna
 * precio" mirando un archivo donde hay una columna que ella llama precio.
 */
export interface ErrorEncabezados {
  tipo: 'columnas_faltantes';
  faltantes: string[];
  repetidas: string[];
  encontrados: string[];
  mensaje: string;
}

export type Lectura =
  | { ok: true; encabezados: string[]; filas: FilaCruda[] }
  | { ok: false; error: ErrorEncabezados };

/**
 * `origen` es la ruta del archivo o su contenido en memoria: el Route Handler
 * recibe un `Buffer` del formulario y los tests leen fixtures del disco.
 */
export async function leerExcel(
  origen: string | Buffer,
  columnas: readonly string[],
): Promise<Lectura> {
  const filasCrudas = await leerPrimeraHoja(origen);

  const indiceEncabezado = filasCrudas.findIndex((fila) => !esFilaVacia(fila.celdas));
  const filaEncabezado = filasCrudas[indiceEncabezado];

  // Un archivo sin ninguna fila con contenido no tiene encabezado: faltan todas.
  const encabezados = filaEncabezado === undefined ? [] : textosDe(filaEncabezado.celdas);

  const ubicacion = ubicarColumnas(encabezados, columnas);
  if (!ubicacion.ok) {
    return ubicacion;
  }

  const filas: FilaCruda[] = [];
  for (const fila of filasCrudas.slice(indiceEncabezado + 1)) {
    // Una fila sin ninguna celda con contenido no es una fila: contarla
    // inflaría los totales del reporte y obligaría a informar como inválida una
    // fila que la librera nunca escribió.
    if (esFilaVacia(fila.celdas)) {
      continue;
    }

    const valores: Record<string, unknown> = {};
    for (const [columna, indice] of ubicacion.indices) {
      valores[columna] = fila.celdas[indice] ?? null;
    }

    filas.push({ numeroFila: fila.numeroFila, valores });
  }

  return { ok: true, encabezados, filas };
}

interface FilaLeida {
  numeroFila: number;
  /** Celdas por posición, base 0. Los huecos quedan `undefined`. */
  celdas: unknown[];
}

async function leerPrimeraHoja(origen: string | Buffer): Promise<FilaLeida[]> {
  const entrada = Buffer.isBuffer(origen) ? Readable.from(origen) : origen;
  const lector = new ExcelJS.stream.xlsx.WorkbookReader(entrada, {
    // Sin la caché, una celda de texto llega como referencia a la tabla de
    // cadenas compartidas en vez de como su texto.
    sharedStrings: 'cache',
    worksheets: 'emit',
  });

  const filas: FilaLeida[] = [];
  let esPrimeraHoja = true;

  // FR-039 (a): sólo la primera hoja aporta datos. Una segunda hoja con un
  // encabezado válido metería libros que nadie pidió.
  //
  // Las demás igual se recorren hasta el final en vez de cortar con un `break`:
  // el lector de exceljs mantiene abierto el zip y un archivo temporal por hoja,
  // y abandonar la iteración los deja colgados. Se comprobó que a la vigésima
  // lectura abandonada el lector deja de funcionar, así que "cortar apenas
  // tengo lo mío" no es una opción: hay que dejar que el lector termine.
  for await (const hoja of lector) {
    for await (const fila of hoja) {
      if (!esPrimeraHoja) {
        continue;
      }
      // `row.values` es un arreglo base 1 con un hueco en la posición 0.
      const celdas = (fila.values as unknown[]).slice(1).map(valorDeCelda);
      filas.push({ numeroFila: fila.number, celdas });
    }
    esPrimeraHoja = false;
  }

  return filas;
}

/**
 * Una celda de Excel no siempre es un escalar: puede traer texto con formato,
 * una fórmula con su resultado, o un enlace. Se extrae el valor que la librera
 * ve; lo que no se puede reducir a un dato se deja pasar tal cual, para que sea
 * la validación —y no el lector— la que decida que es inválido.
 */
function valorDeCelda(valor: unknown): unknown {
  if (valor === null || valor === undefined) {
    return null;
  }

  if (typeof valor === 'object') {
    const celda = valor as { richText?: { text: string }[]; result?: unknown; text?: string };

    if (Array.isArray(celda.richText)) {
      return celda.richText.map((parte) => parte.text).join('');
    }
    if ('result' in celda) {
      return celda.result ?? null;
    }
    if (typeof celda.text === 'string') {
      return celda.text;
    }
  }

  return valor;
}

/** Vacía es la celda sin dato y también la que sólo tiene espacios. */
function esCeldaVacia(valor: unknown): boolean {
  return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
}

function esFilaVacia(celdas: readonly unknown[]): boolean {
  return celdas.every(esCeldaVacia);
}

/** Los encabezados, tal como venían: es lo que la librera ve en su archivo. */
function textosDe(celdas: readonly unknown[]): string[] {
  return celdas.filter((celda) => !esCeldaVacia(celda)).map((celda) => String(celda));
}

type Ubicacion =
  | { ok: true; indices: Map<string, number> }
  | { ok: false; error: ErrorEncabezados };

function ubicarColumnas(encabezados: readonly string[], columnas: readonly string[]): Ubicacion {
  // La comparación pliega acentos, mayúsculas y espacios sobrantes (FR-039 c),
  // y nada más: `importe` no es `precio`, porque interpretarlo así sería
  // adivinar la intención del archivo (FR-039 d, FR-029).
  const plegados = encabezados.map(plegarTexto);

  const indices = new Map<string, number>();
  const faltantes: string[] = [];
  const repetidas: string[] = [];

  for (const columna of columnas) {
    const coincidencias = plegados.reduce<number[]>(
      (acumulado, encabezado, indice) =>
        encabezado === columna ? [...acumulado, indice] : acumulado,
      [],
    );

    if (coincidencias.length === 0) {
      faltantes.push(columna);
    } else if (coincidencias.length > 1) {
      // Elegir una de las dos sería adivinar cuál trae el dato bueno (FR-039 f).
      repetidas.push(columna);
    } else {
      indices.set(columna, coincidencias[0]!);
    }
  }

  if (faltantes.length === 0 && repetidas.length === 0) {
    return { ok: true, indices };
  }

  return {
    ok: false,
    error: {
      tipo: 'columnas_faltantes',
      faltantes,
      repetidas,
      encontrados: [...encabezados],
      mensaje: mensajeDeRechazo(faltantes, repetidas, encabezados),
    },
  };
}

function mensajeDeRechazo(
  faltantes: readonly string[],
  repetidas: readonly string[],
  encabezados: readonly string[],
): string {
  const problemas: string[] = [];

  if (faltantes.length > 0) {
    problemas.push(
      faltantes.length === 1
        ? `falta la columna «${faltantes[0]}»`
        : `faltan las columnas ${lista(faltantes)}`,
    );
  }
  if (repetidas.length > 0) {
    problemas.push(
      repetidas.length === 1
        ? `la columna «${repetidas[0]}» aparece repetida`
        : `las columnas ${lista(repetidas)} aparecen repetidas`,
    );
  }

  const encontrados =
    encabezados.length === 0
      ? 'El archivo no tiene ninguna fila con encabezados.'
      : `Los encabezados encontrados son: ${lista(encabezados)}.`;

  return `No se puede procesar el archivo: ${problemas.join(' y ')}. ${encontrados}`;
}

function lista(valores: readonly string[]): string {
  return valores.map((valor) => `«${valor}»`).join(', ');
}
