import type BetterSqlite3 from 'better-sqlite3';

/**
 * Envoltura transaccional de toda escritura que toca stock o precio (T020).
 *
 * El Principio III y FR-027 exigen que el dato y su entrada de historial se
 * escriban juntos: si falla el historial, falla el cambio. `db.transaction()` de
 * better-sqlite3 ya da esa atomicidad; lo que agrega esta función es cerrar el
 * único agujero por el que se puede perder sin que nadie lo note.
 */

/**
 * Ejecuta `operacion` dentro de una transacción y devuelve su resultado. Si
 * lanza, revierte todo y propaga el error original.
 *
 * Anida sin problema: better-sqlite3 usa `SAVEPOINT` para las transacciones
 * internas, así que un fallo del bloque externo revierte también lo que hizo el
 * interno, aunque ese haya "terminado bien".
 *
 * **La operación debe ser sincrónica.** Es la razón principal de que esta
 * función exista: `db.transaction()` corre y cierra de forma sincrónica, así que
 * una operación `async` haría COMMIT antes de que su trabajo termine y las
 * escrituras siguientes caerían fuera de la transacción. El invariante se
 * rompería en silencio y los datos quedarían a medias sin ningún error a la
 * vista. Se detecta y se rechaza, en vez de confiar en que nadie escriba un
 * `async` acá dentro.
 */
export function enTransaccion<T>(db: BetterSqlite3.Database, operacion: () => T): T {
  return db.transaction(() => {
    const resultado = operacion();

    if (esPromesa(resultado)) {
      // Lanzar acá revierte la transacción: nada de lo que la operación haya
      // escrito antes de devolver la promesa queda aplicado.
      throw new TypeError(
        'enTransaccion requiere una operación sincrónica: una operación asincrónica haría ' +
          'COMMIT antes de terminar y rompería la atomicidad entre el dato y su historial.',
      );
    }

    return resultado;
  })();
}

function esPromesa(valor: unknown): boolean {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'then' in valor &&
    typeof (valor as { then: unknown }).then === 'function'
  );
}
