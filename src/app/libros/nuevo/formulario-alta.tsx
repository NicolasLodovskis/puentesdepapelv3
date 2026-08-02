'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { altaLibroAction } from '@/app/actions/catalogo';
import { ESTADO_ALTA_INICIAL } from '@/app/actions/estados';

/**
 * Formulario de alta (T030).
 *
 * Los mensajes se muestran **junto al campo que falla**, que es lo que
 * `ErrorNegocio` permite al llevar `campo`. La foto es opcional (US1 esc. 5):
 * se guarda ahora y su embedding se calcula en T089.
 */
export function FormularioAlta() {
  const [estado, accion, enviando] = useActionState(altaLibroAction, ESTADO_ALTA_INICIAL);
  const error = estado.estado === 'error' ? estado : null;
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : null);

  return (
    <form action={accion} className="formulario">
      <h1>Nuevo libro</h1>

      {estado.estado === 'ok' && (
        <p className="aviso-ok" role="status">
          Se cargó «{estado.titulo}». <Link href="/">Buscarlo</Link> o cargar otro.
        </p>
      )}

      {error !== null && error.campo === undefined && (
        <p className="error" role="alert">
          {error.mensaje}
        </p>
      )}

      <label>
        Título
        <input name="titulo" type="text" autoComplete="off" required />
        {errorDe('titulo') !== null && (
          <span className="error" role="alert">
            {errorDe('titulo')}
          </span>
        )}
      </label>

      {error?.duplicado !== undefined && (
        <p className="aviso" role="alert">
          {error.duplicado.estadoLibro === 'archivado'
            ? 'Ese libro existe pero está archivado. Se podrá reactivar desde la pantalla de archivados.'
            : 'Ese libro ya está en el catálogo.'}
        </p>
      )}

      <label>
        Editorial
        <input name="editorial" type="text" autoComplete="off" required />
        {errorDe('editorial') !== null && (
          <span className="error" role="alert">
            {errorDe('editorial')}
          </span>
        )}
      </label>

      <label>
        Stock
        <input name="stock" type="number" min="0" step="1" defaultValue="0" required />
        {errorDe('stock') !== null && (
          <span className="error" role="alert">
            {errorDe('stock')}
          </span>
        )}
      </label>

      <label>
        Precio
        {/* Entero, sin decimales: el sistema no maneja centavos (RF-01, RF-31). */}
        <input name="precio" type="number" min="1" step="1" required />
        {errorDe('precio') !== null && (
          <span className="error" role="alert">
            {errorDe('precio')}
          </span>
        )}
      </label>

      <label>
        Foto <span className="opcional">(opcional)</span>
        <input name="foto" type="file" accept="image/*" />
      </label>

      <button type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar libro'}
      </button>
    </form>
  );
}
