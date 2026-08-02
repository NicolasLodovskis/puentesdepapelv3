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

/**
 * Orden alfabético en español sobre el título **tal como se muestra** (RF-10).
 *
 * Se ordena acá y no con `ORDER BY` porque SQLite compara byte a byte: las
 * palabras con acento caerían después de la z y la ñ quedaría fuera de lugar.
 * `Intl.Collator` con locale `es` da el orden que espera una persona, y
 * `numeric` hace que "Tomo 2" preceda a "Tomo 10" en vez de ordenarse como
 * texto. A 2.000 libros ordenar en memoria es despreciable.
 */
const ORDEN_ALFABETICO = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export function buscarLibros(
  db: BetterSqlite3.Database,
  input: { texto: string; campo: CampoBusqueda },
): LibroResumen[] {
  // Con el término vacío se lista el catálogo activo completo: es la vista de
  // catálogo (RF-10). Sin ella, ver un libro exigiría saber de antemano cómo se
  // llama.
  if (input.texto.trim() === '') {
    return ordenar(db.prepare(SELECCION).all() as FilaLibro[]);
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
    .prepare(`${SELECCION} AND (${condiciones.join(' OR ')})`)
    .all(...parametros) as FilaLibro[];

  return ordenar(filas);
}

function ordenar(filas: FilaLibro[]): LibroResumen[] {
  return filas
    .map(({ tieneFoto, ...resto }) => ({ ...resto, tieneFoto: tieneFoto === 1 }))
    .sort((a, b) => ORDEN_ALFABETICO.compare(a.titulo, b.titulo));
}
