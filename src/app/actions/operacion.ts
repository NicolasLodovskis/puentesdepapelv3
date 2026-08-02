'use server';

import { revalidatePath } from 'next/cache';
import { obtenerBase } from '@/db/conexion';
import { venderUnidad } from '@/services/operacion';
import type { EstadoVenta } from './estados';

/**
 * Borde UI → servicios para la venta (T047).
 *
 * Acá vive el `async` que Next exige de una Server Action; el caso de uso que
 * llama es sincrónico, porque su transacción no puede serlo. La acción no toca
 * SQL: traduce el `FormData` a la entrada del servicio y su `Resultado` a lo que
 * la fila del listado necesita mostrar.
 */
export async function venderUnidadAction(
  _estadoPrevio: EstadoVenta,
  formData: FormData,
): Promise<EstadoVenta> {
  const libroId = Number(formData.get('libroId'));

  if (!Number.isInteger(libroId)) {
    return { estado: 'error', mensaje: 'No se pudo identificar el libro.' };
  }

  const resultado = venderUnidad(obtenerBase(), { libroId });

  if (!resultado.ok) {
    return { estado: 'error', mensaje: resultado.error.mensaje };
  }

  // El listado se sirve en cada visita: al recargar la pantalla el stock ya
  // tiene que venir descontado.
  revalidatePath('/');

  return {
    estado: 'ok',
    libroId,
    titulo: resultado.valor.titulo,
    precioVenta: resultado.valor.precioVenta,
    stockResultante: resultado.valor.stockResultante,
  };
}
