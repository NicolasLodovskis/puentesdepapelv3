import { describe, expect, it } from 'vitest';
import { VERSION_ESQUEMA } from '@/db/migraciones';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * Los invariantes sostenidos por la **base**, no por el código (T021).
 *
 * Cada uno de estos rechazos tiene su validación equivalente en `src/domain/` o
 * en los servicios. Este archivo comprueba la segunda línea: que un camino de
 * código que se olvide de validar —una consulta nueva, un servicio futuro, un
 * script de mantenimiento— falle igual. Es lo que hace que los invariantes del
 * Principio III se cumplan por construcción.
 */

const FECHA = '2026-07-30T12:00:00.000Z';

type Base = ReturnType<typeof baseTemporal>;

function insertarLibro(db: Base, titulo: string, normalizado: string): number {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                          stock, precio, creado_en)
       VALUES (?, ?, 'Salamandra', 'salamandra', 3, 15000, ?)`,
    )
    .run(titulo, normalizado, FECHA);
  return Number(lastInsertRowid);
}

describe('esquema', () => {
  describe('unicidad del título normalizado (FR-004, FR-037)', () => {
    it('rechaza dos libros con el mismo título normalizado', () => {
      const db = baseTemporal();
      insertarLibro(db, 'El Principito', 'principito');

      expect(() => insertarLibro(db, 'Principito, El', 'principito')).toThrow(/UNIQUE/i);
    });

    /**
     * La unicidad es sobre toda la tabla, sin importar el estado: es la
     * restricción de PRD §8, y de ella depende que el alta contra un archivado
     * ofrezca reactivar en vez de crear un duplicado (FR-035, US6 esc. 6).
     */
    it('la unicidad alcanza también a los libros archivados', () => {
      const db = baseTemporal();
      const id = insertarLibro(db, 'El Principito', 'principito');
      db.prepare("UPDATE libro SET estado = 'archivado' WHERE id = ?").run(id);

      expect(() => insertarLibro(db, 'El Principito', 'principito')).toThrow(/UNIQUE/i);
    });

    it('la editorial no forma parte de la clave: el mismo título de otra editorial se rechaza', () => {
      const db = baseTemporal();
      insertarLibro(db, 'Hamlet', 'hamlet');

      expect(() =>
        db
          .prepare(
            `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                                stock, precio, creado_en)
             VALUES ('Hamlet', 'hamlet', 'Cátedra', 'catedra', 1, 9000, ?)`,
          )
          .run(FECHA),
      ).toThrow(/UNIQUE/i);
    });
  });

  describe('enumeración de orígenes (FR-022, FR-023)', () => {
    it('rechaza un origen de precio fuera de la enumeración', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');

      expect(() =>
        db
          .prepare(
            `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
             VALUES (?, ?, 15000, 20000, 'importación')`,
          )
          .run(libroId, FECHA),
      ).toThrow(/CHECK/i);
    });

    it('acepta los cinco orígenes de precio de FR-022', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');
      const origenes = [
        'edición manual',
        'alta manual',
        'reactivación',
        'actualización masiva por Excel',
        'alta por Excel',
      ];

      for (const origen of origenes) {
        expect(() =>
          db
            .prepare(
              `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
               VALUES (?, ?, 15000, 20000, ?)`,
            )
            .run(libroId, FECHA, origen),
        ).not.toThrow();
      }
    });

    it('rechaza un origen de stock fuera de la enumeración', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');

      expect(() =>
        db
          .prepare(
            `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                           cantidad_resultante, origen)
             VALUES (?, ?, 3, 2, 'ajuste de inventario')`,
          )
          .run(libroId, FECHA),
      ).toThrow(/CHECK/i);
    });

    /**
     * `venta` no está entre los orígenes de precio: una venta no cambia el
     * precio del libro, lo copia. Si se colara, el historial de precio mostraría
     * cambios que nunca ocurrieron.
     */
    it("'venta' no es un origen válido de cambio de precio", () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');

      expect(() =>
        db
          .prepare(
            `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
             VALUES (?, ?, 15000, 15000, 'venta')`,
          )
          .run(libroId, FECHA),
      ).toThrow(/CHECK/i);
    });
  });

  describe('vínculo entre el movimiento de stock y su venta (CHK020)', () => {
    it('rechaza un movimiento con origen venta sin su venta_id', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');

      expect(() =>
        db
          .prepare(
            `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                           cantidad_resultante, origen)
             VALUES (?, ?, 3, 2, 'venta')`,
          )
          .run(libroId, FECHA),
      ).toThrow(/CHECK/i);
    });

    it('rechaza un venta_id en un movimiento que no es una venta', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');
      const ventaId = Number(
        db
          .prepare('INSERT INTO venta (libro_id, fecha, precio_venta) VALUES (?, ?, 15000)')
          .run(libroId, FECHA).lastInsertRowid,
      );

      expect(() =>
        db
          .prepare(
            `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                           cantidad_resultante, origen, venta_id)
             VALUES (?, ?, 3, 2, 'edición manual', ?)`,
          )
          .run(libroId, FECHA, ventaId),
      ).toThrow(/CHECK/i);
    });

    it('acepta la venta con su movimiento vinculado', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');
      const ventaId = Number(
        db
          .prepare('INSERT INTO venta (libro_id, fecha, precio_venta) VALUES (?, ?, 15000)')
          .run(libroId, FECHA).lastInsertRowid,
      );

      expect(() =>
        db
          .prepare(
            `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                           cantidad_resultante, origen, venta_id)
             VALUES (?, ?, 3, 2, 'venta', ?)`,
          )
          .run(libroId, FECHA, ventaId),
      ).not.toThrow();
    });
  });

  describe('integridad referencial', () => {
    /**
     * `foreign_keys` está apagado por omisión en SQLite y se configura por
     * conexión. Este test comprueba que la conexión que usa el sistema lo
     * enciende: sin eso, el historial podría quedar colgando de un libro
     * inexistente.
     */
    it('rechaza una entrada de historial de un libro que no existe', () => {
      const db = baseTemporal();

      expect(() =>
        db
          .prepare(
            `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
             VALUES (9999, ?, 0, 15000, 'alta manual')`,
          )
          .run(FECHA),
      ).toThrow(/FOREIGN KEY/i);
    });

    it('rechaza una fila de reporte sin su reporte', () => {
      const db = baseTemporal();

      expect(() =>
        db
          .prepare(
            `INSERT INTO reporte_fila (reporte_id, numero_fila, titulo_crudo, motivo)
             VALUES (9999, 2, 'El Principito', 'sin_coincidencia')`,
          )
          .run(),
      ).toThrow(/FOREIGN KEY/i);
    });
  });

  describe('rangos de los campos', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['título vacío', "'   ', 'x1', 'Salamandra', 'salamandra', 3, 15000"],
      ['editorial vacía', "'X', 'x2', '  ', 'salamandra', 3, 15000"],
      ['stock negativo', "'X', 'x3', 'Salamandra', 'salamandra', -1, 15000"],
      ['precio cero', "'X', 'x4', 'Salamandra', 'salamandra', 3, 0"],
      ['precio negativo', "'X', 'x5', 'Salamandra', 'salamandra', 3, -15000"],
    ];

    it.each(casos)('rechaza %s', (_descripcion, valores) => {
      const db = baseTemporal();

      expect(() =>
        db
          .prepare(
            `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                                stock, precio, creado_en)
             VALUES (${valores}, '${FECHA}')`,
          )
          .run(),
      ).toThrow(/CHECK/i);
    });

    it('rechaza un estado fuera de activo/archivado', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');

      expect(() =>
        db.prepare("UPDATE libro SET estado = 'pendiente' WHERE id = ?").run(libroId),
      ).toThrow(/CHECK/i);
    });

    it('el estado por defecto es activo', () => {
      const db = baseTemporal();
      const libroId = insertarLibro(db, 'El Principito', 'principito');

      expect(db.prepare('SELECT estado FROM libro WHERE id = ?').get(libroId)).toEqual({
        estado: 'activo',
      });
    });
  });

  describe('embedding y foto', () => {
    it('rechaza un embedding sin su foto', () => {
      const db = baseTemporal();

      expect(() =>
        db
          .prepare(
            `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                                stock, precio, creado_en, foto_embedding)
             VALUES ('X', 'x', 'E', 'e', 1, 100, ?, ?)`,
          )
          .run(FECHA, Buffer.from([1, 2, 3])),
      ).toThrow(/CHECK/i);
    });

    /**
     * La recíproca sí se permite: el alta guarda la foto y el embedding se
     * calcula después (T030 y T089), así que una foto sin embedding es un estado
     * intermedio válido.
     */
    it('acepta una foto sin su embedding', () => {
      const db = baseTemporal();

      expect(() =>
        db
          .prepare(
            `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                                stock, precio, creado_en, foto)
             VALUES ('X', 'x', 'E', 'e', 1, 100, ?, ?)`,
          )
          .run(FECHA, Buffer.from([1, 2, 3])),
      ).not.toThrow();
    });
  });

  describe('reporte de importación', () => {
    it('rechaza un motivo fuera del vocabulario de categorías', () => {
      const db = baseTemporal();
      const reporteId = Number(
        db
          .prepare(
            `INSERT INTO reporte_importacion (fecha, nombre_archivo, filas_totales, filas_aplicadas)
             VALUES (?, 'precios.xlsx', 10, 7)`,
          )
          .run(FECHA).lastInsertRowid,
      );

      expect(() =>
        db
          .prepare(
            `INSERT INTO reporte_fila (reporte_id, numero_fila, titulo_crudo, motivo)
             VALUES (?, 2, 'El Principito', 'motivo_inventado')`,
          )
          .run(reporteId),
      ).toThrow(/CHECK/i);
    });

    /**
     * `duplicada_de_activo` es exclusiva del alta masiva, cuyo reporte no se
     * persiste. Si apareciera acá, el reporte de precios estaría informando una
     * categoría que ese flujo no puede producir.
     */
    it('rechaza una categoría que pertenece al otro flujo', () => {
      const db = baseTemporal();
      const reporteId = Number(
        db
          .prepare(
            `INSERT INTO reporte_importacion (fecha, nombre_archivo, filas_totales, filas_aplicadas)
             VALUES (?, 'precios.xlsx', 10, 7)`,
          )
          .run(FECHA).lastInsertRowid,
      );

      expect(() =>
        db
          .prepare(
            `INSERT INTO reporte_fila (reporte_id, numero_fila, titulo_crudo, motivo)
             VALUES (?, 2, 'El Principito', 'duplicada_de_activo')`,
          )
          .run(reporteId),
      ).toThrow(/CHECK/i);
    });

    it('rechaza más filas aplicadas que filas totales', () => {
      const db = baseTemporal();

      expect(() =>
        db
          .prepare(
            `INSERT INTO reporte_importacion (fecha, nombre_archivo, filas_totales, filas_aplicadas)
             VALUES (?, 'precios.xlsx', 5, 10)`,
          )
          .run(FECHA),
      ).toThrow(/CHECK/i);
    });
  });

  describe('configuración de la conexión', () => {
    it('abre en modo WAL', () => {
      const db = baseTemporal();
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    });

    it('tiene las claves foráneas encendidas', () => {
      const db = baseTemporal();
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    });

    it('registra la versión del esquema, para que una migración futura sepa de dónde parte', () => {
      const db = baseTemporal();
      expect(db.pragma('user_version', { simple: true })).toBe(VERSION_ESQUEMA);
    });

    it('aplicar el esquema dos veces no falla ni duplica nada', async () => {
      const db = baseTemporal();
      const { migrar } = await import('@/db/migraciones');
      insertarLibro(db, 'El Principito', 'principito');

      expect(() => migrar(db)).not.toThrow();
      expect(db.prepare('SELECT count(*) AS n FROM libro').get()).toEqual({ n: 1 });
    });
  });
});
