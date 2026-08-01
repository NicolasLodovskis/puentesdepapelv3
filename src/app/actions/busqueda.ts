'use server';

import { obtenerBase } from '@/db/conexion';
import { buscarLibros, type CampoBusqueda, type LibroResumen } from '@/services/busqueda';

/**
 * Borde UI → servicios para la búsqueda (T029).
 */

export type EstadoBusqueda =
  | { estado: 'inicial' }
  | { estado: 'resultados'; texto: string; campo: CampoBusqueda; libros: LibroResumen[] };

export const ESTADO_BUSQUEDA_INICIAL: EstadoBusqueda = { estado: 'inicial' };

const CAMPOS: readonly CampoBusqueda[] = ['titulo', 'editorial', 'ambos'];

function campoDe(valor: FormDataEntryValue | null): CampoBusqueda {
  return CAMPOS.includes(valor as CampoBusqueda) ? (valor as CampoBusqueda) : 'ambos';
}

export async function buscarLibrosAction(
  _estadoPrevio: EstadoBusqueda,
  formData: FormData,
): Promise<EstadoBusqueda> {
  const texto = String(formData.get('texto') ?? '');
  const campo = campoDe(formData.get('campo'));

  return {
    estado: 'resultados',
    texto,
    campo,
    libros: buscarLibros(obtenerBase(), { texto, campo }),
  };
}
