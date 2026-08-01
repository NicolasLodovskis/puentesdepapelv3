import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * US1 — unicidad del título normalizado (FR-004, FR-037).
 *
 * La identidad de un libro es su título normalizado, **sin la editorial**: es la
 * restricción de PRD §8, tomada a conciencia. La consecuencia es que no pueden
 * coexistir dos libros con el mismo título de editoriales distintas, y que el
 * alta contra un archivado tiene que ofrecer reactivarlo en vez de fallar seco.
 */

const VALIDO = { titulo: 'El Principito', editorial: 'Salamandra', stock: 3, precio: 15000 };

type Base = ReturnType<typeof baseTemporal>;

function altaOk(db: Base, input: Record<string, unknown>): number {
  const resultado = altaLibro(db, { ...VALIDO, ...input });
  if (!resultado.ok) throw new Error('el alta previa debía funcionar');
  return resultado.valor.libroId;
}

function contar(db: Base, tabla: string): number {
  return (db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number }).n;
}

describe('unicidad del título en el alta', () => {
  describe('contra un libro activo', () => {
    it('rechaza el título exactamente igual', () => {
      const db = baseTemporal();
      altaOk(db, {});

      const resultado = altaLibro(db, VALIDO);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error.tipo).toBe('titulo_duplicado');
    });

    /**
     * Las dos formas del mismo título colapsan a la misma clave por R3. Si no se
     * rechazara, el catálogo tendría el mismo libro dos veces y una
     * actualización de precios por Excel aplicaría a uno solo de los dos.
     */
    it('rechaza una escritura distinta que normaliza igual', () => {
      const db = baseTemporal();
      altaOk(db, { titulo: 'El Principito' });

      for (const titulo of [
        'Principito, El',
        'EL PRINCIPITO',
        'el principito!',
        '  El  Principito  ',
      ]) {
        const resultado = altaLibro(db, { ...VALIDO, titulo });
        expect(resultado.ok).toBe(false);
      }
    });

    it('informa el libro con el que choca, para que la UI pueda mostrarlo', () => {
      const db = baseTemporal();
      const existente = altaOk(db, {});

      const resultado = altaLibro(db, VALIDO);

      expect(resultado.ok).toBe(false);
      if (resultado.ok || resultado.error.tipo !== 'titulo_duplicado') return;
      expect(resultado.error.libroId).toBe(existente);
      expect(resultado.error.estado).toBe('activo');
      expect(resultado.error.mensaje.length).toBeGreaterThan(0);
    });

    it('el rechazo no modifica el libro existente ni agrega historial', () => {
      const db = baseTemporal();
      altaOk(db, {});

      altaLibro(db, { ...VALIDO, stock: 99, precio: 99999 });

      expect(contar(db, 'libro')).toBe(1);
      expect(db.prepare('SELECT stock, precio FROM libro').get()).toEqual({
        stock: 3,
        precio: 15000,
      });
      expect(contar(db, 'movimiento_stock')).toBe(1);
      expect(contar(db, 'movimiento_precio')).toBe(1);
    });
  });

  describe('contra un libro archivado', () => {
    /**
     * `libroId` y `estado` son lo que permite que la UI ofrezca reactivar en vez
     * de dejar a la librera en un callejón sin salida: el libro existe, está
     * archivado, y ella no puede crearlo de nuevo ni verlo en la búsqueda
     * (FR-035, US6 esc. 6).
     */
    it('rechaza devolviendo libroId y estado archivado', () => {
      const db = baseTemporal();
      const existente = altaOk(db, {});
      db.prepare("UPDATE libro SET estado = 'archivado' WHERE id = ?").run(existente);

      const resultado = altaLibro(db, VALIDO);

      expect(resultado.ok).toBe(false);
      if (resultado.ok || resultado.error.tipo !== 'titulo_duplicado') {
        throw new Error('se esperaba titulo_duplicado');
      }
      expect(resultado.error.libroId).toBe(existente);
      expect(resultado.error.estado).toBe('archivado');
    });

    it('no reactiva ni modifica el archivado por su cuenta', () => {
      const db = baseTemporal();
      const existente = altaOk(db, {});
      db.prepare("UPDATE libro SET estado = 'archivado' WHERE id = ?").run(existente);

      altaLibro(db, { ...VALIDO, stock: 50, precio: 99999 });

      expect(
        db.prepare('SELECT estado, stock, precio FROM libro WHERE id = ?').get(existente),
      ).toEqual({ estado: 'archivado', stock: 3, precio: 15000 });
    });
  });

  describe('la editorial no forma parte de la clave (PRD §8, FR-037)', () => {
    it('rechaza el mismo título de otra editorial', () => {
      const db = baseTemporal();
      altaOk(db, { titulo: 'Hamlet', editorial: 'Cátedra' });

      const resultado = altaLibro(db, { ...VALIDO, titulo: 'Hamlet', editorial: 'Losada' });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error.tipo).toBe('titulo_duplicado');
    });

    /**
     * El workaround documentado en PRD §8: diferenciar en el título. Tiene que
     * funcionar, o la restricción dejaría a la librera sin salida cuando
     * stockea la misma obra de dos editoriales.
     */
    it('acepta el mismo título diferenciado en el propio título', () => {
      const db = baseTemporal();
      altaOk(db, { titulo: 'Hamlet', editorial: 'Cátedra' });

      const resultado = altaLibro(db, {
        ...VALIDO,
        titulo: 'Hamlet (Losada)',
        editorial: 'Losada',
      });

      expect(resultado.ok).toBe(true);
      expect(contar(db, 'libro')).toBe(2);
    });
  });

  describe('títulos distintos', () => {
    it('acepta dos libros con títulos que no colisionan', () => {
      const db = baseTemporal();
      altaOk(db, { titulo: 'El Principito' });

      const resultado = altaLibro(db, { ...VALIDO, titulo: 'Rayuela' });

      expect(resultado.ok).toBe(true);
      expect(contar(db, 'libro')).toBe(2);
    });

    /**
     * Consecuencia de R3: el contenido del paréntesis se conserva, así que una
     * variante de edición es un libro distinto y puede convivir con el base.
     */
    it('acepta una variante de edición junto al título base', () => {
      const db = baseTemporal();
      altaOk(db, { titulo: 'El Principito' });

      const resultado = altaLibro(db, { ...VALIDO, titulo: 'El Principito (tapa dura)' });

      expect(resultado.ok).toBe(true);
      expect(contar(db, 'libro')).toBe(2);
    });
  });
});
