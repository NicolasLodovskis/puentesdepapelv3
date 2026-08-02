import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIRECTORIO_FIXTURES } from '../fixtures/excel/generar';

/**
 * Ruta de un fixture `.xlsx` (T034).
 *
 * Los fixtures están versionados, pero se generan desde
 * `tests/fixtures/excel/generar.ts`. Si falta alguno, el error dice cómo
 * regenerarlos: sin esto, la falla aparecería como un error de `exceljs` al
 * abrir un archivo inexistente y costaría entender qué hay que hacer.
 */
export function rutaFixture(archivo: string): string {
  const ruta = join(DIRECTORIO_FIXTURES, archivo);

  if (!existsSync(ruta)) {
    throw new Error(
      `Falta el fixture "${archivo}" en tests/fixtures/excel/. Regeneralo con \`npm run fixtures\`.`,
    );
  }

  return ruta;
}
