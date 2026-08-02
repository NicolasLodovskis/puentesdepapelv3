import type { CategoriaFila } from '@/domain/categorias-fila';
import { normalizarTitulo } from '@/domain/normalizar-titulo';
import type { CampoLibro, EstadoLibro, Resultado } from '@/domain/resultado';
import type { CamposLibro } from '@/domain/validar-libro';
import { validarCamposLibro, validarPrecio, validarTitulo } from '@/domain/validar-libro';
import type { FilaCruda } from './leer';

/**
 * Clasificación de las filas de un Excel (T039, FR-021, FR-021b).
 *
 * Cada fila recibe **una sola** categoría, evaluada en el orden de FR-021b y
 * quedándose con la primera que da positivo. De eso depende el invariante de
 * completitud del reporte: si una fila pudiera contar en dos categorías, los
 * totales dejarían de sumar y no habría forma de afirmar que ninguna fila se
 * descartó en silencio (FR-030, Principio II).
 *
 * Es **pura**: recibe el catálogo como dato y no toca la base. Y es
 * **determinista**: no mira qué pasó al aplicar las filas anteriores, sólo su
 * posición. Por eso la primera ocurrencia de un título ocupa su lugar aunque
 * ella misma no se aplique, y la posterior sale duplicada igual (AC-31): la
 * alternativa —aplicar la segunda porque la primera falló— sería decidir por la
 * librera cuál de sus dos filas era la buena.
 *
 * Los dos flujos comparten los dos primeros escalones —`invalida` y
 * `duplicada_en_archivo`— y se separan en el tercero, que es donde entra el
 * catálogo.
 */

export interface LibroCatalogo {
  id: number;
  tituloNormalizado: string;
  estado: EstadoLibro;
  precio: number;
}

export interface FilaClasificada {
  numeroFila: number;
  /** Tal como venía en el archivo: es lo que la librera ve en su Excel. */
  tituloCrudo: string;
  categoria: CategoriaFila;
  /** El campo que falla, cuando la fila es `invalida`. */
  campo?: CampoLibro;
  /** El mensaje de validación, o el título del libro casi-coincidente. */
  detalle?: string;
  /** Los cuatro campos ya validados. Sólo en alta masiva, y sólo si se aplica. */
  campos?: CamposLibro;
  /** El precio ya validado. Sólo en el flujo de precios. */
  precio?: number;
  /** El libro del catálogo involucrado, cuando la categoría lo tiene. */
  libro?: LibroCatalogo;
}

/** Predicado de variantes de edición (FR-015). Se inyecta: ver abajo. */
export type PredicadoCasiCoincidencia = (normalizadoA: string, normalizadoB: string) => boolean;

export function clasificarAltaMasiva(
  filas: readonly FilaCruda[],
  catalogo: readonly LibroCatalogo[],
): FilaClasificada[] {
  const porTitulo = indexar(catalogo);

  return clasificar(filas, (fila, ocurrencia) => {
    const validado = validarCamposLibro({
      titulo: fila.valores.libro,
      editorial: fila.valores.editorial,
      stock: fila.valores.stock,
      precio: fila.valores.precio,
    });

    if (!validado.ok) {
      return invalida(ocurrencia.base, validado);
    }

    if (ocurrencia.repetida) {
      return { ...ocurrencia.base, categoria: 'duplicada_en_archivo' };
    }

    const normalizado = ocurrencia.tituloNormalizado;

    // En alta masiva la comparación con el catálogo es **sólo exacta**: una
    // variante de edición es un libro distinto y se crea como tal (FR-017,
    // AC-33). Acá la librera carga su propio inventario, donde dos ediciones son
    // dos ejemplares; en el flujo de precios, en cambio, aplicar un precio a la
    // edición equivocada corrompería un dato.
    const libro = porTitulo.get(normalizado);

    if (libro === undefined) {
      return { ...ocurrencia.base, categoria: 'aplicada', campos: validado.valor };
    }

    if (libro.estado === 'activo') {
      return { ...ocurrencia.base, categoria: 'duplicada_de_activo', libro };
    }

    // Coincide con un archivado: se reactiva con los valores de la fila (FR-018).
    return { ...ocurrencia.base, categoria: 'aplicada', campos: validado.valor, libro };
  });
}

export function clasificarPrecios(
  filas: readonly FilaCruda[],
  catalogo: readonly LibroCatalogo[],
  esCasiCoincidencia: PredicadoCasiCoincidencia,
): FilaClasificada[] {
  const porTitulo = indexar(catalogo);

  return clasificar(filas, (fila, ocurrencia) => {
    // Este flujo trae sólo las columnas *libro* y *precio*: no hay editorial ni
    // stock que validar, y exigirlos rechazaría un archivo correcto.
    const precio = validarPrecio(fila.valores.precio);
    if (!precio.ok) {
      return invalida(ocurrencia.base, precio);
    }

    if (ocurrencia.repetida) {
      return { ...ocurrencia.base, categoria: 'duplicada_en_archivo' };
    }

    const normalizado = ocurrencia.tituloNormalizado;

    // La coincidencia exacta se evalúa primero y gana sobre la casi-coincidencia
    // (AC-30): resolver por la variante dejaría sin actualizar un libro que la
    // librera nombró exactamente.
    const exacto = porTitulo.get(normalizado);
    if (exacto !== undefined) {
      if (exacto.estado === 'archivado') {
        // No se toca: va al apartado propio de archivados (FR-014).
        return { ...ocurrencia.base, categoria: 'coincide_archivado', libro: exacto };
      }
      return exacto.precio === precio.valor
        ? { ...ocurrencia.base, categoria: 'sin_cambio', libro: exacto, precio: precio.valor }
        : { ...ocurrencia.base, categoria: 'aplicada', libro: exacto, precio: precio.valor };
    }

    const casi = catalogo.find((libro) => esCasiCoincidencia(normalizado, libro.tituloNormalizado));
    if (casi !== undefined) {
      // La casi-coincidencia de un archivado no se destaca: también va al
      // apartado de archivados (FR-021b, AC-32).
      return casi.estado === 'archivado'
        ? { ...ocurrencia.base, categoria: 'coincide_archivado', libro: casi }
        : {
            ...ocurrencia.base,
            categoria: 'casi_coincidencia',
            libro: casi,
            detalle: casi.tituloNormalizado,
          };
    }

    return { ...ocurrencia.base, categoria: 'sin_coincidencia' };
  });
}

/** Lo que los dos flujos ya tienen resuelto cuando les toca clasificar. */
interface Ocurrencia {
  base: { numeroFila: number; tituloCrudo: string };
  tituloNormalizado: string;
  /** Si el título ya había aparecido en una fila anterior del archivo. */
  repetida: boolean;
}

/**
 * El esqueleto compartido: valida el título, registra la ocurrencia y delega el
 * resto en el flujo.
 *
 * El orden importa y es el de data-model.md: **se valida el título antes de
 * deduplicar**, porque una fila sin título no tiene clave con la cual
 * deduplicarse; pero la ocurrencia se registra **antes** de validar el resto de
 * los campos, así que una fila con título legible ocupa el lugar de primera
 * ocurrencia aunque sea inválida en otro campo. Eso es lo que hace que, si la
 * primera es inválida, la posterior salga duplicada y ninguna se aplique
 * (AC-31).
 */
function clasificar(
  filas: readonly FilaCruda[],
  resolver: (fila: FilaCruda, ocurrencia: Ocurrencia) => FilaClasificada,
): FilaClasificada[] {
  const vistos = new Set<string>();

  // Una clasificación por fila y en el mismo orden: si acá se perdiera una fila,
  // se perdería antes de llegar al reporte y nadie se enteraría (FR-030).
  return filas.map((fila) => {
    const base = {
      numeroFila: fila.numeroFila,
      tituloCrudo: textoCrudo(fila.valores.libro),
    };

    const titulo = validarTitulo(fila.valores.libro);
    if (!titulo.ok) {
      return invalida(base, titulo);
    }

    const tituloNormalizado = normalizarTitulo(titulo.valor);
    const repetida = vistos.has(tituloNormalizado);
    vistos.add(tituloNormalizado);

    return resolver(fila, { base, tituloNormalizado, repetida });
  });
}

/**
 * `invalida` es el primer escalón de la precedencia y gana sobre todo lo demás
 * (AC-30): reportar como duplicada una fila a la que le falta un campo
 * escondería el dato que la librera tiene que arreglar en su archivo.
 *
 * Nótese que una fila sin título **no** se registra como ocurrencia: sin clave
 * no hay título que repetir, y tratar la siguiente como duplicada implicaría que
 * "sin título" es un título.
 */
function invalida(
  base: { numeroFila: number; tituloCrudo: string },
  resultado: Resultado<unknown>,
): FilaClasificada {
  if (resultado.ok || resultado.error.tipo !== 'validacion') {
    throw new TypeError('se esperaba un error de validación');
  }

  return {
    ...base,
    categoria: 'invalida',
    campo: resultado.error.campo,
    detalle: resultado.error.mensaje,
  };
}

function indexar(catalogo: readonly LibroCatalogo[]): Map<string, LibroCatalogo> {
  return new Map(catalogo.map((libro) => [libro.tituloNormalizado, libro]));
}

function textoCrudo(valor: unknown): string {
  if (typeof valor === 'string') {
    return valor.trim();
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return String(valor);
  }
  return '';
}
