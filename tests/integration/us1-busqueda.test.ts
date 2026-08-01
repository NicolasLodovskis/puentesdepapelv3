import { describe, expect, it } from 'vitest';
import { altaLibro } from '@/services/catalogo';
import { buscarLibros } from '@/services/busqueda';
import { baseTemporal } from '../helpers/db-temporal';

/**
 * US1 — búsqueda por nombre y por editorial (FR-005).
 *
 * Es la consulta que reemplaza el trabajo manual de la librera, así que tiene
 * que encontrar el libro aunque ella escriba sin acentos, en minúsculas o sólo
 * un pedazo del título. Y tiene que **excluir los archivados**: un libro que
 * salió del catálogo no puede aparecer como disponible con un precio.
 */

type Base = ReturnType<typeof baseTemporal>;

function sembrar(db: Base): void {
  const libros = [
    { titulo: 'El Principito', editorial: 'Salamandra', stock: 3, precio: 15000 },
    { titulo: 'Cien años de soledad', editorial: 'Sudamericana', stock: 2, precio: 22000 },
    { titulo: 'Rayuela', editorial: 'Anagramá', stock: 1, precio: 18000 },
    { titulo: 'Los detectives salvajes', editorial: 'ANAGRAMA', stock: 4, precio: 25000 },
    { titulo: 'Ficciones', editorial: 'Emecé', stock: 0, precio: 12000 },
  ];
  for (const libro of libros) {
    const resultado = altaLibro(db, libro);
    if (!resultado.ok) throw new Error(`no se pudo sembrar ${libro.titulo}`);
  }
}

function titulos(resultados: ReadonlyArray<{ titulo: string }>): string[] {
  return resultados.map((r) => r.titulo).sort();
}

describe('buscarLibros', () => {
  describe('por título', () => {
    it('encuentra por el título completo y devuelve su precio', () => {
      const db = baseTemporal();
      sembrar(db);

      const resultados = buscarLibros(db, { texto: 'El Principito', campo: 'titulo' });

      expect(resultados).toHaveLength(1);
      expect(resultados[0]).toMatchObject({
        titulo: 'El Principito',
        editorial: 'Salamandra',
        stock: 3,
        precio: 15000,
        tieneFoto: false,
      });
    });

    it('encuentra por subcadena, que es como se busca cuando no se recuerda el título exacto', () => {
      const db = baseTemporal();
      sembrar(db);

      expect(titulos(buscarLibros(db, { texto: 'principit', campo: 'titulo' }))).toEqual([
        'El Principito',
      ]);
      expect(titulos(buscarLibros(db, { texto: 'soledad', campo: 'titulo' }))).toEqual([
        'Cien años de soledad',
      ]);
    });

    it('ignora acentos, mayúsculas y el artículo inicial', () => {
      const db = baseTemporal();
      sembrar(db);

      for (const texto of ['CIEN ANOS', 'cien años', 'Cien Años', 'cien anos de soledad']) {
        expect(titulos(buscarLibros(db, { texto, campo: 'titulo' }))).toEqual([
          'Cien años de soledad',
        ]);
      }
    });

    it('encuentra un título buscado con su artículo o sin él', () => {
      const db = baseTemporal();
      sembrar(db);

      expect(titulos(buscarLibros(db, { texto: 'El Principito', campo: 'titulo' }))).toEqual([
        'El Principito',
      ]);
      expect(titulos(buscarLibros(db, { texto: 'Principito', campo: 'titulo' }))).toEqual([
        'El Principito',
      ]);
    });

    it('devuelve lista vacía cuando no hay coincidencias, nunca un libro arbitrario', () => {
      const db = baseTemporal();
      sembrar(db);

      expect(buscarLibros(db, { texto: 'Moby Dick', campo: 'titulo' })).toEqual([]);
    });
  });

  describe('por editorial', () => {
    /**
     * `LIKE` de SQLite ignora mayúsculas **sólo en ASCII**, así que sin la
     * columna `editorial_normalizada` buscar `anagrama` no encontraría
     * `Anagramá`. Este test es el que justifica que esa columna exista.
     */
    it('es insensible a mayúsculas y a acentos', () => {
      const db = baseTemporal();
      sembrar(db);

      const resultados = buscarLibros(db, { texto: 'anagrama', campo: 'editorial' });

      expect(titulos(resultados)).toEqual(['Los detectives salvajes', 'Rayuela']);
    });

    it('encuentra por subcadena de la editorial', () => {
      const db = baseTemporal();
      sembrar(db);

      expect(titulos(buscarLibros(db, { texto: 'sudamer', campo: 'editorial' }))).toEqual([
        'Cien años de soledad',
      ]);
    });

    it('no confunde el campo: buscar una editorial por título no devuelve nada', () => {
      const db = baseTemporal();
      sembrar(db);

      expect(buscarLibros(db, { texto: 'Salamandra', campo: 'titulo' })).toEqual([]);
    });
  });

  describe('en ambos campos', () => {
    it('devuelve las coincidencias de título y de editorial, sin repetir', () => {
      const db = baseTemporal();
      sembrar(db);

      const resultados = buscarLibros(db, { texto: 'anagrama', campo: 'ambos' });

      expect(titulos(resultados)).toEqual(['Los detectives salvajes', 'Rayuela']);
    });

    it('un libro que coincide por los dos campos aparece una sola vez', () => {
      const db = baseTemporal();
      const alta = altaLibro(db, {
        titulo: 'Anagrama de un crimen',
        editorial: 'Anagrama',
        stock: 1,
        precio: 10000,
      });
      expect(alta.ok).toBe(true);

      const resultados = buscarLibros(db, { texto: 'anagrama', campo: 'ambos' });

      expect(resultados).toHaveLength(1);
    });
  });

  describe('los archivados quedan fuera (FR-005)', () => {
    it('no devuelve un libro archivado aunque su título coincida', () => {
      const db = baseTemporal();
      sembrar(db);
      db.prepare(
        "UPDATE libro SET estado = 'archivado' WHERE titulo_normalizado = 'principito'",
      ).run();

      expect(buscarLibros(db, { texto: 'principito', campo: 'titulo' })).toEqual([]);
    });

    it('tampoco lo devuelve buscando por su editorial', () => {
      const db = baseTemporal();
      sembrar(db);
      db.prepare(
        "UPDATE libro SET estado = 'archivado' WHERE titulo_normalizado = 'rayuela'",
      ).run();

      expect(titulos(buscarLibros(db, { texto: 'anagrama', campo: 'editorial' }))).toEqual([
        'Los detectives salvajes',
      ]);
    });
  });

  describe('bordes', () => {
    it('un libro con stock 0 sigue siendo encontrable: existe en el catálogo', () => {
      const db = baseTemporal();
      sembrar(db);

      const resultados = buscarLibros(db, { texto: 'ficciones', campo: 'titulo' });

      expect(resultados).toHaveLength(1);
      expect(resultados[0]).toMatchObject({ stock: 0, precio: 12000 });
    });

    it('informa si el libro tiene foto, sin devolver la foto entera en el listado', () => {
      const db = baseTemporal();
      const alta = altaLibro(db, {
        titulo: 'Con foto',
        editorial: 'Editorial',
        stock: 1,
        precio: 5000,
        foto: new Uint8Array([1, 2, 3]),
      });
      expect(alta.ok).toBe(true);

      const resultados = buscarLibros(db, { texto: 'con foto', campo: 'titulo' });

      expect(resultados[0]?.tieneFoto).toBe(true);
      expect(resultados[0]).not.toHaveProperty('foto');
    });

    it('una búsqueda vacía no devuelve el catálogo entero por accidente', () => {
      const db = baseTemporal();
      sembrar(db);

      expect(buscarLibros(db, { texto: '   ', campo: 'ambos' })).toEqual([]);
    });
  });
});
