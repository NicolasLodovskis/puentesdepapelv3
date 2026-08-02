import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { importarAltaMasiva } from '@/services/importacion-alta';
import { baseTemporal } from '../helpers/db-temporal';
import { rutaFixture } from '../helpers/fixture-excel';

/**
 * US2 — columnas del Excel de alta masiva (FR-016).
 *
 * El archivo tiene que traer *libro*, *editorial*, *stock* y *precio*. Si falta
 * alguna, el rechazo es **total**: no se crea ni se modifica nada. Es la única
 * forma de fallo que no produce reporte, porque sin las cuatro columnas no hay
 * fila que se pueda clasificar.
 *
 * Aplicar "lo que se pueda" sería peor que rechazar: dejaría el catálogo a medio
 * cargar y a la librera sin saber cuánto de su archivo entró.
 *
 * Contrato que fijan estos tests:
 *
 * ```ts
 * importarAltaMasiva(
 *   db: Database,
 *   archivo: { nombre: string; origen: string | Buffer },
 * ): Promise<RespuestaImportacion>
 *
 * type RespuestaImportacion =
 *   | { ok: false; error: { tipo: 'columnas_faltantes'; faltantes: string[] } }
 *   | { ok: true;  reporte: Reporte }
 * ```
 */

type Base = ReturnType<typeof baseTemporal>;

function contar(db: Base, tabla: string): number {
  const fila = db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number };
  return fila.n;
}

function archivo(nombre: string) {
  return { nombre, origen: rutaFixture(nombre) };
}

describe('importarAltaMasiva — columnas', () => {
  it('acepta el archivo que trae las cuatro columnas obligatorias', async () => {
    const db = baseTemporal();

    const respuesta = await importarAltaMasiva(db, archivo('alta-valido.xlsx'));

    expect(respuesta.ok).toBe(true);
    if (!respuesta.ok) return;

    expect(respuesta.reporte).toMatchObject({
      nombreArchivo: 'alta-valido.xlsx',
      filasTotales: 3,
      filasAplicadas: 3,
      noAplicadas: [],
    });
  });

  describe('cuando falta una columna obligatoria', () => {
    it('rechaza el archivo indicando cuál falta', async () => {
      const db = baseTemporal();

      const respuesta = await importarAltaMasiva(db, archivo('alta-falta-columna.xlsx'));

      expect(respuesta.ok).toBe(false);
      if (respuesta.ok) return;

      expect(respuesta.error).toMatchObject({
        tipo: 'columnas_faltantes',
        faltantes: ['precio'],
      });
    });

    it('no crea ningún libro, aunque las filas sean válidas en lo demás', async () => {
      const db = baseTemporal();

      // Las dos filas del fixture tienen título, editorial y stock correctos: lo
      // único que falta es la columna. El rechazo es del archivo, no de las filas.
      await importarAltaMasiva(db, archivo('alta-falta-columna.xlsx'));

      expect(contar(db, 'libro')).toBe(0);
      expect(contar(db, 'movimiento_stock')).toBe(0);
      expect(contar(db, 'movimiento_precio')).toBe(0);
    });

    it('no modifica los libros que ya estaban en el catálogo', async () => {
      const db = baseTemporal();
      const alta = altaLibro(db, {
        titulo: 'Rayuela',
        editorial: 'Sudamericana',
        stock: 1,
        precio: 9000,
      });
      expect(alta.ok).toBe(true);
      if (!alta.ok) return;

      // "Rayuela" aparece en el fixture con otro stock y otro precio.
      await importarAltaMasiva(db, archivo('alta-falta-columna.xlsx'));

      const libro = db
        .prepare('SELECT stock, precio, editorial FROM libro WHERE id = ?')
        .get(alta.valor.libroId);
      expect(libro).toMatchObject({ stock: 1, precio: 9000, editorial: 'Sudamericana' });

      // Las dos entradas son las del alta manual: la importación no escribió
      // historial (Principio III — nada cambió, nada se registra).
      expect(contar(db, 'movimiento_stock')).toBe(1);
      expect(contar(db, 'movimiento_precio')).toBe(1);
    });
  });
});
