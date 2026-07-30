import { describe, expect, it } from 'vitest';
import { normalizarTitulo } from '@/domain/normalizar-titulo';

/**
 * Reglas fijadas en research.md § R3 (FR-003). Esta función es la única
 * normalización de títulos del sistema (restricción de la constitución): de ella
 * dependen la unicidad del catálogo (FR-004), la búsqueda por texto (FR-005) y el
 * matcheo de los dos flujos de Excel. Si divergiera, cada flujo encontraría libros
 * distintos para el mismo título.
 */
describe('normalizarTitulo', () => {
  describe('acentos y diacríticos (paso 1: NFD + eliminación de marcas)', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['Cien años de soledad', 'cien anos de soledad'],
      ['Rayuela', 'rayuela'],
      ['Ficciones — Prólogo', 'ficciones prologo'],
      ['Mañana en la batalla piensa en mí', 'manana en la batalla piensa en mi'],
      ['El Señor de los Anillos', 'senor de los anillos'],
      ['Über den Umgang mit Menschen', 'uber den umgang mit menschen'],
    ];

    it.each(casos)('%s → %s', (entrada, esperado) => {
      expect(normalizarTitulo(entrada)).toBe(esperado);
    });

    it('la ñ colapsa a n, que es lo que hace comparables "año" y "ano" en la búsqueda', () => {
      expect(normalizarTitulo('Año')).toBe(normalizarTitulo('ano'));
    });
  });

  describe('mayúsculas (paso 3)', () => {
    it('el resultado nunca conserva mayúsculas', () => {
      expect(normalizarTitulo('EL PRINCIPITO')).toBe('principito');
      expect(normalizarTitulo('eL pRiNcIpItO')).toBe('principito');
    });

    it('dos escrituras del mismo título con distinta caja normalizan igual', () => {
      expect(normalizarTitulo('MARTIN FIERRO')).toBe(normalizarTitulo('martin fierro'));
    });
  });

  describe('puntuación (paso 4: se elimina todo lo que no sea alfanumérico o espacio)', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['¿Quién mató a Palomino Molero?', 'quien mato a palomino molero'],
      ['¡Absalón, Absalón!', 'absalon absalon'],
      ['Fahrenheit 451: la novela', 'fahrenheit 451 la novela'],
      ['Diccionario de la lengua; tomo II', 'diccionario de lengua tomo ii'],
      ['2001. Odisea del espacio', '2001 odisea del espacio'],
    ];

    it.each(casos)('%s → %s', (entrada, esperado) => {
      expect(normalizarTitulo(entrada)).toBe(esperado);
    });

    it('los dígitos se conservan: son parte del título, no puntuación', () => {
      expect(normalizarTitulo('1984')).toBe('1984');
    });
  });

  describe('comillas y guiones tipográficos (paso 2)', () => {
    it('las comillas curvas no sobreviven a la normalización', () => {
      expect(normalizarTitulo('“El Aleph”')).toBe('aleph');
      expect(normalizarTitulo('‘Ficciones’')).toBe('ficciones');
    });

    it('la comilla curva y la recta dan el mismo resultado', () => {
      expect(normalizarTitulo('L’étranger')).toBe(normalizarTitulo("L'etranger"));
    });

    it('el guion largo rodeado de espacios deja las palabras separadas', () => {
      expect(normalizarTitulo('Ficciones — edición anotada')).toBe('ficciones edicion anotada');
      expect(normalizarTitulo('Ficciones – edición anotada')).toBe('ficciones edicion anotada');
    });

    it('el guion sin espacios une las palabras, porque el paso 4 lo elimina en vez de reemplazarlo', () => {
      expect(normalizarTitulo('Tokio-Montana Express')).toBe('tokiomontana express');
    });
  });

  describe('espacios (paso 5: colapso y recorte)', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['   Rayuela   ', 'rayuela'],
      ['Cien    años    de    soledad', 'cien anos de soledad'],
      ['\tRayuela\n', 'rayuela'],
      ['Cien años de soledad', 'cien anos de soledad'],
    ];

    it.each(casos)('%j → %s', (entrada, esperado) => {
      expect(normalizarTitulo(entrada)).toBe(esperado);
    });

    it('nunca devuelve espacios en los extremos', () => {
      const resultado = normalizarTitulo('  ¡El Principito!  ');
      expect(resultado).toBe(resultado.trim());
    });
  });

  describe('paréntesis: se eliminan los signos pero el contenido queda como palabras (paso 4)', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['El Principito (tapa blanda)', 'principito tapa blanda'],
      ['El Principito (tapa dura)', 'principito tapa dura'],
      ['Rayuela [edición conmemorativa]', 'rayuela edicion conmemorativa'],
      ['Fundación (Ciclo de la Fundación, 1)', 'fundacion ciclo de la fundacion 1'],
    ];

    it.each(casos)('%s → %s', (entrada, esperado) => {
      expect(normalizarTitulo(entrada)).toBe(esperado);
    });

    /**
     * Esta es la razón de ser de la regla, no un detalle: si el contenido del
     * paréntesis se borrara, ambos títulos normalizarían igual y la
     * casi-coincidencia de FR-015 nunca podría dispararse — el sistema aplicaría
     * el precio de una edición a otra sin avisar.
     */
    it('una variante de edición NO normaliza igual que el título base', () => {
      expect(normalizarTitulo('El Principito (tapa blanda)')).not.toBe(
        normalizarTitulo('El Principito'),
      );
    });
  });

  describe('artículo inicial (paso 6, conjunto cerrado del español)', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['El Principito', 'principito'],
      ['La casa de los espíritus', 'casa de los espiritus'],
      ['Los detectives salvajes', 'detectives salvajes'],
      ['Las mil y una noches', 'mil y una noches'],
      ['Lo que el viento se llevó', 'que el viento se llevo'],
      ['Un mundo feliz', 'mundo feliz'],
      ['Una habitación propia', 'habitacion propia'],
      ['Unos cuentos', 'cuentos'],
      ['Unas vacaciones', 'vacaciones'],
    ];

    it.each(casos)('%s → %s', (entrada, esperado) => {
      expect(normalizarTitulo(entrada)).toBe(esperado);
    });

    it('sólo se quita el artículo inicial: los del interior del título se conservan', () => {
      expect(normalizarTitulo('Lo que el viento se llevó')).toContain('el viento');
      expect(normalizarTitulo('Las mil y una noches')).toContain('una noches');
    });

    it('una palabra que empieza como un artículo pero no lo es se conserva entera', () => {
      expect(normalizarTitulo('Ella')).toBe('ella');
      expect(normalizarTitulo('Unamuno y su tiempo')).toBe('unamuno y su tiempo');
      expect(normalizarTitulo('Lolita')).toBe('lolita');
    });

    it('el artículo se quita también si viene con acento o mayúsculas, porque el paso 6 corre después', () => {
      expect(normalizarTitulo('EL PRINCIPITO')).toBe('principito');
    });
  });

  describe('artículo pospuesto, forma "Título, El" (paso 6)', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['Principito, El', 'principito'],
      ['Casa de los espíritus, La', 'casa de los espiritus'],
      ['Detectives salvajes, Los', 'detectives salvajes'],
      ['Mil y una noches, Las', 'mil y una noches'],
      ['Mundo feliz, Un', 'mundo feliz'],
      ['Habitación propia, Una', 'habitacion propia'],
    ];

    it.each(casos)('%s → %s', (entrada, esperado) => {
      expect(normalizarTitulo(entrada)).toBe(esperado);
    });

    /**
     * FR-004 depende de esto: es la misma obra catalogada de las dos formas en
     * que aparece en los archivos de las distribuidoras. Si no colapsaran a la
     * misma clave, un alta masiva crearía el libro duplicado.
     */
    it('las dos formas del mismo título dan la misma clave', () => {
      expect(normalizarTitulo('Principito, El')).toBe(normalizarTitulo('El Principito'));
      expect(normalizarTitulo('Casa de los espíritus, La')).toBe(
        normalizarTitulo('La casa de los espíritus'),
      );
    });
  });

  describe('idempotencia', () => {
    /**
     * R3 elige quitar el artículo en vez de reordenarlo precisamente para que la
     * función sea idempotente. Importa de verdad: `titulo_normalizado` se guarda
     * en la base y se recalcula al editar el título (T053), así que normalizar un
     * valor ya normalizado tiene que devolver lo mismo.
     */
    const entradas = [
      'El Principito',
      'Principito, El',
      'El Principito (tapa blanda)',
      'Cien años de soledad',
      '¿Quién mató a Palomino Molero?',
      'Las mil y una noches',
    ];

    it.each(entradas)('normalizar dos veces %s da el mismo resultado', (entrada) => {
      const unaVez = normalizarTitulo(entrada);
      expect(normalizarTitulo(unaVez)).toBe(unaVez);
    });
  });

  describe('consecuencias documentadas de las reglas', () => {
    /**
     * Riesgo aceptado y documentado en R3: quitar el artículo inicial hace
     * colisionar estos dos títulos. Se testea para que quede claro que es la
     * consecuencia buscada de la regla y no un bug que alguien vaya a "arreglar".
     */
    it('"La Casa" y "Casa" colapsan a la misma clave (riesgo aceptado en R3)', () => {
      expect(normalizarTitulo('La Casa')).toBe(normalizarTitulo('Casa'));
    });

    it('el resultado sólo contiene minúsculas, dígitos y espacios simples', () => {
      const entradas = [
        '¡¿El Principito (tapa dura), El?!',
        'Ficciones — “edición” anotada',
        '   Cien   AÑOS   de   soledad   ',
      ];
      for (const entrada of entradas) {
        expect(normalizarTitulo(entrada)).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/);
      }
    });
  });
});
