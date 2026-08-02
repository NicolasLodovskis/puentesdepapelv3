import { describe, expect, it } from 'vitest';
import { VERSION_ESQUEMA } from '@/db/migraciones';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * Migración v2: las marcas temporales pasan de UTC a la hora de la librería
 * (R6 enmendado el 2026-08-02).
 *
 * Convertir las filas viejas no es cosmético. Si quedaran marcas en UTC junto a
 * marcas en UTC-3, el orden lexicográfico dejaría de coincidir con el
 * cronológico y el historial mostraría los movimientos en un orden equivocado,
 * que es exactamente la propiedad que R6 buscaba garantizar.
 */

type Base = ReturnType<typeof baseTemporal>;

/** Escribe una fila con marca en UTC, como las que dejó la versión 1. */
function libroConMarcaVieja(db: Base, titulo: string, normalizado: string, marca: string): number {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                          stock, precio, creado_en)
       VALUES (?, ?, 'Emece', 'emece', 2, 15900, ?)`,
    )
    .run(titulo, normalizado, marca);
  const id = Number(lastInsertRowid);

  db.prepare(
    `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
     VALUES (?, ?, 0, 15900, 'alta manual')`,
  ).run(id, marca);
  db.prepare(
    `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior, cantidad_resultante, origen)
     VALUES (?, ?, 0, 2, 'alta manual')`,
  ).run(id, marca);

  return id;
}

async function migrarDeNuevo(db: Base): Promise<void> {
  const { migrar } = await import('@/db/migraciones');
  // Se simula una base que viene de la versión anterior.
  db.pragma('user_version = 1');
  migrar(db);
}

describe('migración a la hora de la librería', () => {
  it('convierte una marca UTC a UTC-3 conservando el instante', async () => {
    const db = baseTemporal();
    const id = libroConMarcaVieja(db, 'El Principito', 'principito', '2026-08-02T01:08:40.583Z');

    await migrarDeNuevo(db);

    const { creado_en: creadoEn } = db
      .prepare('SELECT creado_en FROM libro WHERE id = ?')
      .get(id) as { creado_en: string };

    expect(creadoEn).toBe('2026-08-01T22:08:40.583-03:00');
    // Y sigue siendo el mismo momento, no una hora corrida.
    expect(new Date(creadoEn).getTime()).toBe(new Date('2026-08-02T01:08:40.583Z').getTime());
  });

  it('convierte también los dos historiales', async () => {
    const db = baseTemporal();
    libroConMarcaVieja(db, 'El Principito', 'principito', '2026-08-02T01:08:40.583Z');

    await migrarDeNuevo(db);

    for (const tabla of ['movimiento_precio', 'movimiento_stock']) {
      const { fecha } = db.prepare(`SELECT fecha FROM ${tabla}`).get() as { fecha: string };
      expect(fecha).toBe('2026-08-01T22:08:40.583-03:00');
    }
  });

  it('conserva los milisegundos, que desempatan el orden del historial', async () => {
    const db = baseTemporal();
    libroConMarcaVieja(db, 'Rayuela', 'rayuela', '2026-08-02T12:00:00.007Z');

    await migrarDeNuevo(db);

    const { creado_en: creadoEn } = db.prepare('SELECT creado_en FROM libro').get() as {
      creado_en: string;
    };
    expect(creadoEn).toBe('2026-08-02T09:00:00.007-03:00');
  });

  it('deja intactas las marcas que ya están en UTC-3, y no las corre otra vez', async () => {
    const db = baseTemporal();
    libroConMarcaVieja(db, 'Zama', 'zama', '2026-08-01T22:08:40.583-03:00');

    await migrarDeNuevo(db);
    await migrarDeNuevo(db);

    const { creado_en: creadoEn } = db.prepare('SELECT creado_en FROM libro').get() as {
      creado_en: string;
    };
    expect(creadoEn).toBe('2026-08-01T22:08:40.583-03:00');
  });

  it('tras migrar, el orden alfabético de las marcas sigue siendo el cronológico', async () => {
    const db = baseTemporal();
    libroConMarcaVieja(db, 'Primero', 'primero', '2026-08-02T01:00:00.000Z');
    libroConMarcaVieja(db, 'Segundo', 'segundo', '2026-08-02T02:00:00.000Z');
    libroConMarcaVieja(db, 'Tercero', 'tercero', '2026-08-03T00:30:00.000Z');

    await migrarDeNuevo(db);

    const titulos = db.prepare('SELECT titulo FROM libro ORDER BY creado_en').all() as Array<{
      titulo: string;
    }>;

    expect(titulos.map((t) => t.titulo)).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it('una base nueva queda en la versión vigente del esquema', () => {
    const db = baseTemporal();
    expect(db.pragma('user_version', { simple: true })).toBe(VERSION_ESQUEMA);
  });
});
