import type { CampoLibro, EstadoLibro } from '@/domain/resultado';
import type { CampoBusqueda, LibroResumen } from '@/services/busqueda';

/**
 * Tipos y estados iniciales de los formularios.
 *
 * Viven acá y **no** en los archivos de acciones porque un módulo `'use server'`
 * sólo puede exportar funciones asincrónicas: cualquier otra exportación lo
 * rompe en tiempo de ejecución, y el error no aparece al compilar ni al
 * renderizar la página, sino recién al enviar el formulario.
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

export type EstadoBusqueda =
  | { estado: 'inicial' }
  | { estado: 'resultados'; texto: string; campo: CampoBusqueda; libros: LibroResumen[] };

export const ESTADO_BUSQUEDA_INICIAL: EstadoBusqueda = { estado: 'inicial' };
