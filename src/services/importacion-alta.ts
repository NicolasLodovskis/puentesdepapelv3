import type BetterSqlite3 from 'better-sqlite3';
import { enTransaccion } from '@/db/transaccion';
import { ahora } from '@/domain/fecha';
import type { FilaClasificada, LibroCatalogo } from '@/excel/clasificar';
import { clasificarAltaMasiva } from '@/excel/clasificar';
import { COLUMNAS_ALTA_MASIVA, leerExcel } from '@/excel/leer';
import type { FilaNoAplicada, RespuestaImportacion } from '@/excel/reporte';
import { aFilaNoAplicada } from '@/excel/reporte';
import { altaLibro } from './catalogo';

/**
 * Alta masiva de libros desde un Excel (T040, RF-18, FR-016 a FR-019, FR-021).
 *
 * Tres decisiones sostienen este caso de uso:
 *
 * 1. **El rechazo por columnas es total** (FR-016): sin las cuatro columnas no
 *    hay fila que clasificar, y aplicar "lo que se pueda" dejaría el catálogo a
 *    medio cargar y a la librera sin saber cuánto de su archivo entró.
 * 2. **Una transacción por fila**, no una por archivo: en un archivo de 5.000
 *    filas, una fila que falle no puede llevarse puestas las 4.999 que ya
 *    entraron. Cada fila escribe su libro y sus dos entradas de historial de
 *    forma indivisible, que es lo que exige el Principio III.
 * 3. **La clasificación se hace contra el catálogo previo**, en un solo paso y
 *    antes de aplicar nada. Así el resultado no depende de en qué orden se
 *    aplicaron las filas, y el mismo archivo contra el mismo catálogo produce
 *    siempre el mismo reporte.
 *
 * El reporte de este flujo **no se persiste**: `reporteId` es `null`, a
 * diferencia del de precios (FR-036).
 */

export interface ArchivoExcel {
  nombre: string;
  /** Ruta del archivo o su contenido en memoria. */
  origen: string | Buffer;
}

export async function importarAltaMasiva(
  db: BetterSqlite3.Database,
  archivo: ArchivoExcel,
): Promise<RespuestaImportacion> {
  const lectura = await leerExcel(archivo.origen, COLUMNAS_ALTA_MASIVA);
  if (!lectura.ok) {
    return lectura;
  }

  const clasificadas = clasificarAltaMasiva(lectura.filas, leerCatalogo(db));

  let filasAplicadas = 0;
  const noAplicadas: FilaNoAplicada[] = [];

  for (const fila of clasificadas) {
    if (fila.categoria !== 'aplicada') {
      noAplicadas.push(aFilaNoAplicada(fila));
      continue;
    }

    const rechazo = aplicar(db, fila);
    if (rechazo === null) {
      filasAplicadas += 1;
    } else {
      noAplicadas.push(rechazo);
    }
  }

  return {
    ok: true,
    reporte: {
      reporteId: null,
      nombreArchivo: archivo.nombre,
      filasTotales: lectura.filas.length,
      filasAplicadas,
      noAplicadas,
    },
  };
}

function leerCatalogo(db: BetterSqlite3.Database): LibroCatalogo[] {
  return db
    .prepare(
      `SELECT id, titulo_normalizado AS tituloNormalizado, estado, precio
         FROM libro`,
    )
    .all() as LibroCatalogo[];
}

/**
 * Aplica una fila. Devuelve `null` si se aplicó, o su línea de reporte si la
 * base la rechazó.
 *
 * Ese segundo caso no debería ocurrir —la clasificación ya descartó los títulos
 * repetidos y los que están en el catálogo—, pero si ocurriera, la fila tiene
 * que aparecer en el reporte igual: dejarla afuera rompería el invariante de
 * completitud, y dejar que la excepción suba abortaría el resto del archivo por
 * una sola fila.
 */
function aplicar(db: BetterSqlite3.Database, fila: FilaClasificada): FilaNoAplicada | null {
  const campos = fila.campos;
  if (campos === undefined) {
    throw new TypeError('una fila aplicable tiene que traer sus campos validados');
  }

  if (fila.libro !== undefined) {
    reactivar(db, fila.libro.id, campos.stock, campos.precio);
    return null;
  }

  // Mismo camino que el alta manual, con otro origen: la validación, la
  // unicidad, la transacción y las dos entradas de historial son las mismas.
  const alta = altaLibro(db, campos, 'alta por Excel');
  if (alta.ok) {
    return null;
  }

  return {
    numeroFila: fila.numeroFila,
    tituloCrudo: fila.tituloCrudo,
    motivo: alta.error.tipo === 'titulo_duplicado' ? 'duplicada_de_activo' : 'invalida',
    detalle: alta.error.mensaje,
  };
}

/**
 * Reactivación por Excel (FR-018): el libro archivado vuelve a activo con el
 * stock y el precio de la fila.
 *
 * Las dos entradas se escriben **siempre**, aunque los valores coincidan con los
 * que el libro ya tenía: la reactivación es un cambio de estado que el historial
 * tiene que poder reconstruir, y es la excepción explícita a la regla de
 * no-cambio (FR-027b, FR-035).
 *
 * Sólo se tocan el estado, el stock y el precio. El título y la editorial que
 * trae la fila no se aplican: FR-018 no lo pide, y sobrescribirlos cambiaría
 * datos que la librera no pidió cambiar.
 */
function reactivar(
  db: BetterSqlite3.Database,
  libroId: number,
  stock: number,
  precio: number,
): void {
  const fecha = ahora();

  enTransaccion(db, () => {
    const anterior = db
      .prepare('SELECT stock, precio FROM libro WHERE id = ?')
      .get(libroId) as { stock: number; precio: number };

    db.prepare(`UPDATE libro SET estado = 'activo', stock = ?, precio = ? WHERE id = ?`).run(
      stock,
      precio,
      libroId,
    );

    db.prepare(
      `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                     cantidad_resultante, origen)
       VALUES (?, ?, ?, ?, 'alta por Excel')`,
    ).run(libroId, fecha, anterior.stock, stock);

    db.prepare(
      `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
       VALUES (?, ?, ?, ?, 'alta por Excel')`,
    ).run(libroId, fecha, anterior.precio, precio);
  });
}
