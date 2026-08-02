import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Las Server Actions, ejercitadas de verdad (T028, T029).
 *
 * Existen porque los tests de servicios no las cubrían: se puede tener
 * `altaLibro` impecable y el formulario roto igual, que es exactamente lo que
 * pasó — la acción fallaba al invocarse y ni el build ni el render lo detectaban.
 * Acá se llama a la acción con un `FormData` real, que es lo que le llega desde
 * el navegador.
 */

// `revalidatePath` sólo funciona dentro del ciclo de pedido de Next; acá
// interesa el camino de datos, no la invalidación de caché.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const DIRECTORIO = mkdtempSync(join(tmpdir(), 'puentes-acciones-'));
process.env.RUTA_BASE = join(DIRECTORIO, 'acciones.db');

type Acciones = {
  altaLibroAction: typeof import('@/app/actions/catalogo').altaLibroAction;
  buscarLibrosAction: typeof import('@/app/actions/busqueda').buscarLibrosAction;
  ESTADO_ALTA_INICIAL: typeof import('@/app/actions/estados').ESTADO_ALTA_INICIAL;
  ESTADO_BUSQUEDA_INICIAL: typeof import('@/app/actions/estados').ESTADO_BUSQUEDA_INICIAL;
};

let acciones: Acciones;

beforeAll(async () => {
  const [catalogo, busqueda, estados] = await Promise.all([
    import('@/app/actions/catalogo'),
    import('@/app/actions/busqueda'),
    import('@/app/actions/estados'),
  ]);
  acciones = {
    altaLibroAction: catalogo.altaLibroAction,
    buscarLibrosAction: busqueda.buscarLibrosAction,
    ESTADO_ALTA_INICIAL: estados.ESTADO_ALTA_INICIAL,
    ESTADO_BUSQUEDA_INICIAL: estados.ESTADO_BUSQUEDA_INICIAL,
  };
});

afterAll(async () => {
  const { cerrarBase } = await import('@/db/conexion');
  cerrarBase();
  rmSync(DIRECTORIO, { recursive: true, force: true });
});

function formulario(campos: Record<string, string | File>): FormData {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor);
  return datos;
}

describe('altaLibroAction', () => {
  it('da de alta desde un FormData y crea la base si no existía', async () => {
    const resultado = await acciones.altaLibroAction(
      acciones.ESTADO_ALTA_INICIAL,
      formulario({
        titulo: 'El Principito',
        editorial: 'Salamandra',
        // Del formulario los números llegan como texto: es el caso real.
        stock: '3',
        precio: '15000',
      }),
    );

    expect(resultado.estado).toBe('ok');
    if (resultado.estado !== 'ok') return;
    expect(resultado.titulo).toBe('El Principito');
    expect(resultado.libroId).toBeGreaterThan(0);
  });

  it('devuelve el error junto al campo que falla, para que el formulario lo muestre ahí', async () => {
    const resultado = await acciones.altaLibroAction(
      acciones.ESTADO_ALTA_INICIAL,
      formulario({ titulo: 'Rayuela', editorial: 'Sudamericana', stock: '2', precio: '18000,50' }),
    );

    expect(resultado.estado).toBe('error');
    if (resultado.estado !== 'error') return;
    expect(resultado.campo).toBe('precio');
    expect(resultado.mensaje).toContain('decimales');
  });

  it('informa el duplicado con su estado, para poder ofrecer la reactivación', async () => {
    const resultado = await acciones.altaLibroAction(
      acciones.ESTADO_ALTA_INICIAL,
      formulario({ titulo: 'Principito, El', editorial: 'Otra', stock: '1', precio: '9000' }),
    );

    expect(resultado.estado).toBe('error');
    if (resultado.estado !== 'error') return;
    expect(resultado.duplicado?.estadoLibro).toBe('activo');
    expect(resultado.duplicado?.libroId).toBeGreaterThan(0);
  });

  it('acepta el formulario sin foto: el campo vacío no es una foto de cero bytes', async () => {
    const resultado = await acciones.altaLibroAction(
      acciones.ESTADO_ALTA_INICIAL,
      formulario({
        titulo: 'Ficciones',
        editorial: 'Emecé',
        stock: '1',
        precio: '12000',
        // Un input file sin elegir archivo llega así desde el navegador.
        foto: new File([], '', { type: 'application/octet-stream' }),
      }),
    );

    expect(resultado.estado).toBe('ok');
  });

  it('guarda la foto cuando viene con contenido', async () => {
    const resultado = await acciones.altaLibroAction(
      acciones.ESTADO_ALTA_INICIAL,
      formulario({
        titulo: 'Con foto',
        editorial: 'Editorial',
        stock: '1',
        precio: '5000',
        foto: new File([new Uint8Array([137, 80, 78, 71])], 'tapa.png', { type: 'image/png' }),
      }),
    );

    expect(resultado.estado).toBe('ok');

    const busqueda = await acciones.buscarLibrosAction(
      acciones.ESTADO_BUSQUEDA_INICIAL,
      formulario({ texto: 'con foto', campo: 'titulo' }),
    );
    expect(busqueda.estado).toBe('resultados');
    if (busqueda.estado !== 'resultados') return;
    expect(busqueda.libros[0]?.tieneFoto).toBe(true);
  });
});

describe('buscarLibrosAction', () => {
  it('encuentra lo que el alta acaba de guardar, sin acentos ni artículo', async () => {
    const resultado = await acciones.buscarLibrosAction(
      acciones.ESTADO_BUSQUEDA_INICIAL,
      formulario({ texto: 'principito', campo: 'ambos' }),
    );

    expect(resultado.estado).toBe('resultados');
    if (resultado.estado !== 'resultados') return;
    expect(resultado.libros).toHaveLength(1);
    expect(resultado.libros[0]).toMatchObject({ titulo: 'El Principito', precio: 15000 });
  });

  it('devuelve lista vacía sin coincidencias, conservando el texto buscado para poder mostrarlo', async () => {
    const resultado = await acciones.buscarLibrosAction(
      acciones.ESTADO_BUSQUEDA_INICIAL,
      formulario({ texto: 'moby dick', campo: 'ambos' }),
    );

    expect(resultado).toMatchObject({ estado: 'resultados', texto: 'moby dick', libros: [] });
  });

  it('cae en "ambos" si el campo llega con un valor que no existe', async () => {
    const resultado = await acciones.buscarLibrosAction(
      acciones.ESTADO_BUSQUEDA_INICIAL,
      formulario({ texto: 'principito', campo: 'inventado' }),
    );

    expect(resultado.estado).toBe('resultados');
    if (resultado.estado !== 'resultados') return;
    expect(resultado.campo).toBe('ambos');
  });
});
