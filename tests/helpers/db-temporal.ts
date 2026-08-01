import type BetterSqlite3 from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { abrirBase } from '@/db/conexion';
import { migrar } from '@/db/migraciones';

/**
 * Base aislada por test (T018).
 *
 * Es **en archivo** y no en memoria a propósito: en memoria no se ejercitan el
 * modo WAL ni el comportamiento real de las transacciones sobre disco, que es
 * justo lo que sostiene el invariante del Principio III. Un test que pasa contra
 * `:memory:` puede no decir nada sobre la base real.
 *
 * Cada llamada crea su propio directorio temporal, así que dos tests nunca
 * comparten estado ni pueden pisarse aunque corran en paralelo. La limpieza se
 * registra sola con `afterEach`: si hubiera que acordarse de llamarla, tarde o
 * temprano un test se olvidaría y dejaría archivos regados.
 */
export function baseTemporal(): BetterSqlite3.Database {
  const directorio = mkdtempSync(join(tmpdir(), 'puentes-test-'));
  const db = abrirBase(join(directorio, 'prueba.db'));
  migrar(db);

  afterEach(() => {
    db.close();
    // Se lleva también los archivos -wal y -shm que deja el modo WAL.
    rmSync(directorio, { recursive: true, force: true });
  });

  return db;
}
