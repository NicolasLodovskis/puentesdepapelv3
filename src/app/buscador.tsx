'use client';

import { useActionState } from 'react';
import { buscarLibrosAction } from '@/app/actions/busqueda';
import { ESTADO_VENTA_INICIAL, type EstadoBusqueda } from '@/app/actions/estados';
import { venderUnidadAction } from '@/app/actions/operacion';

/**
 * Búsqueda y consulta de precio (T031) — la pantalla principal, porque es la
 * que reemplaza el trabajo manual de la librera.
 *
 * El precio va destacado y con cifras tabulares: es el dato que se viene a
 * buscar. Cuando no hay coincidencias se lo dice explícitamente en vez de
 * mostrar una tabla vacía, y nunca se ofrece un libro aproximado como si fuera
 * el buscado (Principio II).
 */
export function Buscador({ estadoInicial }: { estadoInicial: EstadoBusqueda }) {
  const [estado, accion, buscando] = useActionState(buscarLibrosAction, estadoInicial);

  return (
    <>
      <form action={accion} className="buscador">
        <label className="campo-busqueda">
          Buscar un libro
          <input
            name="texto"
            type="search"
            placeholder="Título o editorial — vacío lista todo"
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

function Resultados({ texto, libros }: { texto: string; libros: ReadonlyArray<LibroListado> }) {
  const esCatalogoCompleto = texto.trim() === '';

  if (libros.length === 0) {
    return (
      <p className="vacio" role="status">
        {esCatalogoCompleto
          ? 'Todavía no hay libros cargados.'
          : `Ningún libro del catálogo coincide con «${texto}».`}
      </p>
    );
  }

  return (
    <>
      <p className="conteo" role="status">
        {esCatalogoCompleto
          ? `Catálogo completo · ${libros.length} ${libros.length === 1 ? 'libro' : 'libros'}`
          : `${libros.length} ${libros.length === 1 ? 'libro encontrado' : 'libros encontrados'}`}
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
            <th scope="col">
              <span className="oculto">Venta</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {libros.map((libro) => (
            <FilaLibro key={libro.libroId} libro={libro} />
          ))}
        </tbody>
      </table>
    </>
  );
}

interface LibroListado {
  libroId: number;
  titulo: string;
  editorial: string;
  stock: number;
  precio: number;
  tieneFoto: boolean;
}

/**
 * La venta se hace desde el resultado de la búsqueda (T048), que es donde la
 * librera ya está: buscó el libro para decirle el precio al cliente, y vender es
 * el paso siguiente de esa misma conversación.
 *
 * Cada fila lleva su propio estado de venta. Es lo que permite que el stock que
 * se muestra sea el que quedó, sin volver a buscar: el resultado de la búsqueda
 * es una foto del momento en que se buscó, y después de vender esa foto está
 * vencida sólo para esta fila.
 */
function FilaLibro({ libro }: { libro: LibroListado }) {
  const [venta, vender, vendiendo] = useActionState(venderUnidadAction, ESTADO_VENTA_INICIAL);

  const stock = venta.estado === 'ok' ? venta.stockResultante : libro.stock;

  return (
    <tr>
      <td>
        {libro.titulo}
        {libro.tieneFoto && (
          <span className="marca-foto" title="Tiene foto cargada">
            {' '}
            ◧
          </span>
        )}
        {venta.estado === 'ok' && (
          <span className="venta-hecha" role="status">
            {' '}
            · vendido a $ {venta.precioVenta.toLocaleString('es-AR')}
          </span>
        )}
        {venta.estado === 'error' && (
          <span className="error" role="alert">
            {' '}
            · {venta.mensaje}
          </span>
        )}
      </td>
      <td>{libro.editorial}</td>
      <td className="numero">{stock}</td>
      <td className="numero precio">$ {libro.precio.toLocaleString('es-AR')}</td>
      <td>
        <form action={vender}>
          <input type="hidden" name="libroId" value={libro.libroId} />
          {/* Sin ejemplares no hay nada que vender: el botón se deshabilita en
              vez de dejar intentar y responder que no (FR-010). */}
          <button type="submit" className="boton-fila" disabled={vendiendo || stock === 0}>
            {vendiendo ? 'Vendiendo…' : 'Vender'}
          </button>
        </form>
      </td>
    </tr>
  );
}
