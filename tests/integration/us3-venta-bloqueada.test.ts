import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { venderUnidad } from '@/services/operacion';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * US3 — cuándo **no** se puede vender (FR-010, FR-038, AC-34).
 *
 * Son los dos casos en que el sistema tiene que decir que no y no tocar nada:
 * sin ejemplares no hay nada que vender, y un libro archivado está fuera de la
 * operación —vender descuenta stock, y sobre un archivado el stock no se
 * modifica—.
 *
 * "No tocar nada" se verifica campo por campo y tabla por tabla, no por el
 * mensaje de error: un rechazo que igual escribió media operación sería peor que
 * no rechazar, porque dejaría el historial mintiendo (Principio III).
 */

type Base = ReturnType<typeof baseTemporal>;

const VALIDO = { titulo: 'Rayuela', editorial: 'Alfaguara', stock: 3, precio: 21000 };

function sembrar(db: Base, campos: Partial<typeof VALIDO> = {}) {
  const alta = altaLibro(db, { ...VALIDO, ...campos });
  if (!alta.ok) throw new Error('la siembra falló');
  return alta.valor.libroId;
}

function contar(db: Base, tabla: string, libroId: number): number {
  const fila = db
    .prepare(`SELECT count(*) AS n FROM ${tabla} WHERE libro_id = ?`)
    .get(libroId) as { n: number };
  return fila.n;
}

function libroDe(db: Base, libroId: number) {
  return db.prepare('SELECT * FROM libro WHERE id = ?').get(libroId) as Record<string, unknown>;
}

describe('venderUnidad — rechazos', () => {
  describe('un libro sin stock', () => {
    it('se rechaza con un mensaje, sin registrar la venta', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 0 });

      const resultado = venderUnidad(db, { libroId });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error.tipo).toBe('sin_stock');
      expect(resultado.error.mensaje).not.toBe('');
    });

    it('no altera el stock ni escribe historial', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 0 });

      venderUnidad(db, { libroId });

      expect(libroDe(db, libroId)).toMatchObject({ stock: 0 });
      expect(contar(db, 'venta', libroId)).toBe(0);
      // La única entrada sigue siendo la del alta.
      expect(contar(db, 'movimiento_stock', libroId)).toBe(1);
    });
  });

  describe('un libro archivado', () => {
    /**
     * El archivado se hace por SQL porque `archivarLibro` llega con US6 (T072).
     * Lo que importa acá es el estado del libro, no cómo llegó a estarlo.
     */
    function archivar(db: Base, libroId: number) {
      db.prepare(`UPDATE libro SET estado = 'archivado' WHERE id = ?`).run(libroId);
    }

    it('no se puede vender aunque tenga stock', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 5 });
      archivar(db, libroId);

      const resultado = venderUnidad(db, { libroId });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      // Tener stock no lo habilita: la venta descuenta stock, y sobre un
      // archivado el stock no se modifica (FR-038).
      expect(resultado.error.tipo).toBe('estado_invalido');
    });

    it('no altera el stock ni escribe historial', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 5 });
      archivar(db, libroId);

      venderUnidad(db, { libroId });

      expect(libroDe(db, libroId)).toMatchObject({ stock: 5, estado: 'archivado' });
      expect(contar(db, 'venta', libroId)).toBe(0);
      expect(contar(db, 'movimiento_stock', libroId)).toBe(1);
    });
  });

  describe('un libro que no existe', () => {
    it('se rechaza sin registrar nada', () => {
      const db = baseTemporal();

      const resultado = venderUnidad(db, { libroId: 4321 });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error.tipo).toBe('no_encontrado');

      const { n } = db.prepare('SELECT count(*) AS n FROM venta').get() as { n: number };
      expect(n).toBe(0);
    });
  });

  describe('una venta ya registrada', () => {
    it('no se altera cuando el precio del libro cambia después (FR-009)', () => {
      const db = baseTemporal();
      const libroId = sembrar(db, { stock: 2, precio: 21000 });

      const resultado = venderUnidad(db, { libroId });
      expect(resultado.ok).toBe(true);

      // El cambio se hace por SQL porque `cambiarPrecio` llega con US4 (T052).
      // Lo que se verifica es que `venta.precio_venta` sea una copia y no una
      // referencia: si fuera una referencia, subir el precio hoy reescribiría lo
      // que se cobró ayer y el historial de ventas dejaría de ser un registro.
      db.prepare('UPDATE libro SET precio = ? WHERE id = ?').run(30000, libroId);

      const venta = db
        .prepare('SELECT precio_venta FROM venta WHERE libro_id = ?')
        .get(libroId) as { precio_venta: number };
      expect(venta.precio_venta).toBe(21000);
    });
  });
});
