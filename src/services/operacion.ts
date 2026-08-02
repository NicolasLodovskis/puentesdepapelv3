import type BetterSqlite3 from 'better-sqlite3';
import { enTransaccion } from '@/db/transaccion';
import { ahora } from '@/domain/fecha';
import type { EstadoLibro, Resultado } from '@/domain/resultado';

/**
 * Operaciones sobre el stock y el precio de un libro (US3: FR-009, FR-010,
 * FR-023, FR-024).
 *
 * Igual que el resto de los casos de uso: **sincrónicos** y con la base como
 * primer parámetro, porque `enTransaccion` no admite operaciones asincrónicas
 * —romperían la atomicidad entre el dato y su historial— y porque cada test
 * corre contra la suya.
 */

interface LibroVendible {
  id: number;
  titulo: string;
  stock: number;
  precio: number;
  estado: EstadoLibro;
}

/**
 * Vende una unidad: descuenta el stock, registra la venta y escribe el
 * movimiento que la explica.
 *
 * Las tres escrituras van en una sola transacción, y **la lectura del libro
 * también**. No es exceso de celo: leer el stock afuera y descontarlo adentro
 * deja una ventana en la que el valor leído ya no es el vigente, y el descuento
 * se calcularía sobre un número viejo. Adentro, o se cumplen las tres cosas o no
 * se cumple ninguna.
 *
 * Un rechazo devuelve `Resultado` desde dentro de la transacción sin haber
 * escrito nada: la transacción confirma vacía, que es exactamente lo que tiene
 * que pasar cuando la respuesta es que no.
 */
export interface VentaRegistrada {
  ventaId: number;
  /**
   * El título, el precio cobrado y el stock que queda son datos que la venta ya
   * tuvo en la mano. Devolverlos evita que la pantalla consulte la base por su
   * cuenta para poder decir qué pasó — y las acciones no tocan SQL (plan.md).
   */
  titulo: string;
  precioVenta: number;
  stockResultante: number;
}

export function venderUnidad(
  db: BetterSqlite3.Database,
  input: { libroId: number },
): Resultado<VentaRegistrada> {
  return enTransaccion(db, () => {
    const libro = db
      .prepare('SELECT id, titulo, stock, precio, estado FROM libro WHERE id = ?')
      .get(input.libroId) as LibroVendible | undefined;

    if (libro === undefined) {
      return {
        ok: false as const,
        error: { tipo: 'no_encontrado' as const, mensaje: 'El libro no existe.' },
      };
    }

    // Vender descuenta stock, y sobre un libro archivado el stock no se modifica
    // (FR-038, AC-34). Tener ejemplares no lo habilita: primero hay que
    // reactivarlo.
    if (libro.estado === 'archivado') {
      return {
        ok: false as const,
        error: {
          tipo: 'estado_invalido' as const,
          mensaje: `«${libro.titulo}» está archivado: para venderlo hay que reactivarlo primero.`,
        },
      };
    }

    if (libro.stock === 0) {
      return {
        ok: false as const,
        error: {
          tipo: 'sin_stock' as const,
          mensaje: `No quedan ejemplares de «${libro.titulo}».`,
        },
      };
    }

    const fecha = ahora();

    // El precio se **copia** a la venta, no se referencia: cambiar el precio del
    // libro mañana no puede reescribir lo que se cobró hoy (FR-009).
    const { lastInsertRowid } = db
      .prepare('INSERT INTO venta (libro_id, fecha, precio_venta) VALUES (?, ?, ?)')
      .run(libro.id, fecha, libro.precio);

    const ventaId = Number(lastInsertRowid);

    db.prepare('UPDATE libro SET stock = stock - 1 WHERE id = ?').run(libro.id);

    // `venta_id` vincula el movimiento con la venta que lo produjo, para poder
    // reconciliar los dos historiales sin adivinar por marca temporal (CHK020).
    db.prepare(
      `INSERT INTO movimiento_stock (libro_id, fecha, cantidad_anterior,
                                     cantidad_resultante, origen, venta_id)
       VALUES (?, ?, ?, ?, 'venta', ?)`,
    ).run(libro.id, fecha, libro.stock, libro.stock - 1, ventaId);

    return {
      ok: true as const,
      valor: {
        ventaId,
        titulo: libro.titulo,
        precioVenta: libro.precio,
        stockResultante: libro.stock - 1,
      },
    };
  });
}
