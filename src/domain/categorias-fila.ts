/**
 * Vocabulario de clasificación de filas de Excel, compartido por los dos flujos
 * (data-model.md § Categorías de clasificación de fila, RF-28, FR-021b).
 *
 * Cada fila recibe **una sola** categoría: son mutuamente excluyentes y
 * exhaustivas, y de eso depende el invariante de completitud del reporte
 * —`filasAplicadas + noAplicadas.length === filasTotales`— que es la garantía
 * de que ninguna fila se descartó en silencio (FR-030).
 *
 * El orden de precedencia con que se asigna la categoría no vive acá sino en la
 * clasificación (T039), porque depende de consultar el catálogo. Acá está sólo
 * el vocabulario.
 *
 * Este archivo es vocabulario: tipos más las listas que los enumeran.
 */

export type CategoriaFila =
  /** El cambio se hizo. No genera fila de reporte. */
  | 'aplicada'
  /** Precios: coincide con un activo pero el precio es igual al vigente (FR-027b). */
  | 'sin_cambio'
  /** Precios: ningún libro coincide. */
  | 'sin_coincidencia'
  /** Precios: coincide con un archivado, que no se toca (FR-014, apartado propio). */
  | 'coincide_archivado'
  /** Precios: variante de edición, se destaca y no se aplica (FR-015). */
  | 'casi_coincidencia'
  /** Ambos: no es la primera ocurrencia del título en el archivo (FR-021). */
  | 'duplicada_en_archivo'
  /** Alta masiva: coincide con un libro activo existente (FR-019). */
  | 'duplicada_de_activo'
  /** Ambos: falta un campo, o stock/precio fuera de rango (FR-019). */
  | 'invalida';

/**
 * Las categorías que generan una fila de reporte. `aplicada` queda afuera por
 * definición: es el caso en que el cambio se hizo. Es el vocabulario exacto de
 * `reporte_fila.motivo` y de su `CHECK` en el esquema (T015).
 */
export type MotivoNoAplicada = Exclude<CategoriaFila, 'aplicada'>;

export const CATEGORIAS_FILA = [
  'aplicada',
  'sin_cambio',
  'sin_coincidencia',
  'coincide_archivado',
  'casi_coincidencia',
  'duplicada_en_archivo',
  'duplicada_de_activo',
  'invalida',
] as const satisfies readonly CategoriaFila[];

/** Las que puede emitir el flujo de actualización de precios (RF-06). */
export const CATEGORIAS_PRECIOS = [
  'aplicada',
  'sin_cambio',
  'sin_coincidencia',
  'coincide_archivado',
  'casi_coincidencia',
  'duplicada_en_archivo',
  'invalida',
] as const satisfies readonly CategoriaFila[];

/**
 * Las que puede emitir el flujo de alta masiva (RF-18). No incluye
 * `casi_coincidencia`: en este flujo la comparación es sólo exacta y una
 * variante de edición es un libro nuevo (RF-19, AC-33).
 */
export const CATEGORIAS_ALTA_MASIVA = [
  'aplicada',
  'duplicada_en_archivo',
  'duplicada_de_activo',
  'invalida',
] as const satisfies readonly CategoriaFila[];

/**
 * Comprobación en tiempo de compilación de que `CATEGORIAS_FILA` enumera **todas**
 * las categorías del tipo. Si mañana se agrega una variante al union y se olvida
 * acá, `tsc` falla en esta línea en vez de dejar una categoría fuera del reporte
 * y romper el invariante de completitud en silencio.
 */
type SinEnumerar = Exclude<CategoriaFila, (typeof CATEGORIAS_FILA)[number]>;
const _todasEnumeradas: SinEnumerar extends never ? true : never = true;
void _todasEnumeradas;
