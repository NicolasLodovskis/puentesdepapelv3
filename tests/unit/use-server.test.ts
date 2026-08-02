import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Un archivo `'use server'` sólo puede exportar **funciones asincrónicas**.
 *
 * Este test existe por un bug real: se exportó una constante de estado inicial
 * desde el módulo de acciones y el alta dejó de funcionar. Lo peligroso es lo
 * tarde que se manifiesta — `tsc`, `eslint`, `next build` y el render de la
 * página pasan todos en verde; el error aparece recién cuando alguien envía el
 * formulario. Sin esta comprobación, la única forma de detectarlo es que la
 * librera se encuentre con la pantalla rota.
 */

const DIRECTORIO_ACCIONES = join(process.cwd(), 'src', 'app', 'actions');

/** `export` seguidos de algo que no sea una función async. */
const EXPORTACION_PROHIBIDA =
  /^export\s+(?!async\s+function\b)(?!type\b)(?!interface\b)(?!default\s+async\s+function\b).*/gm;

function archivosDeAcciones(): string[] {
  return readdirSync(DIRECTORIO_ACCIONES)
    .filter((nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'))
    .map((nombre) => join(DIRECTORIO_ACCIONES, nombre));
}

describe("módulos 'use server'", () => {
  it('hay al menos un módulo de acciones que revisar', () => {
    expect(archivosDeAcciones().length).toBeGreaterThan(0);
  });

  it('exportan únicamente funciones asincrónicas', () => {
    const infracciones: string[] = [];

    for (const ruta of archivosDeAcciones()) {
      const contenido = readFileSync(ruta, 'utf8');
      if (!/^\s*['"]use server['"]/.test(contenido)) continue;

      for (const linea of contenido.match(EXPORTACION_PROHIBIDA) ?? []) {
        infracciones.push(`${ruta}: ${linea.trim()}`);
      }
    }

    expect(infracciones).toEqual([]);
  });

  /**
   * Los tipos y los estados iniciales que las acciones y los componentes
   * comparten viven en un módulo aparte, justamente porque no pueden exportarse
   * desde uno de acciones.
   */
  it('el módulo de estados no lleva la directiva, para poder exportar constantes', () => {
    const estados = readFileSync(join(DIRECTORIO_ACCIONES, 'estados.ts'), 'utf8');

    expect(/^\s*['"]use server['"]/.test(estados)).toBe(false);
    expect(estados).toContain('ESTADO_ALTA_INICIAL');
    expect(estados).toContain('ESTADO_BUSQUEDA_INICIAL');
  });
});
