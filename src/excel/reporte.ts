import type { MotivoNoAplicada } from '@/domain/categorias-fila';
import type { CampoLibro } from '@/domain/resultado';
import type { FilaClasificada } from './clasificar';
import type { ErrorEncabezados } from './leer';

/**
 * Forma del reporte de una importación (contracts/server-actions.md, FR-030).
 *
 * Es lo que hace usable la carga masiva: sin reporte, la librera sube un archivo
 * de 2.000 filas y no sabe cuáles entraron. Por eso el contrato tiene un
 * invariante y no una recomendación:
 *
 *     filasAplicadas + noAplicadas.length === filasTotales
 *
 * Siempre. Es la garantía de que ninguna fila se descartó en silencio, y se
 * verifica como aserción en los tests (Principio II).
 *
 * Vive acá y no en el servicio porque los dos flujos —alta masiva y
 * actualización de precios— reportan con la misma forma.
 */

export interface FilaNoAplicada {
  /** Número de fila en el archivo original, para poder ubicarla. */
  numeroFila: number;
  tituloCrudo: string;
  motivo: MotivoNoAplicada;
  /**
   * El campo que falla, cuando el motivo es `invalida`. Extiende el contrato
   * escrito, que sólo tenía `detalle`: FR-019 exige informar **cuál** de los
   * cuatro campos falla, y meterlo dentro del texto lo volvería imposible de
   * agrupar o de resaltar en la pantalla.
   */
  campo?: CampoLibro;
  /** El mensaje de validación, o el título del libro casi-coincidente. */
  detalle?: string;
}

export interface Reporte {
  /**
   * `number` en el flujo de precios, que persiste su reporte (FR-036); `null`
   * en alta masiva, por decisión explícita de la spec.
   */
  reporteId: number | null;
  nombreArchivo: string;
  filasTotales: number;
  filasAplicadas: number;
  noAplicadas: FilaNoAplicada[];
}

export type RespuestaImportacion =
  | { ok: false; error: ErrorEncabezados }
  | { ok: true; reporte: Reporte };

/**
 * Traduce una fila clasificada a su línea del reporte. `aplicada` no tiene
 * línea —el cambio se hizo— y por eso no se admite acá: si llegara una, sería
 * una fila que se contó como aplicada y como no aplicada a la vez, que es
 * exactamente lo que el invariante de completitud descarta.
 */
export function aFilaNoAplicada(fila: FilaClasificada): FilaNoAplicada {
  if (fila.categoria === 'aplicada') {
    throw new TypeError('una fila aplicada no genera línea de reporte');
  }

  return {
    numeroFila: fila.numeroFila,
    tituloCrudo: fila.tituloCrudo,
    motivo: fila.categoria,
    ...(fila.campo === undefined ? {} : { campo: fila.campo }),
    ...(fila.detalle === undefined ? {} : { detalle: fila.detalle }),
  };
}
