'use client';

import { useActionState } from 'react';
import { buscarLibrosAction } from '@/app/actions/busqueda';
import { ESTADO_BUSQUEDA_INICIAL } from '@/app/actions/estados';

/**
 * Búsqueda y consulta de precio (T031) — la pantalla principal, porque es la
 * que reemplaza el trabajo manual de la librera.
 *
 * El precio va destacado y con cifras tabulares: es el dato que se viene a
 * buscar. Cuando no hay coincidencias se lo dice explícitamente en vez de
 * mostrar una tabla vacía, y nunca se ofrece un libro aproximado como si fuera
 * el buscado (Principio II).
 */
export function Buscador() {
  const [estado, accion, buscando] = useActionState(buscarLibrosAction, ESTADO_BUSQUEDA_INICIAL);

  return (
    <>
      <form action={accion} className="buscador">
        <label className="campo-busqueda">
          Buscar un libro
          <input
            name="texto"
            type="search"
            placeholder="Título o editorial"
            autoComplete="off"
            autoFocus
          />
        </label>

        <label>
          Buscar en
          <select name="campo" defaultValue="ambos">
            <option value="ambos">Título y editorial</option>
            <option value="titulo">Sólo título</option>
            <option value="editorial">Sólo editorial</option>
          </select>
        </label>

        <button type="submit" disabled={buscando}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {estado.estado === 'resultados' && <Resultados {...estado} />}
    </>
  );
}

function Resultados({
  texto,
  libros,
}: {
  texto: string;
  libros: ReadonlyArray<{
    libroId: number;
    titulo: string;
    editorial: string;
    stock: number;
    precio: number;
    tieneFoto: boolean;
  }>;
}) {
  if (texto.trim() === '') {
    return <p className="vacio">Escribí un título o una editorial para buscar.</p>;
  }

  if (libros.length === 0) {
    return (
      <p className="vacio" role="status">
        Ningún libro del catálogo coincide con «{texto}».
      </p>
    );
  }

  return (
    <>
      <p className="conteo" role="status">
        {libros.length === 1 ? '1 libro encontrado' : `${libros.length} libros encontrados`}
      </p>
      <table className="tabla-libros">
        <thead>
          <tr>
            <th scope="col">Título</th>
            <th scope="col">Editorial</th>
            <th scope="col" className="numero">
              Stock
            </th>
            <th scope="col" className="numero">
              Precio
            </th>
          </tr>
        </thead>
        <tbody>
          {libros.map((libro) => (
            <tr key={libro.libroId}>
              <td>
                {libro.titulo}
                {libro.tieneFoto && (
                  <span className="marca-foto" title="Tiene foto cargada">
                    {' '}
                    ◧
                  </span>
                )}
              </td>
              <td>{libro.editorial}</td>
              <td className="numero">{libro.stock}</td>
              <td className="numero precio">$ {libro.precio.toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
