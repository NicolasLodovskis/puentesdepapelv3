import type BetterSqlite3 from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aplicación del esquema, idempotente (T017).
 *
 * No es un motor de migraciones: es lo mínimo que este sistema necesita. Hay una
 * sola base, local y de una sola usuaria, y `esquema.sql` está escrito con
 * `CREATE TABLE IF NOT EXISTS`, así que aplicarlo de nuevo sobre una base ya
 * creada no hace nada. `user_version` queda registrada para que una migración
 * futura —agregar una columna, por ejemplo— tenga de dónde saber en qué versión
 * está la base sin inspeccionar el esquema.
 *
 * Deliberadamente NO borra ni recrea nada: el archivo `.db` es el inventario
 * real de la librería y no hay resguardo (PRD §7, riesgo asumido).
 */

/** Subir este número al agregar una migración, nunca al corregir el DDL vigente. */
export const VERSION_ESQUEMA = 2;

/** Columnas de marca temporal, por tabla. */
const COLUMNAS_DE_FECHA: ReadonlyArray<readonly [tabla: string, columna: string]> = [
  ['libro', 'creado_en'],
  ['movimiento_precio', 'fecha'],
  ['movimiento_stock', 'fecha'],
  ['venta', 'fecha'],
  ['reporte_importacion', 'fecha'],
];

/**
 * v2 — las marcas temporales pasan de UTC (`…Z`) a la hora de la librería
 * (`…-03:00`), según R6 enmendado.
 *
 * Convertir las existentes no es cosmético: si quedaran filas en UTC junto a
 * filas en UTC-3, el orden lexicográfico dejaría de coincidir con el
 * cronológico y el historial mostraría los movimientos en un orden equivocado
 * — que es justo lo que R6 buscaba garantizar.
 *
 * SQLite resuelve la conversión sin traer los datos a JavaScript: `datetime`
 * resta las 3 horas y el formato se rearma con el desfase explícito.
 */
function aHoraDeLaLibreria(db: BetterSqlite3.Database): void {
  for (const [tabla, columna] of COLUMNAS_DE_FECHA) {
    db.prepare(
      `UPDATE ${tabla}
          SET ${columna} = strftime('%Y-%m-%dT%H:%M:%S', ${columna}, '-3 hours')
                           || substr(${columna}, 20, 4) || '-03:00'
        WHERE ${columna} LIKE '%Z'`,
    ).run();
  }
}

function leerEsquema(): string {
  // Se resuelve desde la raíz del proyecto y no desde `import.meta.url`: el
  // empaquetado de Next reubica los módulos del servidor, y la ruta relativa al
  // módulo dejaría de existir en el build.
  return readFileSync(join(process.cwd(), 'src', 'db', 'esquema.sql'), 'utf8');
}

export function migrar(db: BetterSqlite3.Database): void {
  const version = versionDeLaBase(db);

  db.exec(leerEsquema());

  // Las migraciones de datos corren en una transacción y sólo si la base viene
  // de una versión anterior: aplicarlas dos veces no debe cambiar nada.
  if (version < 2) {
    db.transaction(() => aHoraDeLaLibreria(db))();
  }

  db.pragma(`user_version = ${VERSION_ESQUEMA}`);
}

export function versionDeLaBase(db: BetterSqlite3.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}
