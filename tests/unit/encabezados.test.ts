import { describe, expect, it } from 'vitest';
import { COLUMNAS_ALTA_MASIVA, COLUMNAS_PRECIOS, leerExcel } from '@/excel/leer';
import { rutaFixture } from '../helpers/fixture-excel';

/**
 * Reconocimiento de encabezados (FR-039, AC-36, AC-37), **compartido por los dos
 * flujos de Excel**: el de alta masiva y el de actualización de precios usan la
 * misma lectura y sólo difieren en qué columnas exigen.
 *
 * Está en `tests/unit/` porque no toca la base: lee un `.xlsx` y devuelve filas
 * crudas. Es el borde donde el archivo de la librera se convierte en datos, y
 * también donde el Principio II se juega antes que en ningún otro lado: acá se
 * decide qué se acepta sin interpretar y qué se rechaza por ambiguo.
 *
 * Contrato que fijan estos tests:
 *
 * ```ts
 * leerExcel(origen: string | Buffer, columnas: readonly string[]): Promise<Lectura>
 *
 * type Lectura =
 *   | { ok: true;  encabezados: string[]; filas: FilaCruda[] }
 *   | { ok: false; error: ErrorEncabezados }
 *
 * type FilaCruda = { numeroFila: number; valores: Record<string, unknown> }
 *
 * // El `tipo` es el del contrato del endpoint (contracts/server-actions.md), que
 * // define una sola forma de fallo por encabezados; `repetidas` y `encontrados`
 * // lo completan con lo que FR-039 exige informar.
 * type ErrorEncabezados = {
 *   tipo: 'columnas_faltantes'
 *   faltantes: string[]
 *   repetidas: string[]
 *   encontrados: string[]
 *   mensaje: string
 * }
 * ```
 *
 * `numeroFila` es el número de fila **del archivo original**, para que la
 * librera pueda ubicar la fila en su Excel; y una celda vacía llega como `null`,
 * nunca como `''` ni completada con un valor por defecto.
 */

describe('leerExcel — reconocimiento de encabezados', () => {
  describe('lo que se acepta (AC-36)', () => {
    it('reconoce las columnas con mayúsculas, acentos y espacios sobrantes, e ignora las extra', async () => {
      const lectura = await leerExcel(
        rutaFixture('alta-encabezados-tolerables.xlsx'),
        COLUMNAS_ALTA_MASIVA,
      );

      expect(lectura.ok).toBe(true);
      if (!lectura.ok) return;

      // Los encabezados se informan **tal como venían**: es lo que la librera ve
      // en su archivo, y sirve tanto para el rechazo como para diagnosticar.
      expect(lectura.encabezados).toEqual([
        ' LIBRO ',
        'Editoríal',
        'STOCK',
        ' Precio ',
        'Observaciones',
      ]);

      // La columna extra no aparece en los valores: se ignora sin error (FR-039 e).
      expect(lectura.filas).toEqual([
        {
          numeroFila: 4,
          valores: { libro: 'Rayuela', editorial: 'Alfaguara', stock: 4, precio: 21000 },
        },
      ]);
    });

    it('toma como encabezado la primera fila no vacía, no la primera fila', async () => {
      const lectura = await leerExcel(
        rutaFixture('alta-encabezados-tolerables.xlsx'),
        COLUMNAS_ALTA_MASIVA,
      );

      expect(lectura.ok).toBe(true);
      if (!lectura.ok) return;

      // El encabezado está en la fila 3 y el dato en la 4. Que `numeroFila` sea 4
      // y no 1 es lo que hace ubicable la fila en el archivo de la librera.
      expect(lectura.filas.map((fila) => fila.numeroFila)).toEqual([4]);
    });

    it('usa únicamente la primera hoja', async () => {
      const lectura = await leerExcel(
        rutaFixture('alta-encabezados-tolerables.xlsx'),
        COLUMNAS_ALTA_MASIVA,
      );

      expect(lectura.ok).toBe(true);
      if (!lectura.ok) return;

      // La segunda hoja del fixture tiene un encabezado válido y una fila propia.
      // Si se leyera, este libro entraría al catálogo sin que nadie lo pidiera.
      const titulos = lectura.filas.map((fila) => fila.valores.libro);
      expect(titulos).not.toContain('No Debe Leerse');
      expect(lectura.filas).toHaveLength(1);
    });

    it('no cuenta como fila las que están completamente vacías', async () => {
      const lectura = await leerExcel(rutaFixture('alta-valido.xlsx'), COLUMNAS_ALTA_MASIVA);

      expect(lectura.ok).toBe(true);
      if (!lectura.ok) return;

      // El fixture tiene una quinta fila vacía. Contarla inflaría `filasTotales`
      // del reporte y obligaría a reportar como inválida una fila que la librera
      // nunca escribió.
      expect(lectura.filas.map((fila) => fila.valores.libro)).toEqual([
        'Rayuela',
        'Ficciones',
        'Pedro Páramo',
      ]);
    });

    it('devuelve la celda vacía como null, sin completarla', async () => {
      const lectura = await leerExcel(rutaFixture('alta-mixto.xlsx'), COLUMNAS_ALTA_MASIVA);

      expect(lectura.ok).toBe(true);
      if (!lectura.ok) return;

      // Fila 4 del fixture: "Pedro Páramo" sin editorial. El dato ausente llega
      // ausente; que sea inválida lo decide después la validación (Principio II).
      const sinEditorial = lectura.filas.find((fila) => fila.numeroFila === 4);
      expect(sinEditorial?.valores).toEqual({
        libro: 'Pedro Páramo',
        editorial: null,
        stock: 7,
        precio: 12000,
      });
    });
  });

  describe('lo mismo sirve para los dos flujos', () => {
    it('acepta el mismo archivo pidiendo sólo las columnas de precios', async () => {
      // El flujo de precios exige *libro* y *precio*; *editorial* y *stock* pasan
      // a ser columnas extra y se ignoran. Es la misma función: si cada flujo
      // tuviera su propio lector, podrían divergir en qué encabezado aceptan.
      const lectura = await leerExcel(rutaFixture('alta-valido.xlsx'), COLUMNAS_PRECIOS);

      expect(lectura.ok).toBe(true);
      if (!lectura.ok) return;

      expect(lectura.filas[0]).toEqual({
        numeroFila: 2,
        valores: { libro: 'Rayuela', precio: 21000 },
      });
    });
  });

  describe('lo que se rechaza (AC-37)', () => {
    it('rechaza el archivo al que le falta una columna obligatoria', async () => {
      const lectura = await leerExcel(rutaFixture('alta-falta-columna.xlsx'), COLUMNAS_ALTA_MASIVA);

      expect(lectura.ok).toBe(false);
      if (lectura.ok) return;

      expect(lectura.error).toMatchObject({
        tipo: 'columnas_faltantes',
        faltantes: ['precio'],
        repetidas: [],
        encontrados: ['libro', 'editorial', 'stock'],
      });
    });

    it('no acepta sinónimos: "importe" no es "precio"', async () => {
      const lectura = await leerExcel(rutaFixture('alta-sinonimo.xlsx'), COLUMNAS_ALTA_MASIVA);

      expect(lectura.ok).toBe(false);
      if (lectura.ok) return;

      // Interpretar *importe* como precio de venta sería adivinar la intención
      // del archivo: podría ser el costo de compra (FR-039 d, FR-029).
      expect(lectura.error).toMatchObject({
        tipo: 'columnas_faltantes',
        faltantes: ['precio'],
        repetidas: [],
        encontrados: ['libro', 'editorial', 'stock', 'importe'],
      });
    });

    it('rechaza el archivo con una columna obligatoria repetida', async () => {
      const lectura = await leerExcel(
        rutaFixture('alta-columna-repetida.xlsx'),
        COLUMNAS_ALTA_MASIVA,
      );

      expect(lectura.ok).toBe(false);
      if (lectura.ok) return;

      // Las dos columnas *precio* del fixture traen valores distintos: elegir una
      // sería adivinar cuál es el precio bueno (FR-039 f).
      expect(lectura.error).toMatchObject({
        tipo: 'columnas_faltantes',
        faltantes: [],
        repetidas: ['precio'],
        encontrados: ['libro', 'editorial', 'stock', 'precio', 'precio'],
      });
    });

    it('lista los encabezados encontrados en el mensaje del rechazo', async () => {
      const lectura = await leerExcel(rutaFixture('alta-sinonimo.xlsx'), COLUMNAS_ALTA_MASIVA);

      expect(lectura.ok).toBe(false);
      if (lectura.ok) return;

      // Sin la lista, la librera lee "falta la columna precio" mirando un archivo
      // donde hay una columna que ella llama precio, y no tiene con qué comparar.
      expect(lectura.error.mensaje).toContain('precio');
      expect(lectura.error.mensaje).toContain('importe');
    });
  });
});
