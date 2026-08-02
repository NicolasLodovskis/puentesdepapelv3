import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { importarAltaMasiva } from '@/services/importacion-alta';
import { baseTemporal } from '../helpers/db-temporal';
import { rutaFixture } from '../helpers/fixture-excel';

/**
 * US2 — creación de libros desde el Excel de alta masiva (FR-017, AC-33).
 *
 * Un libro que entra por Excel tiene que quedar exactamente igual de trazado que
 * uno cargado a mano: con sus dos entradas de historial y valor anterior `0`. El
 * origen las distingue —`"alta por Excel"`— para que el historial permita
 * reconstruir por dónde entró cada libro (FR-022, FR-023, Principio III).
 *
 * El otro punto es AC-33: en este flujo la comparación con el catálogo es **sólo
 * exacta**. Una variante de edición es un libro distinto y se crea como tal. Es
 * lo contrario del flujo de precios, y a propósito: acá la librera carga su
 * propio inventario, donde dos ediciones son dos ejemplares; allá, aplicar un
 * precio a la edición equivocada corrompería un dato.
 */

type Base = ReturnType<typeof baseTemporal>;

function libroPorTitulo(db: Base, tituloNormalizado: string) {
  return db.prepare('SELECT * FROM libro WHERE titulo_normalizado = ?').get(tituloNormalizado) as
    | Record<string, unknown>
    | undefined;
}

function movimientos(db: Base, tabla: string, libroId: number) {
  return db
    .prepare(`SELECT * FROM ${tabla} WHERE libro_id = ? ORDER BY id`)
    .all(libroId) as Record<string, unknown>[];
}

function contar(db: Base, tabla: string): number {
  const fila = db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number };
  return fila.n;
}

function archivo(nombre: string) {
  return { nombre, origen: rutaFixture(nombre) };
}

describe('importarAltaMasiva — creación', () => {
  describe('cada fila válida sin coincidencia crea su libro', () => {
    it('crea los libros con sus datos y activos', async () => {
      const db = baseTemporal();

      const respuesta = await importarAltaMasiva(db, archivo('alta-valido.xlsx'));
      expect(respuesta.ok).toBe(true);

      expect(contar(db, 'libro')).toBe(3);
      expect(libroPorTitulo(db, 'rayuela')).toMatchObject({
        titulo: 'Rayuela',
        editorial: 'Alfaguara',
        stock: 4,
        precio: 21000,
        estado: 'activo',
      });
      expect(libroPorTitulo(db, 'ficciones')).toMatchObject({ stock: 2, precio: 18500 });
      expect(libroPorTitulo(db, 'pedro paramo')).toMatchObject({ stock: 7, precio: 12000 });
    });

    it('guarda las columnas normalizadas, igual que el alta manual', async () => {
      const db = baseTemporal();

      await importarAltaMasiva(db, archivo('alta-valido.xlsx'));

      // "Pedro Páramo" y "Fondo de Cultura Económica" pasan por la misma
      // normalización que el formulario: si el Excel escribiera claves distintas,
      // el mismo libro podría entrar dos veces por dos caminos (FR-004).
      expect(libroPorTitulo(db, 'pedro paramo')).toMatchObject({
        titulo_normalizado: 'pedro paramo',
        editorial_normalizada: 'fondo de cultura economica',
      });
    });

    it('escribe las dos entradas iniciales de historial con origen "alta por Excel"', async () => {
      const db = baseTemporal();

      await importarAltaMasiva(db, archivo('alta-valido.xlsx'));
      const libro = libroPorTitulo(db, 'rayuela');
      const libroId = libro?.id as number;

      // `anterior: 0` dice que antes del alta no había nada. Sin estas dos
      // entradas, el stock y el precio iniciales no tendrían origen (FR-031).
      expect(movimientos(db, 'movimiento_stock', libroId)).toEqual([
        expect.objectContaining({
          cantidad_anterior: 0,
          cantidad_resultante: 4,
          origen: 'alta por Excel',
        }),
      ]);
      expect(movimientos(db, 'movimiento_precio', libroId)).toEqual([
        expect.objectContaining({
          precio_anterior: 0,
          precio_nuevo: 21000,
          origen: 'alta por Excel',
        }),
      ]);
    });

    it('deja una entrada de cada historial por libro creado, ni una más', async () => {
      const db = baseTemporal();

      await importarAltaMasiva(db, archivo('alta-valido.xlsx'));

      expect(contar(db, 'movimiento_stock')).toBe(3);
      expect(contar(db, 'movimiento_precio')).toBe(3);
    });
  });

  describe('una variante de edición es un libro nuevo (AC-33)', () => {
    it('crea el libro y lo deja conviviendo con el existente', async () => {
      const db = baseTemporal();
      const existente = altaLibro(db, {
        titulo: 'El Principito',
        editorial: 'Salamandra',
        stock: 3,
        precio: 15000,
      });
      expect(existente.ok).toBe(true);
      if (!existente.ok) return;

      const respuesta = await importarAltaMasiva(db, archivo('alta-variante-edicion.xlsx'));

      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      // La fila se aplica: no es casi-coincidencia ni duplicada. En este flujo la
      // casi-coincidencia (FR-015) no participa.
      expect(respuesta.reporte).toMatchObject({ filasTotales: 1, filasAplicadas: 1 });
      expect(respuesta.reporte.noAplicadas).toEqual([]);

      expect(contar(db, 'libro')).toBe(2);
      expect(libroPorTitulo(db, 'principito tapa dura')).toMatchObject({
        titulo: 'El Principito (tapa dura)',
        stock: 2,
        precio: 16000,
        estado: 'activo',
      });
    });

    it('no toca el libro existente', async () => {
      const db = baseTemporal();
      const existente = altaLibro(db, {
        titulo: 'El Principito',
        editorial: 'Salamandra',
        stock: 3,
        precio: 15000,
      });
      expect(existente.ok).toBe(true);
      if (!existente.ok) return;

      await importarAltaMasiva(db, archivo('alta-variante-edicion.xlsx'));

      expect(libroPorTitulo(db, 'principito')).toMatchObject({ stock: 3, precio: 15000 });
      // Sigue con las dos entradas del alta manual: nada le pasó.
      expect(movimientos(db, 'movimiento_stock', existente.valor.libroId)).toHaveLength(1);
      expect(movimientos(db, 'movimiento_precio', existente.valor.libroId)).toHaveLength(1);
    });
  });
});
