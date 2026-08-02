import ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importarAltaMasiva } from '@/services/importacion-alta';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * RNF-03 / FR-030b (T043): un archivo de 5.000 filas se procesa **sin fallar y
 * sin truncar**.
 *
 * El techo no es caprichoso: la librera tiene ~2.000 libros y su primera carga
 * es un archivo entero. Un lector que cargue el XML completo en memoria, o un
 * límite silencioso de filas, se manifestarían exactamente acá — y truncar es lo
 * peor que podría pasar, porque el reporte diría que salió todo bien mientras
 * faltan libros (Principio II).
 *
 * El archivo se genera en un directorio temporal en vez de versionarse: son
 * 5.000 filas de datos sintéticos que no aportan nada leerlas en un diff.
 */

const FILAS = 5000;

let directorio: string;
let archivo: string;

beforeAll(async () => {
  directorio = mkdtempSync(join(tmpdir(), 'puentes-volumen-'));
  archivo = join(directorio, 'volumen.xlsx');

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Alta');
  hoja.addRow(['libro', 'editorial', 'stock', 'precio']);

  for (let numero = 1; numero <= FILAS; numero += 1) {
    // Títulos distintos entre sí: acá se mide volumen, no clasificación.
    hoja.addRow([`Título de prueba ${numero}`, 'Editorial de prueba', numero % 20, 1000 + numero]);
  }

  await libro.xlsx.writeFile(archivo);
}, 60_000);

afterAll(() => {
  rmSync(directorio, { recursive: true, force: true });
});

describe('importarAltaMasiva — volumen (RNF-03)', () => {
  it(
    'procesa las 5.000 filas sin truncar ninguna',
    async () => {
      const db = baseTemporal();

      const respuesta = await importarAltaMasiva(db, { nombre: 'volumen.xlsx', origen: archivo });

      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      const { filasTotales, filasAplicadas, noAplicadas } = respuesta.reporte;

      // Las tres comprobaciones dicen cosas distintas: que se leyeron todas, que
      // se aplicaron todas, y que los números cierran entre sí (FR-030).
      expect(filasTotales).toBe(FILAS);
      expect(filasAplicadas).toBe(FILAS);
      expect(filasAplicadas + noAplicadas.length).toBe(filasTotales);

      // Y la comprobación que no depende del reporte: los libros están.
      const { n } = db.prepare('SELECT count(*) AS n FROM libro').get() as { n: number };
      expect(n).toBe(FILAS);

      // Una entrada de cada historial por libro: la trazabilidad no se degrada
      // con el volumen (Principio III).
      const movimientos = db
        .prepare(
          `SELECT (SELECT count(*) FROM movimiento_stock) AS stock,
                  (SELECT count(*) FROM movimiento_precio) AS precio`,
        )
        .get() as { stock: number; precio: number };
      expect(movimientos).toEqual({ stock: FILAS, precio: FILAS });
    },
    120_000,
  );
});
