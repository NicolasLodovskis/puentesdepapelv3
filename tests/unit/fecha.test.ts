import { describe, expect, it } from 'vitest';
import { ahora, aIsoLocal, DESFASE_UTC } from '@/domain/fecha';

/**
 * R6, enmendado: las marcas temporales se guardan en **UTC-3**, la hora de la
 * librería, con el desfase explícito (`-03:00`) en la propia cadena.
 *
 * Que el desfase sea explícito y **fijo** es lo que sostiene las dos
 * propiedades de las que depende el historial: la marca sigue siendo inequívoca
 * —no hay que adivinar en qué zona se escribió— y el orden lexicográfico sigue
 * coincidiendo con el cronológico, que es lo que hace correcto el `ORDER BY` de
 * SQLite sin tipo fecha nativo.
 */
describe('aIsoLocal', () => {
  it('escribe la hora de la librería, no la UTC', () => {
    // 2026-08-02 01:08:40.583 UTC son las 22:08 del día anterior en Argentina.
    expect(aIsoLocal(new Date('2026-08-02T01:08:40.583Z'))).toBe('2026-08-01T22:08:40.583-03:00');
  });

  it('conserva los milisegundos, que son el desempate del historial', () => {
    expect(aIsoLocal(new Date('2026-08-02T12:00:00.007Z'))).toBe('2026-08-02T09:00:00.007-03:00');
  });

  it('siempre lleva el desfase explícito, nunca una hora suelta', () => {
    for (const instante of ['2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z']) {
      expect(aIsoLocal(new Date(instante))).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/,
      );
    }
  });

  it('cruza el cambio de día hacia atrás cuando corresponde', () => {
    expect(aIsoLocal(new Date('2026-08-02T02:30:00.000Z'))).toBe('2026-08-01T23:30:00.000-03:00');
    expect(aIsoLocal(new Date('2026-01-01T01:00:00.000Z'))).toBe('2025-12-31T22:00:00.000-03:00');
  });

  /**
   * Es la propiedad de la que depende el `ORDER BY` de los historiales: como el
   * desfase es fijo —Argentina no usa horario de verano—, comparar las cadenas
   * como texto da el mismo resultado que comparar los instantes.
   */
  it('el orden alfabético de las cadenas coincide con el cronológico', () => {
    const instantes = [
      new Date('2026-08-02T01:08:40.583Z'),
      new Date('2026-08-02T01:08:40.584Z'),
      new Date('2026-08-02T02:00:00.000Z'),
      new Date('2026-08-03T00:00:00.000Z'),
      new Date('2027-01-01T00:00:00.000Z'),
    ];
    const cadenas = instantes.map(aIsoLocal);

    expect([...cadenas].sort()).toEqual(cadenas);
  });

  it('no depende de la zona horaria configurada en la máquina', () => {
    // El cálculo parte del instante absoluto, así que el mismo momento produce
    // la misma cadena aunque el equipo esté configurado en otra zona.
    const instante = new Date(Date.UTC(2026, 7, 2, 1, 8, 40, 583));
    expect(aIsoLocal(instante)).toBe('2026-08-01T22:08:40.583-03:00');
  });

  it('el desfase declarado es -3 horas', () => {
    expect(DESFASE_UTC).toBe(-3);
  });
});

describe('ahora', () => {
  it('devuelve el instante actual con el formato y el desfase de la librería', () => {
    const marca = ahora();

    expect(marca).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/);
    // Y representa de verdad este momento: al reinterpretarla vuelve a "ahora".
    expect(Math.abs(new Date(marca).getTime() - Date.now())).toBeLessThan(5000);
  });
});
