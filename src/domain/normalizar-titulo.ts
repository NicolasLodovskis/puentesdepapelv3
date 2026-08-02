/**
 * Única normalización de títulos del sistema (restricción de la constitución).
 *
 * De esta función dependen la unicidad del catálogo (FR-004), la búsqueda por
 * texto (FR-005) y el matcheo de los dos flujos de Excel. Una segunda
 * implementación divergente haría que cada flujo encontrara libros distintos
 * para el mismo título, así que nadie más normaliza títulos: se importa de acá.
 *
 * Los pasos y su orden están fijados en research.md § R3 (FR-003).
 */

/** Conjunto cerrado del español. Cerrado a propósito: hace la regla determinista. */
const ARTICULOS: ReadonlySet<string> = new Set([
  'el',
  'la',
  'los',
  'las',
  'lo',
  'un',
  'una',
  'unos',
  'unas',
]);

/** Paso 2 — equivalentes ASCII de comillas, guiones y puntos suspensivos tipográficos. */
const TIPOGRAFICOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[“”„‟«»]/g, '"'],
  [/[‘’‚‛‹›]/g, "'"],
  [/[‐‑‒–—―−]/g, '-'],
  [/…/g, '...'],
];

/** Paso 6, primera mitad: el artículo pospuesto, con la coma todavía presente. */
const ARTICULO_POSPUESTO = new RegExp(`,\\s*(?:${[...ARTICULOS].join('|')})\\s*$`);

export function normalizarTitulo(titulo: string): string {
  // Paso 1 — NFD y eliminación de marcas diacríticas: quita acentos, diéresis y
  // la virgulilla de la ñ, que colapsa a n.
  let resultado = titulo.normalize('NFD').replace(/\p{M}+/gu, '');

  // Paso 2 — comillas y guiones tipográficos a ASCII. Hoy el paso 4 los borraría
  // igual; el paso existe para que la regla de R3 quede explícita y para que la
  // función no dependa de ese solapamiento.
  for (const [patron, reemplazo] of TIPOGRAFICOS) {
    resultado = resultado.replace(patron, reemplazo);
  }

  // Paso 3 — minúsculas.
  resultado = resultado.toLowerCase();

  // Paso 6a — el artículo pospuesto ("Principito, El") se detecta ACÁ, antes de
  // que el paso 4 elimine la coma que lo identifica. Corriendo después, habría
  // que quitar el último artículo aunque no hubiera coma, y eso mutilaría un
  // título que legítimamente termina en artículo.
  resultado = resultado.replace(ARTICULO_POSPUESTO, '');

  // Paso 4 — fuera todo lo que no sea alfanumérico o espacio. Los paréntesis se
  // eliminan pero su contenido queda como palabras: de eso depende que una
  // variante de edición NO normalice igual que el título base, que es lo que
  // hace alcanzable la casi-coincidencia de FR-015.
  //
  // "Espacio" acá es cualquier espacio en blanco, no sólo el ASCII: un título
  // pegado desde una web o una celda de Excel trae espacios duros (U+00A0), y
  // borrarlos pegaría las palabras ("cien anos" → "cienanos"), corrompiendo la
  // clave del catálogo. Sobreviven al paso 4 y el paso 5 los colapsa.
  resultado = resultado.replace(/[^\p{L}\p{N}\s]+/gu, '');

  // Paso 5 — colapso de espacios y recorte.
  resultado = resultado.replace(/\s+/g, ' ').trim();

  // Paso 6b — el artículo inicial. Sólo la primera palabra: los artículos del
  // interior del título se conservan.
  const palabras = resultado.split(' ');
  if (palabras.length > 1 && ARTICULOS.has(palabras[0]!)) {
    palabras.shift();
  }

  return palabras.join(' ');
}

/**
 * Normalización de **editorial**, deliberadamente más floja que la de título
 * (data-model.md): sólo los pasos 1, 3 y 5 —acentos, minúsculas y espacios—,
 * sin tocar puntuación ni artículos.
 *
 * No es una clave ni participa del matcheo de los Excel, así que no necesita esa
 * agresividad; y quitarle el artículo convertiría "La Bestia Equilátera" en
 * "bestia equilatera", que no es como la librera la busca. Comparte el núcleo
 * con `normalizarTitulo` para que las dos no puedan divergir en cómo tratan un
 * acento o una mayúscula.
 *
 * Existe porque `LIKE` de SQLite ignora mayúsculas sólo en ASCII: sin esta
 * columna derivada, buscar `anagrama` no encontraría `Anagramá`.
 */
export function normalizarEditorial(editorial: string): string {
  return plegarTexto(editorial);
}

/**
 * Los pasos 1, 3 y 5 sueltos: acentos, minúsculas y espacios. Es el núcleo
 * compartido por la normalización de editorial y por el reconocimiento de
 * encabezados de Excel (FR-039 c), que necesitan exactamente esa tolerancia y
 * ninguna más — no tocan puntuación ni artículos.
 *
 * Está acá y no duplicado en cada lugar para que no puedan divergir en cómo
 * tratan un acento: si `" Precio "` se reconociera con una regla y `Anagramá`
 * se guardara con otra, la misma tilde valdría distinto según el camino.
 */
export function plegarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
