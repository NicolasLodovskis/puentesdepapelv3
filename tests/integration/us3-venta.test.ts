import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { venderUnidad } from '@/services/operacion';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * US3 — venta de una unidad (FR-009, FR-023, FR-024).
 *
 * Es la operación más frecuente del día y la razón por la que el stock se
 * mantiene vivo. Una venta toca tres cosas a la vez —el stock del libro, el
 * registro de la venta y el historial de stock— y las tres tienen que quedar en
 * la misma transacción: un stock descontado sin su venta, o una venta sin su
 * movimiento, dejarían el historial sin poder reconciliarse (Principio III).
 *
 * El punto que no es evidente es `venta.precio_venta`: es una **copia** del
 * precio vigente, no una referencia al libro. Cambiar el precio mañana no puede
 * reescribir lo que se cobró ayer (FR-009).
 *
 * Contrato que fijan estos tests:
 *
 * ```ts
 * venderUnidad(db: Database, input: { libroId: number }): Resultado<{ ventaId: number }>
 * ```
 */

type Base = ReturnType<typeof baseTemporal>;

const VALIDO = { titulo: 'Rayuela', editorial: 'Alfaguara', stock: 3, precio: 21000 };

function sembrar(db: Base, campos: Partial<typeof VALIDO> = {}) {
  const alta = altaLibro(db, { ...VALIDO, ...campos });
  if (!alta.ok) throw new Error('la siembra falló');
  return alta.valor.libroId;
}

function libroDe(db: Base, libroId: number) {
  return db.prepare('SELECT * FROM libro WHERE id = ?').get(libroId) as Record<string, unknown>;
}

function ventas(db: Base, libroId: number) {
  return db
    .prepare('SELECT * FROM venta WHERE libro_id = ? ORDER BY id')
    .all(libroId) as Record<string, unknown>[];
}

function movimientosStock(db: Base, libroId: number) {
  return db
    .prepare('SELECT * FROM movimiento_stock WHERE libro_id = ? ORDER BY id')
    .all(libroId) as Record<string, unknown>[];
}

describe('venderUnidad', () => {
  describe('venta de un libro con stock', () => {
    it('descuenta exactamente una unidad', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 3 });

      const resultado = venderUnidad(db, { libroId });

      expect(resultado.ok).toBe(true);
      expect(libroDe(db, libroId)).toMatchObject({ stock: 2 });
    });

    it('registra la venta con el precio vigente en ese momento', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { precio: 21000 });

      const resultado = venderUnidad(db, { libroId });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const registradas = ventas(db, libroId);
      expect(registradas).toHaveLength(1);
      expect(registradas[0]).toMatchObject({
        id: resultado.valor.ventaId,
        libro_id: libroId,
        precio_venta: 21000,
      });
      // La fecha va en la hora de la librería, como todo el historial (R6).
      expect(registradas[0]?.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+-03:00$/);
    });

    it('escribe el movimiento de stock con origen "venta" y la venta que lo produjo', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 3 });

      const resultado = venderUnidad(db, { libroId });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      // La primera entrada es la del alta; la segunda, la de la venta.
      const movimientos = movimientosStock(db, libroId);
      expect(movimientos).toHaveLength(2);
      expect(movimientos[1]).toMatchObject({
        cantidad_anterior: 3,
        cantidad_resultante: 2,
        origen: 'venta',
        // Sin este vínculo, reconciliar los dos historiales exigiría adivinar
        // por marca temporal cuál movimiento corresponde a cuál venta (CHK020).
        venta_id: resultado.valor.ventaId,
      });
    });

    it('devuelve lo que hace falta para confirmar la venta sin volver a consultar', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { titulo: 'Rayuela', stock: 3, precio: 21000 });

      const resultado = venderUnidad(db, { libroId });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      // El título, el precio cobrado y el stock que queda son datos que el
      // servicio ya tiene en la mano al vender. Devolverlos evita que la pantalla
      // tenga que consultar la base por su cuenta para poder decir qué pasó.
      expect(resultado.valor).toEqual({
        ventaId: expect.any(Number),
        titulo: 'Rayuela',
        precioVenta: 21000,
        stockResultante: 2,
      });
    });

    it('permite vender el último ejemplar y deja el libro en stock 0', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 1 });

      const resultado = venderUnidad(db, { libroId });

      expect(resultado.ok).toBe(true);
      // Stock 0 es un estado válido: el libro sigue en el catálogo, sólo que sin
      // ejemplares. No se archiva solo (FR-011 es una decisión de la librera).
      expect(libroDe(db, libroId)).toMatchObject({ stock: 0, estado: 'activo' });
    });
  });

  describe('ventas sucesivas', () => {
    it('cada venta descuenta una unidad y deja su propio rastro', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 3 });

      venderUnidad(db, { libroId });
      venderUnidad(db, { libroId });

      expect(libroDe(db, libroId)).toMatchObject({ stock: 1 });
      expect(ventas(db, libroId)).toHaveLength(2);

      const movimientos = movimientosStock(db, libroId);
      expect(movimientos.map((m) => [m.cantidad_anterior, m.cantidad_resultante])).toEqual([
        [0, 3],
        [3, 2],
        [2, 1],
      ]);
    });
  });
});
