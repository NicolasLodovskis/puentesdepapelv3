import { describe, expect, it } from 'vitest';
import { validarCamposLibro } from '@/domain/validar-libro';

/**
 * Validación compartida por el alta manual, la edición y las dos ingestas de
 * Excel (contracts/server-actions.md, FR-002, FR-019). Es una sola función a
 * propósito: si cada flujo validara por su cuenta, un Excel podría crear un
 * libro que el formulario habría rechazado.
 *
 * Devuelve `Resultado<T>`: `{ ok: true, valor }` con los campos ya recortados y
 * convertidos, o `{ ok: false, error }` con `tipo: 'validacion'` y el campo que
 * falla. No lanza — los errores de validación son parte del contrato.
 */

const VALIDO = { titulo: 'El Principito', editorial: 'Salamandra', stock: 3, precio: 15000 };

describe('validarCamposLibro', () => {
  describe('entrada válida', () => {
    it('devuelve los campos convertidos', () => {
      expect(validarCamposLibro(VALIDO)).toEqual({
        ok: true,
        valor: { titulo: 'El Principito', editorial: 'Salamandra', stock: 3, precio: 15000 },
      });
    });

    it('recorta los espacios de título y editorial, y devuelve el valor recortado', () => {
      const resultado = validarCamposLibro({
        ...VALIDO,
        titulo: '  El Principito  ',
        editorial: '\tSalamandra\n',
      });
      expect(resultado).toEqual({
        ok: true,
        valor: { titulo: 'El Principito', editorial: 'Salamandra', stock: 3, precio: 15000 },
      });
    });

    it('acepta stock 0: un libro sin ejemplares sigue siendo un libro del catálogo', () => {
      const resultado = validarCamposLibro({ ...VALIDO, stock: 0 });
      expect(resultado).toEqual({ ok: true, valor: { ...VALIDO, stock: 0 } });
    });

    it('acepta stock y precio como texto, que es como llegan de un formulario', () => {
      const resultado = validarCamposLibro({ ...VALIDO, stock: '3', precio: '15000' });
      expect(resultado).toEqual({ ok: true, valor: VALIDO });
    });

    /**
     * Excel escribe `.0` en las celdas numéricas con formato de decimales. Si se
     * rechazara, un archivo entero caería por una cuestión de formato (FR-040 b).
     */
    it('acepta la parte decimal cero en stock y precio', () => {
      expect(validarCamposLibro({ ...VALIDO, stock: '3,00', precio: '15000,00' })).toEqual({
        ok: true,
        valor: VALIDO,
      });
      expect(validarCamposLibro({ ...VALIDO, stock: 3.0, precio: 15000.0 })).toEqual({
        ok: true,
        valor: VALIDO,
      });
    });
  });

  describe('título', () => {
    const invalidos: ReadonlyArray<readonly [string, unknown]> = [
      ['vacío', ''],
      ['sólo espacios', '   '],
      ['sólo tabulaciones y saltos', '\t\n'],
      ['ausente', undefined],
      ['null', null],
      ['objeto', {}],
      ['booleano', true],
    ];

    it.each(invalidos)('rechaza el título %s señalando el campo', (_descripcion, titulo) => {
      const resultado = validarCamposLibro({ ...VALIDO, titulo });
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error.tipo).toBe('validacion');
        if (resultado.error.tipo === 'validacion') {
          expect(resultado.error.campo).toBe('titulo');
          expect(resultado.error.mensaje.length).toBeGreaterThan(0);
        }
      }
    });

    /**
     * Una celda de Excel con el título "1984" llega como número, no como texto.
     * Rechazarla dejaría afuera un libro perfectamente válido, y convertirla es
     * exacto, no una interpretación.
     */
    it('acepta un título numérico, porque así llega de una celda de Excel', () => {
      const resultado = validarCamposLibro({ ...VALIDO, titulo: 1984 });
      expect(resultado).toEqual({ ok: true, valor: { ...VALIDO, titulo: '1984' } });
    });
  });

  describe('editorial', () => {
    const invalidos: ReadonlyArray<readonly [string, unknown]> = [
      ['vacía', ''],
      ['sólo espacios', '   '],
      ['ausente', undefined],
      ['null', null],
      ['objeto', {}],
    ];

    it.each(invalidos)('rechaza la editorial %s señalando el campo', (_descripcion, editorial) => {
      const resultado = validarCamposLibro({ ...VALIDO, editorial });
      expect(resultado.ok).toBe(false);
      if (!resultado.ok && resultado.error.tipo === 'validacion') {
        expect(resultado.error.campo).toBe('editorial');
      }
    });
  });

  describe('stock: entero >= 0', () => {
    const invalidos: ReadonlyArray<readonly [string, unknown]> = [
      ['negativo', -1],
      ['negativo como texto', '-1'],
      ['con decimales', 2.5],
      ['con decimales como texto', '2,5'],
      ['no numérico', 'tres'],
      ['ausente', undefined],
      ['null', null],
      ['cadena vacía', ''],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['booleano', true],
    ];

    it.each(invalidos)('rechaza el stock %s señalando el campo', (_descripcion, stock) => {
      const resultado = validarCamposLibro({ ...VALIDO, stock });
      expect(resultado.ok).toBe(false);
      if (!resultado.ok && resultado.error.tipo === 'validacion') {
        expect(resultado.error.campo).toBe('stock');
      }
    });

    it('acepta el 0 pero no el -0,5, que es la frontera de la regla', () => {
      expect(validarCamposLibro({ ...VALIDO, stock: 0 }).ok).toBe(true);
      expect(validarCamposLibro({ ...VALIDO, stock: -0.5 }).ok).toBe(false);
    });
  });

  describe('precio: entero > 0 (FR-040)', () => {
    const invalidos: ReadonlyArray<readonly [string, unknown]> = [
      ['cero', 0],
      ['cero como texto', '0'],
      ['negativo', -15000],
      ['con decimales', '15000,50'],
      ['no numérico', 'quince mil'],
      ['con separador de miles', '15.000,50'],
      ['ausente', undefined],
      ['null', null],
      ['cadena vacía', ''],
    ];

    it.each(invalidos)('rechaza el precio %s señalando el campo', (_descripcion, precio) => {
      const resultado = validarCamposLibro({ ...VALIDO, precio });
      expect(resultado.ok).toBe(false);
      if (!resultado.ok && resultado.error.tipo === 'validacion') {
        expect(resultado.error.campo).toBe('precio');
      }
    });

    /**
     * FR-040 (e) exige distinguir el precio ausente del no numérico, y el
     * decimal es un tercer arreglo distinto. Como `ErrorNegocio` sólo lleva
     * `campo` y `mensaje`, esa distinción tiene que vivir en el mensaje: si los
     * tres dijeran lo mismo, el reporte del Excel perdería la información que
     * FR-040 pide conservar.
     */
    it('el mensaje distingue el precio ausente del no numérico y del decimal', () => {
      const mensaje = (precio: unknown): string => {
        const resultado = validarCamposLibro({ ...VALIDO, precio });
        if (resultado.ok || resultado.error.tipo !== 'validacion') return '';
        return resultado.error.mensaje;
      };

      const ausente = mensaje(undefined);
      const noNumerico = mensaje('quince mil');
      const conDecimales = mensaje('15000,50');

      expect(new Set([ausente, noNumerico, conDecimales]).size).toBe(3);
      for (const m of [ausente, noNumerico, conDecimales]) {
        expect(m.length).toBeGreaterThan(0);
      }
    });
  });

  describe('precedencia cuando falla más de un campo', () => {
    /**
     * `ErrorNegocio` reporta un solo campo, así que el orden tiene que ser fijo
     * y conocido: título, editorial, stock, precio — el mismo en que están
     * declarados en el contrato. Sin un orden fijo, el reporte de un Excel
     * cambiaría de motivo según el detalle de la implementación.
     */
    const casos: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
      [{ titulo: '', editorial: '', stock: -1, precio: 0 }, 'titulo'],
      [{ editorial: '', stock: -1, precio: 0 }, 'editorial'],
      [{ stock: -1, precio: 0 }, 'stock'],
      [{ precio: 0 }, 'precio'],
    ];

    it.each(casos)('%j reporta el campo %s', (parcial, campoEsperado) => {
      const resultado = validarCamposLibro({ ...VALIDO, ...parcial });
      expect(resultado.ok).toBe(false);
      if (!resultado.ok && resultado.error.tipo === 'validacion') {
        expect(resultado.error.campo).toBe(campoEsperado);
      }
    });
  });

  describe('robustez', () => {
    it('nunca lanza, cualquiera sea la entrada', () => {
      const basura: unknown[] = [Symbol('x'), 123n, () => 1, new Date(), [], {}, Number.NaN, null];
      for (const valor of basura) {
        const entrada = { titulo: valor, editorial: valor, stock: valor, precio: valor };
        expect(() => validarCamposLibro(entrada)).not.toThrow();
        expect(validarCamposLibro(entrada).ok).toBe(false);
      }
    });

    it('no modifica el objeto recibido', () => {
      const entrada = {
        titulo: '  El Principito  ',
        editorial: ' Salamandra ',
        stock: 3,
        precio: 1,
      };
      const copia = { ...entrada };
      validarCamposLibro(entrada);
      expect(entrada).toEqual(copia);
    });
  });
});
