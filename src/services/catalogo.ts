import type BetterSqlite3 from 'better-sqlite3';
import { enTransaccion } from '@/db/transaccion';
import { ahora } from '@/domain/fecha';
import { normalizarEditorial, normalizarTitulo } from '@/domain/normalizar-titulo';
import type { EstadoLibro, Resultado } from '@/domain/resultado';
import { validarCamposLibro } from '@/domain/validar-libro';

/**
 * Casos de uso del catálogo (US1: FR-001, FR-002, FR-004, FR-031, FR-037).
 *
 * Son **sincrónicos** y reciben la base como primer parámetro. Sincrónicos
 * porque `enTransaccion` no admite operaciones asincrónicas —romperían la
 * atomicidad entre el dato y su historial—, y con la base explícita para que
 * cada test corra contra la suya. El Server Action es el que envuelve en
 * `async` y le pasa la conexión del proceso.
 */

export interface AltaLibroInput {
  titulo: unknown;
  editorial: unknown;
  stock: unknown;
  precio: unknown;
  foto?: Uint8Array;
}

interface LibroExistente {
  id: number;
  estado: EstadoLibro;
}

function buscarPorTituloNormalizado(
  db: BetterSqlite3.Database,
  tituloNormalizado: string,
): LibroExistente | undefined {
  return db
    .prepare('SELECT id, estado FROM libro WHERE titulo_normalizado = ?')
    .get(tituloNormalizado) as LibroExistente | undefined;
}

export function altaLibro(
  db: BetterSqlite3.Database,
  input: AltaLibroInput,
): Resultado<{ libroId: number }> {
  const validado = validarCamposLibro(input);
  if (!validado.ok) {
    return validado;
  }

  const { titulo, editorial, stock, precio } = validado.valor;
  const tituloNormalizado = normalizarTitulo(titulo);

  // Se comprueba antes de abrir la transacción para poder devolver un error de
  // negocio con el libro en conflicto. El UNIQUE de la base es la red de
  // seguridad, no el mecanismo: sin `libroId` y `estado`, la UI no podría
  // ofrecer reactivar cuando el duplicado es un archivado (FR-035, US6 esc. 6).
  const existente = buscarPorTituloNormalizado(db, tituloNormalizado);
  if (existente !== undefined) {
    return {
      ok: false,
      error: {
        tipo: 'titulo_duplicado',
        libroId: existente.id,
        estado: existente.estado,
        mensaje:
          existente.estado === 'archivado'
            ? `Ya existe un libro archivado con este título: "${titulo}". Se puede reactivar en lugar de crearlo de nuevo.`
            : `Ya existe un libro con este título: "${titulo}".`,
      },
    };
  }

  const fecha = ahora();

  // El libro y sus dos entradas de historial, indivisibles: si falla cualquiera
  // de las tres escrituras no queda nada (Principio III, FR-027, FR-031).
  const libroId = enTransaccion(db, () => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO libro (titulo, titulo_normalizado, editorial, editorial_normalizada,
                            foto, stock, precio, estado, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', ?)`,
      )
      .run(
        titulo,
        tituloNormalizado,
        editorial,
        normalizarEditorial(editorial),
        input.foto === undefined ? null : Buffer.from(input.foto),
        stock,
        precio,
        fecha,
      );

    const id = Number(lastInsertRowid);

    // `anterior: 0` dice que antes del alta no había nada. No es relleno: sin
    // estas dos entradas, el stock y el precio iniciales no tendrían origen.
    db.prepare(
      `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                     cantidad_resultante, origen)
       VALUES (?, ?, 0, ?, 'alta manual')`,
    ).run(id, fecha, stock);

    db.prepare(
      `INSERT INTO movimiento_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
       VALUES (?, ?, 0, ?, 'alta manual')`,
    ).run(id, fecha, precio);

    return id;
  });

  return { ok: true, valor: { libroId } };
}
