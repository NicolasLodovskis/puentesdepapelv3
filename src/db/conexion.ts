import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { migrar } from './migraciones';

/**
 * Apertura de la base SQLite (data-model.md, research.md § R7).
 *
 * Un único archivo local, sin servidor. Cada conexión se abre con los dos
 * `PRAGMA` de los que dependen invariantes del sistema, no con preferencias de
 * rendimiento: sin `foreign_keys = ON` —que SQLite deja **apagado** por
 * omisión— una entrada de historial podría quedar apuntando a un libro
 * inexistente y el Principio III se sostendría sólo por disciplina del código.
 */

/** Ruta por defecto, relativa a la raíz del proyecto. Cubierta por `.gitignore`. */
const RUTA_POR_DEFECTO = join('datos', 'puentes.db');

export function rutaBase(): string {
  // Configurable por entorno para no clavar una ruta de una máquina concreta
  // en el código (Principio IV).
  const configurada = process.env.RUTA_BASE?.trim();
  const ruta = configurada !== undefined && configurada !== '' ? configurada : RUTA_POR_DEFECTO;
  return isAbsolute(ruta) ? ruta : join(process.cwd(), ruta);
}

export function abrirBase(ruta: string): Database.Database {
  mkdirSync(dirname(ruta), { recursive: true });

  const db = new Database(ruta);

  // WAL: lecturas y escrituras no se bloquean entre sí. Con una sola usuaria no
  // hay contención real, pero evita que una consulta larga trabe una escritura.
  db.pragma('journal_mode = WAL');

  // Sin esto las FK son decorativas: SQLite las apaga por omisión y en cada
  // conexión por separado.
  db.pragma('foreign_keys = ON');

  return db;
}

let instancia: Database.Database | null = null;

/**
 * Conexión compartida del proceso. Next.js sirve todo desde un solo proceso, así
 * que abrir la base una vez y reutilizarla evita quedarse con descriptores
 * abiertos en cada recarga del servidor de desarrollo.
 */
export function obtenerBase(): Database.Database {
  if (instancia === null) {
    instancia = abrirBase(rutaBase());
    // El esquema se aplica al abrir: es idempotente, así que la aplicación
    // arranca contra una base vacía sin ningún paso manual previo.
    migrar(instancia);
  }
  return instancia;
}

export function cerrarBase(): void {
  instancia?.close();
  instancia = null;
}
