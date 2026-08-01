/**
 * Catálogo de prueba de ~2.000 libros (T032), que es la escala de referencia del
 * PRD y contra la que se mide RNF-01.
 *
 * Los títulos se generan de forma **determinista**: la misma cantidad produce
 * siempre el mismo catálogo, así que una medición de rendimiento se puede
 * repetir y comparar. Se incluyen a propósito acentos, artículos, variantes de
 * edición entre paréntesis y editoriales con y sin tilde, para que la siembra
 * ejercite las normalizaciones y no sólo el volumen.
 *
 * Uso:  npx tsx scripts/sembrar.ts [cantidad]
 */

import { abrirBase, rutaBase } from '@/db/conexion';
import { migrar } from '@/db/migraciones';
import { altaLibro } from '@/services/catalogo';

export interface LibroSembrado {
  titulo: string;
  editorial: string;
  stock: number;
  precio: number;
}

const SUSTANTIVOS = [
  'jardín',
  'espejo',
  'río',
  'túnel',
  'invierno',
  'náufrago',
  'aleph',
  'informe',
  'cuaderno',
  'mapa',
  'sueño',
  'pájaro',
  'silencio',
  'umbral',
  'árbol',
  'faro',
  'cuervo',
  'péndulo',
  'jinete',
  'exilio',
];

const COMPLEMENTOS = [
  'de sal',
  'sin nombre',
  'de la memoria',
  'en la niebla',
  'de piedra',
  'perdido',
  'del sur',
  'de invierno',
  'que arde',
  'y la sombra',
];

const ARTICULOS = ['El', 'La', 'Los', 'Un', ''];

const EDITORIALES = [
  'Anagrama',
  'Anagramá',
  'Sudamericana',
  'Emecé',
  'Alfaguara',
  'Siglo XXI',
  'La Bestia Equilátera',
  'Eterna Cadencia',
  'Adriana Hidalgo',
  'Fondo de Cultura Económica',
];

const VARIANTES = ['', '', '', ' (tapa dura)', ' (edición anotada)'];

/**
 * Genera el catálogo. Determinista: sin `Math.random`, para que dos corridas
 * produzcan exactamente los mismos datos.
 */
export function librosDePrueba(cantidad = 2000): LibroSembrado[] {
  const libros: LibroSembrado[] = [];

  for (let i = 0; i < cantidad; i += 1) {
    const sustantivo = SUSTANTIVOS[i % SUSTANTIVOS.length]!;
    const complemento = COMPLEMENTOS[Math.floor(i / SUSTANTIVOS.length) % COMPLEMENTOS.length]!;
    const articulo = ARTICULOS[i % ARTICULOS.length]!;
    const variante = VARIANTES[i % VARIANTES.length]!;

    // El número al final garantiza que los títulos normalizados sean únicos,
    // que es lo que exige el UNIQUE del catálogo.
    const base = `${articulo} ${sustantivo} ${complemento} ${i + 1}`.trim();

    libros.push({
      titulo: `${base}${variante}`,
      editorial: EDITORIALES[i % EDITORIALES.length]!,
      stock: i % 12,
      precio: 5000 + (i % 40) * 500,
    });
  }

  return libros;
}

export function sembrarEn(
  db: Parameters<typeof altaLibro>[0],
  cantidad = 2000,
): { creados: number; rechazados: number } {
  let creados = 0;
  let rechazados = 0;

  for (const libro of librosDePrueba(cantidad)) {
    if (altaLibro(db, libro).ok) creados += 1;
    else rechazados += 1;
  }

  return { creados, rechazados };
}

function principal(): void {
  const cantidad = Number(process.argv[2] ?? 2000);
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    console.error('Cantidad inválida. Uso: npx tsx scripts/sembrar.ts [cantidad]');
    process.exit(1);
  }

  const ruta = rutaBase();
  const db = abrirBase(ruta);
  migrar(db);

  const inicio = performance.now();
  const { creados, rechazados } = sembrarEn(db, cantidad);
  const segundos = ((performance.now() - inicio) / 1000).toFixed(1);

  db.close();
  console.log(`Sembrados ${creados} libros en ${ruta} (${segundos} s).`);
  if (rechazados > 0) {
    console.log(`${rechazados} filas no se crearon: ya existía ese título normalizado.`);
  }
}

// Sólo corre si se lo invoca directamente, para que importarlo desde un test no
// escriba en la base real.
if (process.argv[1]?.endsWith('sembrar.ts') === true) {
  principal();
}
