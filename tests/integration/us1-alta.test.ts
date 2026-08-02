import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * US1 — alta de un libro (FR-001, FR-002, FR-031).
 *
 * El alta es el único momento en que un libro entra al catálogo, así que es
 * también donde nace su trazabilidad: el Principio III exige que no exista stock
 * ni precio sin origen conocido, y eso se cumple escribiendo las dos entradas
 * iniciales en la misma transacción que el libro.
 */

const VALIDO = { titulo: 'El Principito', editorial: 'Salamandra', stock: 3, precio: 15000 };

type Base = ReturnType<typeof baseTemporal>;

function libroDe(db: Base, libroId: number) {
  return db.prepare('SELECT * FROM libro WHERE id = ?').get(libroId) as Record<string, unknown>;
}

function contar(db: Base, tabla: string): number {
  const fila = db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number };
  return fila.n;
}

describe('altaLibro', () => {
  describe('alta válida', () => {
    it('persiste el libro y lo deja recuperable', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, VALIDO);

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const libro = libroDe(db, resultado.valor.libroId);
      expect(libro).toMatchObject({
        titulo: 'El Principito',
        editorial: 'Salamandra',
        stock: 3,
        precio: 15000,
        estado: 'activo',
      });
    });

    it('guarda el título y la editorial normalizados, que son las claves de búsqueda', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, {
        ...VALIDO,
        titulo: 'El Principito',
        editorial: 'Anagramá',
      });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(libroDe(db, resultado.valor.libroId)).toMatchObject({
        titulo_normalizado: 'principito',
        editorial_normalizada: 'anagrama',
      });
    });

    it('recorta los espacios antes de guardar', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, {
        ...VALIDO,
        titulo: '  Rayuela  ',
        editorial: ' Sudamericana ',
      });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(libroDe(db, resultado.valor.libroId)).toMatchObject({
        titulo: 'Rayuela',
        editorial: 'Sudamericana',
      });
    });

    it('sella la fecha de creación en la hora de la librería, con el desfase explícito', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, VALIDO);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(libroDe(db, resultado.valor.libroId).creado_en).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/,
      );
    });
  });

  describe('trazabilidad desde el alta (FR-031, Principio III)', () => {
    /**
     * `cantidad_anterior: 0` y `precio_anterior: 0` no son un relleno: dicen que
     * antes del alta no había nada. Sin estas dos entradas, el stock y el precio
     * iniciales de un libro no tendrían origen y el historial no podría
     * reconstruir de dónde salieron.
     */
    it('escribe la entrada inicial de stock con origen "alta manual" y anterior 0', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, VALIDO);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const movimientos = db
        .prepare('SELECT * FROM movimiento_stock WHERE libro_id = ?')
        .all(resultado.valor.libroId);

      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]).toMatchObject({
        cantidad_anterior: 0,
        cantidad_resultante: 3,
        origen: 'alta manual',
        venta_id: null,
      });
    });

    it('escribe la entrada inicial de precio con origen "alta manual" y anterior 0', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, VALIDO);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const movimientos = db
        .prepare('SELECT * FROM movimiento_precio WHERE libro_id = ?')
        .all(resultado.valor.libroId);

      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]).toMatchObject({
        precio_anterior: 0,
        precio_nuevo: 15000,
        origen: 'alta manual',
      });
    });

    it('un alta con stock 0 también escribe su entrada de stock', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, { ...VALIDO, stock: 0 });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(contar(db, 'movimiento_stock')).toBe(1);
    });

    it('la última entrada de cada historial coincide con el valor vigente del libro', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, VALIDO);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const libro = libroDe(db, resultado.valor.libroId);
      const ultimoStock = db
        .prepare('SELECT cantidad_resultante AS v FROM movimiento_stock ORDER BY id DESC LIMIT 1')
        .get() as { v: number };
      const ultimoPrecio = db
        .prepare('SELECT precio_nuevo AS v FROM movimiento_precio ORDER BY id DESC LIMIT 1')
        .get() as { v: number };

      expect(ultimoStock.v).toBe(libro.stock);
      expect(ultimoPrecio.v).toBe(libro.precio);
    });
  });

  describe('alta inválida: se rechaza con mensaje y no persiste nada', () => {
    const invalidos: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
      ['título vacío', { titulo: '' }, 'titulo'],
      ['título sólo espacios', { titulo: '   ' }, 'titulo'],
      ['editorial vacía', { editorial: '' }, 'editorial'],
      ['stock negativo', { stock: -1 }, 'stock'],
      ['stock con decimales', { stock: 2.5 }, 'stock'],
      ['precio cero', { precio: 0 }, 'precio'],
      ['precio negativo', { precio: -100 }, 'precio'],
      ['precio con decimales', { precio: '15000,50' }, 'precio'],
      ['precio no numérico', { precio: 'quince mil' }, 'precio'],
    ];

    it.each(invalidos)('rechaza el alta con %s', (_descripcion, parcial, campoEsperado) => {
      const db = baseTemporal();

      const resultado = altaLibro(db, { ...VALIDO, ...parcial });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error.tipo).toBe('validacion');
      if (resultado.error.tipo === 'validacion') {
        expect(resultado.error.campo).toBe(campoEsperado);
        expect(resultado.error.mensaje.length).toBeGreaterThan(0);
      }
    });

    /**
     * "No persiste nada" incluye los historiales: un alta rechazada que dejara
     * un movimiento suelto ensuciaría la trazabilidad con un cambio que nunca
     * ocurrió.
     */
    it.each(invalidos)('no deja rastro tras rechazar por %s', (_descripcion, parcial) => {
      const db = baseTemporal();

      altaLibro(db, { ...VALIDO, ...parcial });

      expect(contar(db, 'libro')).toBe(0);
      expect(contar(db, 'movimiento_stock')).toBe(0);
      expect(contar(db, 'movimiento_precio')).toBe(0);
    });
  });

  describe('la foto es opcional (US1 esc. 5)', () => {
    it('acepta el alta sin foto', () => {
      const db = baseTemporal();

      const resultado = altaLibro(db, VALIDO);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(libroDe(db, resultado.valor.libroId).foto).toBeNull();
    });

    it('deja la foto asociada al libro cuando se la da', () => {
      const db = baseTemporal();
      const foto = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      const resultado = altaLibro(db, { ...VALIDO, foto });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      const guardada = libroDe(db, resultado.valor.libroId).foto;
      expect(guardada).toBeInstanceOf(Buffer);
      expect(Uint8Array.from(guardada as Buffer)).toEqual(foto);
    });
  });
});
