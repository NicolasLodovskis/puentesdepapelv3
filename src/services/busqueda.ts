import type BetterSqlite3 from 'better-sqlite3';
import { normalizarEditorial, normalizarTitulo } from '@/domain/normalizar-titulo';

/**
 * Búsqueda por texto (FR-005, RNF-01).
 *
 * Matchea por **subcadena** sobre las columnas normalizadas, con el término de
 * búsqueda pasado por la misma normalización que se aplicó al guardar. Esa
 * simetría es lo que hace que buscar `cien anos` encuentre `Cien años` y que
 * `anagrama` encuentre `Anagramá`.
 *
 * A 2.000 libros un `LIKE '%…%'` es un scan de microsegundos, así que no hace
 * falta FTS5 para cumplir RNF-01 (data-model.md).
 */

export interface LibroResumen {
  libroId: number;
  titulo: string;
  editorial: string;
  stock: number;
  precio: number;
  tieneFoto: boolean;
}

export type CampoBusqueda = 'titulo' | 'editorial' | 'ambos';

interface FilaLibro {
  libroId: number;
  titulo: string;
  editorial: string;
  stock: number;
  precio: number;
  tieneFoto: number;
}

const SELECCION = `
  SELECT id            AS libroId,
         titulo,
         editorial,
         stock,
         precio,
         foto IS NOT NULL AS tieneFoto
    FROM libro
   WHERE estado = 'activo'
`;

export function buscarLibros(
  db: BetterSqlite3.Database,
  input: { texto: string; campo: CampoBusqueda },
): LibroResumen[] {
  // Una búsqueda vacía devuelve vacío en lugar del catálogo entero: `LIKE '%%'`
  // matchearía todo, y presentar 2.000 libros como "resultado" de no haber
  // buscado nada no es una respuesta útil ni honesta.
  if (input.texto.trim() === '') {
    return [];
  }

  const porTitulo = normalizarTitulo(input.texto);
  const porEditorial = normalizarEditorial(input.texto);

  // Las dos normalizaciones eliminan o no producen `%` ni `_`, así que no hay
  // comodines que escapar: lo que llega al LIKE es texto plano.
  const condiciones: string[] = [];
  const parametros: string[] = [];

  if (input.campo !== 'editorial' && porTitulo !== '') {
    condiciones.push('titulo_normalizado LIKE ?');
    parametros.push(`%${porTitulo}%`);
  }

  if (input.campo !== 'titulo' && porEditorial !== '') {
    condiciones.push('editorial_normalizada LIKE ?');
    parametros.push(`%${porEditorial}%`);
  }

  if (condiciones.length === 0) {
    return [];
  }

  // Un OR en una sola consulta: un libro que coincide por los dos campos sale
  // una vez sola, sin necesitar deduplicar después.
  const filas = db
    .prepare(`${SELECCION} AND (${condiciones.join(' OR ')}) ORDER BY titulo_normalizado`)
    .all(...parametros) as FilaLibro[];

  return filas.map(({ tieneFoto, ...resto }) => ({ ...resto, tieneFoto: tieneFoto === 1 }));
}
