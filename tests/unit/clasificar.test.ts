import { describe, expect, it } from 'vitest';
import { clasificarAltaMasiva, clasificarPrecios } from '@/excel/clasificar';

/**
 * Precedencia de clasificación de filas (FR-021, FR-021b, AC-30, AC-31).
 *
 * Cada fila recibe **una sola** categoría, y de eso depende el invariante de
 * completitud del reporte: si una fila pudiera contar en dos categorías, los
 * totales dejarían de sumar y no habría forma de afirmar que ninguna fila se
 * descartó en silencio (FR-030).
 *
 * La clasificación es pura y determinista: el mismo archivo contra el mismo
 * catálogo produce siempre las mismas categorías, y no depende de qué haya
 * pasado al aplicar las filas anteriores (data-model.md). Por eso se testea sin
 * base de datos, con el catálogo pasado como dato.
 *
 * Contrato que fijan estos tests:
 *
 * ```ts
 * clasificarAltaMasiva(filas: FilaCruda[], catalogo: LibroCatalogo[]): FilaClasificada[]
 * clasificarPrecios(
 *   filas: FilaCruda[],
 *   catalogo: LibroCatalogo[],
 *   esCasiCoincidencia: (a: string, b: string) => boolean,
 * ): FilaClasificada[]
 *
 * type LibroCatalogo = {
 *   id: number; tituloNormalizado: string; estado: 'activo' | 'archivado'; precio: number
 * }
 *
 * type FilaClasificada = {
 *   numeroFila: number
 *   tituloCrudo: string          // tal como venía en el archivo
 *   categoria: CategoriaFila
 *   campo?: CampoLibro           // el que falla, cuando es `invalida`
 *   detalle?: string             // el mensaje de validación, o el título casi-coincidente
 *   campos?: CamposLibro         // los 4 campos ya validados (alta masiva)
 *   precio?: number              // el precio ya validado (precios)
 *   libro?: LibroCatalogo        // el libro del catálogo involucrado, si hay
 * }
 * ```
 *
 * El predicado de casi-coincidencia se **inyecta** en `clasificarPrecios` en vez
 * de importarse: acá se testea la precedencia, y el léxico de variantes de
 * edición se testea aparte (T056). Inyectándolo, un caso puede forzar la colisión
 * exacta-vs-casi sin depender de qué palabras trae el léxico.
 */

const ACTIVA_RAYUELA = {
  id: 1,
  tituloNormalizado: 'rayuela',
  estado: 'activo' as const,
  precio: 21000,
};

function fila(numeroFila: number, valores: Record<string, unknown>) {
  return { numeroFila, valores };
}

function filaAltaValida(numeroFila: number, libro: string) {
  return fila(numeroFila, { libro, editorial: 'Alfaguara', stock: 4, precio: 21000 });
}

describe('clasificarAltaMasiva — precedencia (FR-021b)', () => {
  describe('1. `invalida` gana sobre todo lo demás', () => {
    it('una fila con un campo faltante y título repetido es inválida, no duplicada (AC-30)', () => {
      const clasificadas = clasificarAltaMasiva(
        [
          filaAltaValida(2, 'Rayuela'),
          fila(3, { libro: 'Rayuela', editorial: null, stock: 4, precio: 21000 }),
        ],
        [],
      );

      // La segunda fila califica para las dos categorías. Reportarla como
      // duplicada escondería el dato que falta, que es lo que la librera tiene
      // que arreglar en su archivo.
      expect(clasificadas[1]).toMatchObject({
        numeroFila: 3,
        categoria: 'invalida',
        campo: 'editorial',
      });
    });

    it('una fila inválida que además coincide con un activo es inválida', () => {
      const clasificadas = clasificarAltaMasiva(
        [fila(2, { libro: 'Rayuela', editorial: 'Alfaguara', stock: 4, precio: 0 })],
        [ACTIVA_RAYUELA],
      );

      expect(clasificadas[0]).toMatchObject({ categoria: 'invalida', campo: 'precio' });
    });

    it('distingue el motivo de la invalidez en el detalle (FR-040 e)', () => {
      const clasificadas = clasificarAltaMasiva(
        [
          fila(2, { libro: 'El Aleph', editorial: 'Emecé', stock: 1.5, precio: 15000 }),
          fila(3, { libro: 'La Tregua', editorial: 'Alfaguara', stock: 3, precio: 0 }),
          fila(4, { libro: 'El Túnel', editorial: 'Seix Barral', stock: 6, precio: 'gratis' }),
        ],
        [],
      );

      // Tres correcciones distintas para quien arregla el archivo: sacar el
      // decimal, poner un precio > 0, escribir un número. Un motivo único las
      // volvería indistinguibles.
      expect(clasificadas.map((c) => c.campo)).toEqual(['stock', 'precio', 'precio']);
      expect(clasificadas[0]?.detalle).toContain('decimales');
      expect(clasificadas[1]?.detalle).toContain('mayor que cero');
      expect(clasificadas[2]?.detalle).toContain('no es un número');
    });

    it('no deduplica las filas sin título: sin clave no hay ocurrencia que repetir', () => {
      const clasificadas = clasificarAltaMasiva(
        [
          fila(2, { libro: null, editorial: 'Alfaguara', stock: 4, precio: 21000 }),
          fila(3, { libro: '   ', editorial: 'Alfaguara', stock: 4, precio: 21000 }),
        ],
        [],
      );

      // Las dos son inválidas por el título. Tratar la segunda como duplicada de
      // la primera implicaría que "sin título" es un título.
      expect(clasificadas.map((c) => c.categoria)).toEqual(['invalida', 'invalida']);
      expect(clasificadas.map((c) => c.campo)).toEqual(['titulo', 'titulo']);
    });
  });

  describe('2. `duplicada_en_archivo` gana sobre las categorías del catálogo', () => {
    it('un título repetido que además coincide con un activo es duplicada en el archivo (AC-30)', () => {
      const clasificadas = clasificarAltaMasiva(
        [filaAltaValida(2, 'Rayuela'), filaAltaValida(3, 'Rayuela')],
        [ACTIVA_RAYUELA],
      );

      expect(clasificadas.map((c) => c.categoria)).toEqual([
        'duplicada_de_activo',
        'duplicada_en_archivo',
      ]);
    });

    it('es posicional: si la primera ocurrencia es inválida, la posterior tampoco se aplica (AC-31)', () => {
      const clasificadas = clasificarAltaMasiva(
        [
          fila(2, { libro: 'Rayuela', editorial: null, stock: 4, precio: 21000 }),
          filaAltaValida(3, 'Rayuela'),
        ],
        [],
      );

      // Ninguna de las dos se aplica. Aplicar la segunda sería decidir por la
      // librera cuál de las dos filas era la buena.
      expect(clasificadas.map((c) => c.categoria)).toEqual(['invalida', 'duplicada_en_archivo']);
      expect(clasificadas.some((c) => c.categoria === 'aplicada')).toBe(false);
    });

    it('la repetición se mide por título normalizado, no por texto literal', () => {
      const clasificadas = clasificarAltaMasiva(
        [filaAltaValida(2, 'El Principito'), filaAltaValida(3, 'Principito, El')],
        [],
      );

      // Las dos formas normalizan a `principito`: son el mismo libro escrito de
      // dos maneras, y crear los dos rompería la unicidad del catálogo (FR-004).
      expect(clasificadas.map((c) => c.categoria)).toEqual(['aplicada', 'duplicada_en_archivo']);
    });
  });

  describe('3 a 5. las categorías que dependen del catálogo', () => {
    it('la coincidencia exacta con un activo es duplicada de activo y no se aplica', () => {
      const clasificadas = clasificarAltaMasiva([filaAltaValida(2, 'Rayuela')], [ACTIVA_RAYUELA]);

      expect(clasificadas[0]).toMatchObject({
        categoria: 'duplicada_de_activo',
        libro: ACTIVA_RAYUELA,
      });
    });

    it('sin coincidencia se aplica, con los campos ya validados', () => {
      const clasificadas = clasificarAltaMasiva([filaAltaValida(2, 'Ficciones')], [ACTIVA_RAYUELA]);

      expect(clasificadas[0]).toMatchObject({
        numeroFila: 2,
        tituloCrudo: 'Ficciones',
        categoria: 'aplicada',
        campos: { titulo: 'Ficciones', editorial: 'Alfaguara', stock: 4, precio: 21000 },
      });
    });

    it('una variante de edición de un libro existente no coincide: es un libro nuevo (AC-33)', () => {
      const clasificadas = clasificarAltaMasiva(
        [filaAltaValida(2, 'El Principito (tapa dura)')],
        [{ id: 9, tituloNormalizado: 'principito', estado: 'activo', precio: 15000 }],
      );

      // En alta masiva la comparación es **sólo exacta**: acá la librera carga su
      // propio inventario y las ediciones distintas son ejemplares distintos
      // (FR-017). La casi-coincidencia no participa de este flujo.
      expect(clasificadas[0]?.categoria).toBe('aplicada');
    });
  });

  describe('el resultado cubre todas las filas', () => {
    it('devuelve una clasificación por fila, en el mismo orden', () => {
      const filas = [
        filaAltaValida(2, 'Rayuela'),
        fila(3, { libro: 'Ficciones', editorial: null, stock: 2, precio: 18500 }),
        filaAltaValida(4, 'Rayuela'),
      ];

      const clasificadas = clasificarAltaMasiva(filas, []);

      // Es la base del invariante de completitud del reporte (FR-030): si la
      // clasificación pudiera devolver menos filas de las que recibe, habría
      // filas descartadas antes de llegar al reporte.
      expect(clasificadas).toHaveLength(filas.length);
      expect(clasificadas.map((c) => c.numeroFila)).toEqual([2, 3, 4]);
    });
  });
});

describe('clasificarPrecios — precedencia (FR-021b)', () => {
  /** Fuerza la colisión: un título es casi-coincidencia del otro si lo prefija. */
  const esCasiCoincidencia = (a: string, b: string) =>
    a !== b && (a.startsWith(`${b} `) || b.startsWith(`${a} `));

  it('la coincidencia exacta gana sobre la casi-coincidencia (AC-30)', () => {
    const activoExacto = {
      id: 1,
      tituloNormalizado: 'principito',
      estado: 'activo' as const,
      precio: 15000,
    };
    const activoVariante = {
      id: 2,
      tituloNormalizado: 'principito tapa blanda',
      estado: 'activo' as const,
      precio: 15000,
    };

    const clasificadas = clasificarPrecios(
      [fila(2, { libro: 'El Principito', precio: 16000 })],
      [activoExacto, activoVariante],
      esCasiCoincidencia,
    );

    // La fila califica para las dos: coincide exacto con el primero y es
    // casi-coincidencia del segundo. Resolver por la casi-coincidencia dejaría
    // sin actualizar un libro que la librera nombró exactamente.
    expect(clasificadas[0]).toMatchObject({
      categoria: 'aplicada',
      libro: activoExacto,
      precio: 16000,
    });
  });
});
