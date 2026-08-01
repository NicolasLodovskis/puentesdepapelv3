'use server';

import { revalidatePath } from 'next/cache';
import { obtenerBase } from '@/db/conexion';
import type { CampoLibro, EstadoLibro } from '@/domain/resultado';
import { altaLibro } from '@/services/catalogo';

/**
 * Borde UI → servicios para el catálogo (T028).
 *
 * Acá vive el `async` que Next exige de una Server Action; el caso de uso que
 * llama es sincrónico, porque su transacción no puede serlo. La acción no toca
 * SQL: traduce `FormData` a la entrada del servicio y el `Resultado` a algo que
 * el formulario pueda mostrar campo por campo.
 */

export type EstadoAlta =
  | { estado: 'inicial' }
  | { estado: 'ok'; libroId: number; titulo: string }
  | {
      estado: 'error';
      mensaje: string;
      campo?: CampoLibro;
      /** Presente cuando el título choca con un libro existente: deja ofrecer reactivarlo. */
      duplicado?: { libroId: number; estadoLibro: EstadoLibro };
    };

export const ESTADO_ALTA_INICIAL: EstadoAlta = { estado: 'inicial' };

async function leerFoto(formData: FormData): Promise<Uint8Array | undefined> {
  const archivo = formData.get('foto');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return undefined;
  }
  return new Uint8Array(await archivo.arrayBuffer());
}

export async function altaLibroAction(
  _estadoPrevio: EstadoAlta,
  formData: FormData,
): Promise<EstadoAlta> {
  const resultado = altaLibro(obtenerBase(), {
    // Los campos llegan como texto del formulario; `validarCamposLibro` los
    // convierte y rechaza lo que no corresponda.
    titulo: formData.get('titulo'),
    editorial: formData.get('editorial'),
    stock: formData.get('stock'),
    precio: formData.get('precio'),
    foto: await leerFoto(formData),
  });

  if (resultado.ok) {
    revalidatePath('/');
    return {
      estado: 'ok',
      libroId: resultado.valor.libroId,
      titulo: String(formData.get('titulo') ?? '').trim(),
    };
  }

  const { error } = resultado;

  if (error.tipo === 'titulo_duplicado') {
    return {
      estado: 'error',
      mensaje: error.mensaje,
      campo: 'titulo',
      duplicado: { libroId: error.libroId, estadoLibro: error.estado },
    };
  }

  return {
    estado: 'error',
    mensaje: error.mensaje,
    campo: error.tipo === 'validacion' ? error.campo : undefined,
  };
}
