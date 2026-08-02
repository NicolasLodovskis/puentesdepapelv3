import { describe, expect, it } from 'vitest';
import { buscarLibros } from '@/services/busqueda';
import { sembrarEn } from '../../scripts/sembrar';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * RNF-01: la búsqueda por nombre o editorial responde en **menos de 1 s (p95)**
 * sobre el catálogo de referencia de ~2.000 libros.
 *
 * La constitución dice que estos límites "se verifican, no se asumen". El
 * presupuesto es de la consulta contra la base, que es lo que este test mide;
 * el render de la UI queda fuera y se valida a mano por quickstart.
 */

const CATALOGO = 2000;
const PRESUPUESTO_MS = 1000;

function percentil95(muestras: readonly number[]): number {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  const indice = Math.min(ordenadas.length - 1, Math.ceil(ordenadas.length * 0.95) - 1);
  return ordenadas[indice]!;
}

function medir(veces: number, consulta: () => unknown): number[] {
  const muestras: number[] = [];
  for (let i = 0; i < veces; i += 1) {
    const inicio = performance.now();
    consulta();
    muestras.push(performance.now() - inicio);
  }
  return muestras;
}

describe('rendimiento de la búsqueda (RNF-01)', () => {
  it(`responde en menos de ${PRESUPUESTO_MS} ms (p95) sobre ~${CATALOGO} libros`, () => {
    const db = baseTemporal();
    const { creados } = sembrarEn(db, CATALOGO);
    expect(creados).toBe(CATALOGO);

    // Términos variados a propósito: uno que devuelve pocos resultados, uno que
    // devuelve muchos, y uno que no devuelve ninguno. El caso sin coincidencias
    // es el peor para un LIKE, porque recorre la tabla entera sin poder cortar.
    const consultas = [
      { texto: 'jardin de sal 1', campo: 'titulo' as const },
      { texto: 'espejo', campo: 'titulo' as const },
      { texto: 'anagrama', campo: 'editorial' as const },
      { texto: 'invierno', campo: 'ambos' as const },
      { texto: 'moby dick', campo: 'ambos' as const },
      // El catálogo completo (RF-10): trae y ordena las 2.000 filas, así que es
      // la consulta más cara de la pantalla principal.
      { texto: '', campo: 'ambos' as const },
    ];

    const muestras = consultas.flatMap((consulta) => medir(20, () => buscarLibros(db, consulta)));

    const p95 = percentil95(muestras);
    const peor = Math.max(...muestras);

    // Se informa siempre, no sólo al fallar: sirve para ver la degradación
    // antes de que el presupuesto se rompa.
    console.log(
      `RNF-01 · ${CATALOGO} libros · ${muestras.length} consultas · ` +
        `p95 ${p95.toFixed(2)} ms · peor ${peor.toFixed(2)} ms · presupuesto ${PRESUPUESTO_MS} ms`,
    );

    expect(p95).toBeLessThan(PRESUPUESTO_MS);
  });

  it('el catálogo sembrado ejercita las normalizaciones, no sólo el volumen', () => {
    const db = baseTemporal();
    sembrarEn(db, 200);

    // Editoriales con y sin tilde tienen que caer juntas bajo la misma búsqueda.
    const porEditorial = buscarLibros(db, { texto: 'anagrama', campo: 'editorial' });
    const editoriales = new Set(porEditorial.map((libro) => libro.editorial));
    expect(editoriales).toContain('Anagrama');
    expect(editoriales).toContain('Anagramá');

    // Y un título con artículo inicial se encuentra sin escribirlo.
    expect(buscarLibros(db, { texto: 'jardin de sal 1', campo: 'titulo' }).length).toBeGreaterThan(
      0,
    );
  });
});
