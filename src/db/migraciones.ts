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
export const VERSION_ESQUEMA = 1;

function leerEsquema(): string {
  // Se resuelve desde la raíz del proyecto y no desde `import.meta.url`: el
  // empaquetado de Next reubica los módulos del servidor, y la ruta relativa al
  // módulo dejaría de existir en el build.
  return readFileSync(join(process.cwd(), 'src', 'db', 'esquema.sql'), 'utf8');
}

export function migrar(db: BetterSqlite3.Database): void {
  db.exec(leerEsquema());
  db.pragma(`user_version = ${VERSION_ESQUEMA}`);
}

export function versionDeLaBase(db: BetterSqlite3.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}
