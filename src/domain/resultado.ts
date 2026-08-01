/**
 * Contrato de resultado de todo caso de uso (contracts/server-actions.md).
 *
 * Nada lanza para errores esperables: un título duplicado, un precio inválido o
 * un libro sin stock son respuestas previstas, no excepciones. La spec exige
 * mensajes, no `try/catch` (FR-002, FR-029), y el tipo discriminado obliga al
 * llamador a contemplar la rama de error para poder leer el valor.
 *
 * Este archivo es sólo tipos: no genera código en tiempo de ejecución.
 */

/** Campos de un libro que la validación puede señalar como problemáticos. */
export type CampoLibro = 'titulo' | 'editorial' | 'stock' | 'precio';

/** Estado del ciclo de vida de un libro. La baja es siempre lógica (FR-011). */
export type EstadoLibro = 'activo' | 'archivado';

export type ErrorNegocio =
  | { tipo: 'validacion'; campo: CampoLibro; mensaje: string }
  /**
   * `libroId` y `estado` van a propósito: cuando el duplicado es un libro
   * **archivado**, la UI necesita ofrecer reactivarlo (FR-004, FR-035, US6
   * esc. 6). Sin esos dos campos ese camino no se puede construir.
   */
  | { tipo: 'titulo_duplicado'; libroId: number; estado: EstadoLibro; mensaje: string }
  | { tipo: 'sin_stock'; mensaje: string }
  | { tipo: 'no_encontrado'; mensaje: string }
  | { tipo: 'estado_invalido'; mensaje: string };

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: ErrorNegocio };
