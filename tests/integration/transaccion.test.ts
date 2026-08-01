import { describe, expect, it } from 'vitest';
import { enTransaccion } from '@/db/transaccion';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * El invariante del Principio III y de FR-027: la escritura del dato y la de su
 * entrada de historial ocurren en la misma transacción. **Si falla el historial,
 * falla el cambio.**
 *
 * Sin esto, un fallo a mitad de camino deja un precio o un stock cuyo origen es
 * imposible de reconstruir, y no hay forma de distinguirlo después de un dato
 * correcto. Es el invariante que hace que la trazabilidad se cumpla por
 * construcción y no por disciplina de quien escribe cada caso de uso.
 */

const ALTA = '2026-07-30T12:00:00.000Z';

function insertarLibro(db: ReturnType<typeof baseTemporal>, precio = 15000): number {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                          stock, precio, creado_en)
       VALUES ('El Principito', 'principito', 'Salamandra', 'salamandra', 3, ?, ?)`,
    )
    .run(precio, ALTA);
  return Number(lastInsertRowid);
}

describe('enTransaccion', () => {
  it('aplica el dato y su historial juntos cuando todo sale bien', () => {
    const db = baseTemporal();
    const libroId = insertarLibro(db);

    enTransaccion(db, () => {
      db.prepare('UPDATE libro SET precio = 20000 WHERE id = ?').run(libroId);
      db.prepare(
        `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
         VALUES (?, ?, 15000, 20000, 'edición manual')`,
      ).run(libroId, ALTA);
    });

    expect(db.prepare('SELECT precio FROM libro WHERE id = ?').get(libroId)).toEqual({
      precio: 20000,
    });
    expect(
      db.prepare('SELECT count(*) AS n FROM movimiento_precio WHERE libro_id = ?').get(libroId),
    ).toEqual({ n: 1 });
  });

  /**
   * El caso que da sentido a todo: el precio ya está actualizado cuando la
   * inserción del historial falla. Sin transacción, el libro quedaría en 20000
   * sin ninguna entrada que explique de dónde salió.
   */
  it('revierte el cambio del dato si falla la inserción del historial', () => {
    const db = baseTemporal();
    const libroId = insertarLibro(db);

    expect(() =>
      enTransaccion(db, () => {
        db.prepare('UPDATE libro SET precio = 20000 WHERE id = ?').run(libroId);
        // Origen fuera de la enumeración: lo rechaza el CHECK de la base.
        db.prepare(
          `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
           VALUES (?, ?, 15000, 20000, 'origen inventado')`,
        ).run(libroId, ALTA);
      }),
    ).toThrow();

    expect(db.prepare('SELECT precio FROM libro WHERE id = ?').get(libroId)).toEqual({
      precio: 15000,
    });
    expect(
      db.prepare('SELECT count(*) AS n FROM movimiento_precio WHERE libro_id = ?').get(libroId),
    ).toEqual({ n: 0 });
  });

  it('revierte también el stock y su historial, no sólo el precio', () => {
    const db = baseTemporal();
    const libroId = insertarLibro(db);

    expect(() =>
      enTransaccion(db, () => {
        db.prepare('UPDATE libro SET stock = 2 WHERE id = ?').run(libroId);
        // `venta_id` obligatorio cuando el origen es 'venta': lo rechaza el CHECK.
        db.prepare(
          `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                         cantidad_resultante, origen)
           VALUES (?, ?, 3, 2, 'venta')`,
        ).run(libroId, ALTA);
      }),
    ).toThrow();

    expect(db.prepare('SELECT stock FROM libro WHERE id = ?').get(libroId)).toEqual({ stock: 3 });
    expect(
      db.prepare('SELECT count(*) AS n FROM movimiento_stock WHERE libro_id = ?').get(libroId),
    ).toEqual({ n: 0 });
  });

  it('no deja rastro de un alta que falla a mitad: ni el libro ni sus dos entradas', () => {
    const db = baseTemporal();

    expect(() =>
      enTransaccion(db, () => {
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                                stock, precio, creado_en)
             VALUES ('Rayuela', 'rayuela', 'Sudamericana', 'sudamericana', 5, 12000, ?)`,
          )
          .run(ALTA);
        const libroId = Number(lastInsertRowid);

        db.prepare(
          `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                         cantidad_resultante, origen)
           VALUES (?, ?, 0, 5, 'alta manual')`,
        ).run(libroId, ALTA);

        db.prepare(
          `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
           VALUES (?, ?, 0, 0, 'alta manual')`,
        ).run(libroId, ALTA); // precio_nuevo = 0 viola el CHECK
      }),
    ).toThrow();

    expect(db.prepare('SELECT count(*) AS n FROM libro').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM movimiento_stock').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM movimiento_precio').get()).toEqual({ n: 0 });
  });

  it('propaga el error original, sin taparlo', () => {
    const db = baseTemporal();

    expect(() =>
      enTransaccion(db, () => {
        throw new Error('la regla de negocio no se cumple');
      }),
    ).toThrow('la regla de negocio no se cumple');
  });

  it('devuelve lo que devuelve la operación', () => {
    const db = baseTemporal();
    const libroId = enTransaccion(db, () => insertarLibro(db));

    expect(libroId).toBeGreaterThan(0);
    expect(db.prepare('SELECT count(*) AS n FROM libro').get()).toEqual({ n: 1 });
  });

  /**
   * `db.transaction()` de better-sqlite3 es **sincrónica**: si la operación
   * devolviera una promesa, la transacción cerraría antes de que el trabajo
   * asincrónico terminara, y las escrituras posteriores quedarían fuera de ella
   * — el invariante se rompería en silencio, que es el peor modo de romperse.
   * Se rechaza explícitamente en vez de confiar en que nadie escriba un `async`.
   */
  it('rechaza una operación asincrónica y no aplica nada', () => {
    const db = baseTemporal();

    expect(() =>
      enTransaccion(db, () => {
        insertarLibro(db);
        return Promise.resolve('esto rompería la atomicidad');
      }),
    ).toThrow();

    expect(db.prepare('SELECT count(*) AS n FROM libro').get()).toEqual({ n: 0 });
  });

  it('anida sin perder la atomicidad del bloque externo', () => {
    const db = baseTemporal();

    expect(() =>
      enTransaccion(db, () => {
        insertarLibro(db);
        enTransaccion(db, () => {
          db.prepare('UPDATE libro SET stock = 99').run();
        });
        throw new Error('falla después del bloque interno');
      }),
    ).toThrow();

    expect(db.prepare('SELECT count(*) AS n FROM libro').get()).toEqual({ n: 0 });
  });
});
