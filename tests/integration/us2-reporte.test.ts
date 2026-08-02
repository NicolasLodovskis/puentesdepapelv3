import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { importarAltaMasiva } from '@/services/importacion-alta';
import { baseTemporal } from '../helpers/db-temporal';
import { rutaFixture } from '../helpers/fixture-excel';

/**
 * US2 — reporte del Excel de alta masiva (FR-019, FR-021, FR-030).
 *
 * El reporte es lo que hace usable la carga masiva: sin él, la librera sube un
 * archivo de 2.000 filas y no sabe cuáles entraron. Por eso el invariante de
 * completitud —`filasAplicadas + noAplicadas.length === filasTotales`— se
 * verifica como aserción y no como aspiración: es la garantía de que ninguna
 * fila se descartó en silencio (Principio II).
 *
 * El reporte de alta masiva **no se persiste**: `reporteId` es `null` por
 * decisión de la spec, a diferencia del de precios (FR-036).
 *
 * Contrato del reporte (contracts/server-actions.md, con `campo` agregado porque
 * FR-019 exige informar cuál falla):
 *
 * ```ts
 * type Reporte = {
 *   reporteId: number | null
 *   nombreArchivo: string
 *   filasTotales: number
 *   filasAplicadas: number
 *   noAplicadas: FilaNoAplicada[]
 * }
 *
 * type FilaNoAplicada = {
 *   numeroFila: number
 *   tituloCrudo: string
 *   motivo: MotivoNoAplicada
 *   campo?: CampoLibro
 *   detalle?: string
 * }
 * ```
 */

type Base = ReturnType<typeof baseTemporal>;

interface FilaNoAplicada {
  numeroFila: number;
  tituloCrudo: string;
  motivo: string;
  campo?: string;
  detalle?: string;
}

function contar(db: Base, tabla: string): number {
  const fila = db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number };
  return fila.n;
}

function archivo(nombre: string) {
  return { nombre, origen: rutaFixture(nombre) };
}

/** Indexa el reporte por número de fila del archivo, que es como se lo lee. */
function porFila(noAplicadas: readonly FilaNoAplicada[]) {
  return new Map(noAplicadas.map((fila) => [fila.numeroFila, fila]));
}

function sembrarRayuela(db: Base) {
  const alta = altaLibro(db, {
    titulo: 'Rayuela',
    editorial: 'Sudamericana',
    stock: 1,
    precio: 9000,
  });
  if (!alta.ok) throw new Error('la siembra del catálogo falló');
  return alta.valor.libroId;
}

describe('importarAltaMasiva — reporte', () => {
  describe('un archivo con filas de cada categoría', () => {
    it('informa el total, las aplicadas y cada una de las no aplicadas', async () => {
      const db = baseTemporal();
      sembrarRayuela(db);

      const respuesta = await importarAltaMasiva(db, archivo('alta-mixto.xlsx'));
      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      expect(respuesta.reporte).toMatchObject({
        reporteId: null,
        nombreArchivo: 'alta-mixto.xlsx',
        filasTotales: 7,
        filasAplicadas: 2,
      });
      expect(respuesta.reporte.noAplicadas).toHaveLength(5);
    });

    it('cumple el invariante de completitud (FR-030)', async () => {
      const db = baseTemporal();
      sembrarRayuela(db);

      const respuesta = await importarAltaMasiva(db, archivo('alta-mixto.xlsx'));
      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      const { filasTotales, filasAplicadas, noAplicadas } = respuesta.reporte;
      expect(filasAplicadas + noAplicadas.length).toBe(filasTotales);
    });

    it('reporta cada fila inválida con el campo que falla y su motivo', async () => {
      const db = baseTemporal();
      sembrarRayuela(db);

      const respuesta = await importarAltaMasiva(db, archivo('alta-mixto.xlsx'));
      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      const filas = porFila(respuesta.reporte.noAplicadas as FilaNoAplicada[]);

      // Fila 4: sin editorial. Fila 6: stock con decimales. Fila 7: precio 0.
      // Tres arreglos distintos, tres mensajes distintos (FR-040 e).
      expect(filas.get(4)).toMatchObject({
        tituloCrudo: 'Pedro Páramo',
        motivo: 'invalida',
        campo: 'editorial',
      });
      expect(filas.get(6)).toMatchObject({ motivo: 'invalida', campo: 'stock' });
      expect(filas.get(6)?.detalle).toContain('decimales');
      expect(filas.get(7)).toMatchObject({ motivo: 'invalida', campo: 'precio' });
      expect(filas.get(7)?.detalle).toContain('mayor que cero');
    });

    it('reporta la ocurrencia repetida como duplicada dentro del archivo (FR-021)', async () => {
      const db = baseTemporal();
      sembrarRayuela(db);

      const respuesta = await importarAltaMasiva(db, archivo('alta-mixto.xlsx'));
      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      // La fila 2 crea "Ficciones"; la 5 es su segunda ocurrencia.
      const filas = porFila(respuesta.reporte.noAplicadas as FilaNoAplicada[]);
      expect(filas.get(5)).toMatchObject({
        tituloCrudo: 'Ficciones',
        motivo: 'duplicada_en_archivo',
      });
      expect(filas.has(2)).toBe(false);
    });

    it('reporta la coincidencia con un activo sin modificar el libro existente', async () => {
      const db = baseTemporal();
      const libroId = sembrarRayuela(db);

      const respuesta = await importarAltaMasiva(db, archivo('alta-mixto.xlsx'));
      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      const filas = porFila(respuesta.reporte.noAplicadas as FilaNoAplicada[]);
      expect(filas.get(3)).toMatchObject({ tituloCrudo: 'Rayuela', motivo: 'duplicada_de_activo' });

      // El fixture trae stock 4 y precio 21000 para "Rayuela". El libro sembrado
      // conserva los suyos: este flujo no actualiza, sólo reporta (FR-019).
      const libro = db
        .prepare('SELECT stock, precio, editorial FROM libro WHERE id = ?')
        .get(libroId);
      expect(libro).toMatchObject({ stock: 1, precio: 9000, editorial: 'Sudamericana' });

      // Y no escribió historial: las dos entradas son las del alta manual.
      const movimientos = db
        .prepare('SELECT count(*) AS n FROM movimiento_stock WHERE libro_id = ?')
        .get(libroId) as { n: number };
      expect(movimientos.n).toBe(1);
    });

    it('crea exactamente los libros de las filas aplicadas', async () => {
      const db = baseTemporal();
      sembrarRayuela(db);

      await importarAltaMasiva(db, archivo('alta-mixto.xlsx'));

      // "Ficciones" y "El Túnel", más la "Rayuela" sembrada. Nada más: ninguna
      // fila no aplicada dejó rastro en el catálogo.
      expect(contar(db, 'libro')).toBe(3);
      const titulos = (
        db.prepare('SELECT titulo_normalizado FROM libro ORDER BY titulo_normalizado').all() as {
          titulo_normalizado: string;
        }[]
      ).map((fila) => fila.titulo_normalizado);
      expect(titulos).toEqual(['ficciones', 'rayuela', 'tunel']);
    });
  });

  describe('cuando la primera ocurrencia de un título es inválida (AC-31)', () => {
    it('no aplica ninguna de las dos filas', async () => {
      const db = baseTemporal();

      const respuesta = await importarAltaMasiva(db, archivo('alta-primera-invalida.xlsx'));
      expect(respuesta.ok).toBe(true);
      if (!respuesta.ok) return;

      expect(respuesta.reporte).toMatchObject({ filasTotales: 2, filasAplicadas: 0 });

      // La condición de duplicado es posicional: la fila 3 es posterior a una
      // ocurrencia del mismo título, sin importar que esa primera no se aplicara.
      // Aplicarla sería decidir por la librera cuál de sus dos filas era la buena.
      const filas = porFila(respuesta.reporte.noAplicadas as FilaNoAplicada[]);
      expect(filas.get(2)).toMatchObject({ motivo: 'invalida', campo: 'editorial' });
      expect(filas.get(3)).toMatchObject({ motivo: 'duplicada_en_archivo' });

      expect(contar(db, 'libro')).toBe(0);
      expect(contar(db, 'movimiento_stock')).toBe(0);
      expect(contar(db, 'movimiento_precio')).toBe(0);
    });
  });
});
