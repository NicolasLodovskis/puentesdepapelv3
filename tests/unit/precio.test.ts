import { describe, expect, it } from 'vitest';
import { aEntero } from '@/domain/precio';

/**
 * R5, enmendado el 2026-07-30: el precio es un **entero de unidad de moneda** y
 * el sistema no maneja centavos (PRD RF-01, RF-31; spec FR-040). Esta función es
 * el único borde de entrada: convierte lo que llega de la UI o de una celda de
 * Excel a ese entero, o lo rechaza con el motivo.
 *
 * Recibe `unknown` a propósito: una celda de Excel puede traer un número, un
 * texto, una fecha, vacío o basura, y es acá donde eso se contiene. La función
 * nunca lanza — un archivo de 5.000 filas no puede caerse por una celda mala,
 * tiene que reportarla (FR-019, FR-030).
 */
describe('aEntero', () => {
  describe('enteros, que es la forma esperada del precio', () => {
    const casos: ReadonlyArray<readonly [string, number]> = [
      ['1234', 1234],
      ['15000', 15000],
      ['1', 1],
      ['999999999', 999999999],
      ['0001234', 1234],
    ];

    it.each(casos)('%s → %i', (entrada, esperado) => {
      expect(aEntero(entrada)).toEqual({ valido: true, precio: esperado });
    });

    it('acepta el número tal cual, que es lo que da una celda numérica de Excel', () => {
      expect(aEntero(1234)).toEqual({ valido: true, precio: 1234 });
      expect(aEntero(15000)).toEqual({ valido: true, precio: 15000 });
    });

    it('recorta espacios alrededor del importe', () => {
      expect(aEntero('  1234  ')).toEqual({ valido: true, precio: 1234 });
    });
  });

  describe('parte decimal cero: denota exactamente ese entero, se acepta (FR-040 b)', () => {
    const casos: ReadonlyArray<readonly [string, number]> = [
      ['1234,00', 1234],
      ['1234.00', 1234],
      ['1234,0', 1234],
      ['1234.0', 1234],
      ['1234,000', 1234],
    ];

    it.each(casos)('%s → %i', (entrada, esperado) => {
      expect(aEntero(entrada)).toEqual({ valido: true, precio: esperado });
    });

    /**
     * Es el caso que hace que la regla sea usable en la práctica: Excel escribe
     * `.0` en una celda numérica con formato de decimales, y rechazar esas filas
     * sería rechazar el archivo entero por una cuestión de formato.
     */
    it('el número 1234.0 es el entero 1234, no un decimal', () => {
      expect(aEntero(1234.0)).toEqual({ valido: true, precio: 1234 });
    });

    it('la coma y el punto valen lo mismo como separador decimal', () => {
      expect(aEntero('1234,00')).toEqual(aEntero('1234.00'));
    });
  });

  describe('parte decimal distinta de cero: se rechaza SIN redondear (FR-040 c)', () => {
    const casos: ReadonlyArray<readonly [string, unknown]> = [
      ['coma con medio', '1234,50'],
      ['punto con medio', '1234.5'],
      ['un centésimo', '1234,01'],
      ['una milésima', '1234,001'],
      ['menor que uno', '0,5'],
      ['número decimal', 1234.5],
      ['número decimal chico', 0.5],
      ['un solo separador con tres dígitos', '1.234'],
    ];

    it.each(casos)('rechaza %s', (_descripcion, entrada) => {
      expect(aEntero(entrada)).toEqual({ valido: false, motivo: 'con_decimales' });
    });

    /**
     * El corazón de la decisión: redondear modificaría un importe sin avisar, y
     * un precio de venta mal aplicado no se distingue después de uno correcto
     * (Principio II). La fila se reporta y la librera decide.
     */
    it('no redondea ni hacia arriba ni hacia abajo: rechaza', () => {
      expect(aEntero('1234,49')).toEqual({ valido: false, motivo: 'con_decimales' });
      expect(aEntero('1234,50')).toEqual({ valido: false, motivo: 'con_decimales' });
      expect(aEntero('1234,99')).toEqual({ valido: false, motivo: 'con_decimales' });
    });

    /**
     * `1.234` es ambiguo —mil doscientos treinta y cuatro con punto de miles, o
     * uno con 234 milésimas—. Se trata el único separador presente como decimal,
     * así que cae acá. Lo que importa es que **no se aplica**: elegir una de las
     * dos lecturas sería adivinar sobre dinero.
     */
    it('un valor ambiguo entre miles y decimales nunca se aplica', () => {
      expect(aEntero('1.234').valido).toBe(false);
      expect(aEntero('1,234').valido).toBe(false);
    });
  });

  describe('rechazo de lo que no es numérico (FR-040 d)', () => {
    const casos: ReadonlyArray<readonly [string, unknown]> = [
      ['texto', 'abc'],
      ['texto con número', '1234 pesos'],
      ['con símbolo de moneda', '$1234'],
      ['dos separadores distintos, separador de miles', '1.234,50'],
      ['dos separadores iguales', '12,34,56'],
      ['notación científica', '1e3'],
      ['sólo el separador', ','],
      ['sólo el signo', '-'],
      ['booleano', true],
      ['objeto', {}],
      ['arreglo', []],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
    ];

    it.each(casos)('rechaza %s', (_descripcion, entrada) => {
      expect(aEntero(entrada)).toEqual({ valido: false, motivo: 'no_numerico' });
    });
  });

  describe('celda ausente, que se distingue del no numérico (FR-040 e)', () => {
    const casos: ReadonlyArray<readonly [string, unknown]> = [
      ['null', null],
      ['undefined', undefined],
      ['cadena vacía', ''],
      ['sólo espacios', '   '],
    ];

    /**
     * "Falta el precio" y "el precio no es un número" son dos correcciones
     * distintas para quien arregla el archivo, así que el reporte las distingue.
     */
    it.each(casos)('%s se reporta como ausente', (_descripcion, entrada) => {
      expect(aEntero(entrada)).toEqual({ valido: false, motivo: 'ausente' });
    });
  });

  describe('rechazo de precios no positivos (FR-002: precio > 0)', () => {
    const casos: ReadonlyArray<readonly [string, unknown]> = [
      ['cero como texto', '0'],
      ['cero con decimales en cero', '0,00'],
      ['cero numérico', 0],
      ['negativo como texto', '-1234'],
      ['negativo con decimales en cero', '-1234,00'],
      ['negativo numérico', -1],
    ];

    it.each(casos)('rechaza %s', (_descripcion, entrada) => {
      expect(aEntero(entrada)).toEqual({ valido: false, motivo: 'no_positivo' });
    });
  });

  describe('invariantes del resultado', () => {
    it('todo resultado válido es un entero estrictamente positivo', () => {
      for (const entrada of ['1234', '1234,00', 1234, '1', '  15000  ']) {
        const resultado = aEntero(entrada);
        expect(resultado.valido).toBe(true);
        if (resultado.valido) {
          expect(Number.isInteger(resultado.precio)).toBe(true);
          expect(resultado.precio).toBeGreaterThan(0);
        }
      }
    });

    it('nunca lanza: cualquier entrada devuelve un resultado', () => {
      const entradas: unknown[] = [
        null,
        undefined,
        '',
        'abc',
        {},
        [],
        Number.NaN,
        new Date(),
        Symbol('x'),
        123n,
        () => 1,
      ];
      for (const entrada of entradas) {
        expect(() => aEntero(entrada)).not.toThrow();
        expect(aEntero(entrada).valido).toBe(false);
      }
    });
  });
});
