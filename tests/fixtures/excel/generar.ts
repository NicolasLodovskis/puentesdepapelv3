/**
 * Fixtures `.xlsx` de alta masiva (T034) — uno por categoría de fila y uno por
 * regla de encabezado de FR-039.
 *
 * Los `.xlsx` son binarios y **se versionan** (ver `.gitignore`): sin ellos los
 * tests de US2 no corren. Este archivo es su fuente de verdad legible: el
 * contenido de cada fixture se declara acá como una tabla y se materializa con
 * `exceljs`, así que el diff que un binario no puede mostrar se lee en este
 * archivo.
 *
 * **Después de tocar las declaraciones de abajo hay que regenerar**:
 *
 * ```bash
 * npm run fixtures
 * ```
 *
 * Los archivos se escriben con datos sintéticos: ningún dato real del negocio
 * entra al repositorio (Principio IV).
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Una celda vacía se declara `null`; una fila vacía, con celdas `''`. */
type Celda = string | number | null;

interface Hoja {
  nombre: string;
  filas: readonly (readonly Celda[])[];
}

interface Fixture {
  archivo: string;
  /** Qué regla o categoría materializa: es lo que justifica que exista. */
  proposito: string;
  hojas: readonly Hoja[];
}

const ENCABEZADO_ALTA = ['libro', 'editorial', 'stock', 'precio'] as const;

/**
 * Una fila declarada con celdas `''` en lugar de omitida: exceljs no escribe al
 * archivo las filas sin celdas, y entonces la fila no ocuparía su número. Acá
 * hacen falta filas que **existan y estén vacías**, para que el encabezado no
 * caiga en la primera fila y la regla (b) de FR-039 sea comprobable.
 */
const FILA_VACIA = ['', '', '', ''] as const;

export const FIXTURES: readonly Fixture[] = [
  {
    archivo: 'alta-valido.xlsx',
    proposito:
      'Las 4 columnas obligatorias y 3 filas válidas. La fila vacía del final no cuenta como fila.',
    hojas: [
      {
        nombre: 'Alta',
        filas: [
          ENCABEZADO_ALTA,
          ['Rayuela', 'Alfaguara', 4, 21000],
          ['Ficciones', 'Emecé', 2, 18500],
          ['Pedro Páramo', 'Fondo de Cultura Económica', 7, 12000],
          FILA_VACIA,
        ],
      },
    ],
  },

  {
    archivo: 'alta-falta-columna.xlsx',
    proposito:
      'Falta la columna *precio*. Las filas son válidas en todo lo demás: el rechazo es por ' +
      'el encabezado y es total, no fila por fila (FR-016).',
    hojas: [
      {
        nombre: 'Alta',
        filas: [
          ['libro', 'editorial', 'stock'],
          ['Rayuela', 'Alfaguara', 4],
          ['Ficciones', 'Emecé', 2],
        ],
      },
    ],
  },

  {
    archivo: 'alta-encabezados-tolerables.xlsx',
    proposito:
      'AC-36: encabezado en la primera fila NO vacía, con mayúsculas, acento y espacios ' +
      'sobrantes, más una columna extra. La segunda hoja existe para comprobar que se ignora.',
    hojas: [
      {
        nombre: 'Hoja de carga',
        filas: [
          FILA_VACIA,
          FILA_VACIA,
          [' LIBRO ', 'Editoríal', 'STOCK', ' Precio ', 'Observaciones'],
          ['Rayuela', 'Alfaguara', 4, 21000, 'revisar la tapa'],
        ],
      },
      {
        nombre: 'Pendientes',
        filas: [ENCABEZADO_ALTA, ['No Debe Leerse', 'Editorial Fantasma', 1, 999]],
      },
    ],
  },

  {
    archivo: 'alta-sinonimo.xlsx',
    proposito:
      'AC-37: *importe* en lugar de *precio*. No hay sinónimos: interpretarlo sería adivinar ' +
      'la intención del archivo (FR-039 d).',
    hojas: [
      {
        nombre: 'Alta',
        filas: [
          ['libro', 'editorial', 'stock', 'importe'],
          ['Rayuela', 'Alfaguara', 4, 21000],
        ],
      },
    ],
  },

  {
    archivo: 'alta-columna-repetida.xlsx',
    proposito:
      'AC-37: *precio* aparece dos veces. Elegir una de las dos sería adivinar, así que el ' +
      'archivo se rechaza (FR-039 f).',
    hojas: [
      {
        nombre: 'Alta',
        filas: [
          ['libro', 'editorial', 'stock', 'precio', 'precio'],
          ['Rayuela', 'Alfaguara', 4, 21000, 19000],
        ],
      },
    ],
  },

  {
    archivo: 'alta-mixto.xlsx',
    proposito:
      'Una fila por categoría de alta masiva (FR-019, FR-021). Se procesa contra un catálogo ' +
      'con "Rayuela" activa, que es lo que hace de la fila 3 una duplicada de activo.',
    hojas: [
      {
        nombre: 'Alta',
        filas: [
          ENCABEZADO_ALTA,
          // aplicada
          ['Ficciones', 'Emecé', 2, 18500],
          // duplicada_de_activo — "Rayuela" ya está en el catálogo
          ['Rayuela', 'Alfaguara', 4, 21000],
          // invalida — falta la editorial
          ['Pedro Páramo', null, 7, 12000],
          // duplicada_en_archivo — segunda ocurrencia de "Ficciones"
          ['Ficciones', 'Emecé', 5, 19000],
          // invalida — el stock tiene decimales y no se redondea
          ['El Aleph', 'Emecé', 1.5, 15000],
          // invalida — el precio no es > 0
          ['La Tregua', 'Alfaguara', 3, 0],
          // aplicada
          ['El Túnel', 'Seix Barral', 6, 9500],
        ],
      },
    ],
  },

  {
    archivo: 'alta-variante-edicion.xlsx',
    proposito:
      'AC-33: contra un catálogo con "El Principito", esta fila crea un libro nuevo. En alta ' +
      'masiva la comparación es sólo exacta y la casi-coincidencia no aplica (FR-017).',
    hojas: [
      {
        nombre: 'Alta',
        filas: [ENCABEZADO_ALTA, ['El Principito (tapa dura)', 'Salamandra', 2, 16000]],
      },
    ],
  },

  {
    archivo: 'alta-primera-invalida.xlsx',
    proposito:
      'AC-31: la primera ocurrencia del título es inválida y la posterior es válida. Ninguna ' +
      'se aplica: la condición de duplicado es posicional (FR-021).',
    hojas: [
      {
        nombre: 'Alta',
        filas: [
          ENCABEZADO_ALTA,
          ['Rayuela', null, 4, 21000],
          ['Rayuela', 'Alfaguara', 4, 21000],
        ],
      },
    ],
  },
];

export const DIRECTORIO_FIXTURES = dirname(fileURLToPath(import.meta.url));

async function escribir(fixture: Fixture): Promise<string> {
  const libro = new ExcelJS.Workbook();

  for (const hoja of fixture.hojas) {
    const worksheet = libro.addWorksheet(hoja.nombre);
    for (const fila of hoja.filas) {
      worksheet.addRow([...fila]);
    }
  }

  const ruta = join(DIRECTORIO_FIXTURES, fixture.archivo);
  await libro.xlsx.writeFile(ruta);
  return ruta;
}

export async function generarFixtures(): Promise<string[]> {
  const rutas: string[] = [];
  for (const fixture of FIXTURES) {
    rutas.push(await escribir(fixture));
  }
  return rutas;
}

// Entrada de línea de comandos: `npm run fixtures`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rutas = await generarFixtures();
  for (const ruta of rutas) {
    console.log(`escrito  ${ruta}`);
  }
}
