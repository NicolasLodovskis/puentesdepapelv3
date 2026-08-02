import { obtenerBase } from '@/db/conexion';
import { importarAltaMasiva } from '@/services/importacion-alta';

/**
 * `POST /api/excel/alta-masiva` (T041, RF-18).
 *
 * Es un Route Handler y no una Server Action porque recibe
 * `multipart/form-data` con el archivo (contracts/server-actions.md).
 *
 * Es un endpoint **separado** del de actualización de precios y no son
 * intercambiables (FR-016): el mismo archivo subido al endpoint equivocado haría
 * cosas distintas con los datos, así que la separación es de contrato, no de
 * comodidad.
 *
 * El handler no tiene lógica: traduce la petición a la entrada del servicio y su
 * respuesta a JSON. Los estados HTTP siguen esa misma división — 200 cuando hubo
 * procesamiento (aunque ninguna fila se haya aplicado: el reporte es el
 * resultado), 400 cuando el archivo ni siquiera se pudo procesar.
 */

// better-sqlite3 y exceljs son módulos nativos de Node: no corren en el runtime
// edge.
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const archivo = formData.get('archivo');

  if (!(archivo instanceof File) || archivo.size === 0) {
    return Response.json(
      {
        ok: false,
        error: { tipo: 'archivo_ausente', mensaje: 'Hay que elegir un archivo .xlsx.' },
      },
      { status: 400 },
    );
  }

  const contenido = Buffer.from(await archivo.arrayBuffer());

  let respuesta;
  try {
    respuesta = await importarAltaMasiva(obtenerBase(), {
      nombre: archivo.name,
      origen: contenido,
    });
  } catch {
    // Un archivo que no es un `.xlsx` —o que está dañado— hace fallar al lector.
    // Se informa como lo que es y no como un error del servidor: el archivo es
    // lo que hay que cambiar.
    return Response.json(
      {
        ok: false,
        error: {
          tipo: 'archivo_ilegible',
          mensaje: `No se pudo leer «${archivo.name}». ¿Es un archivo .xlsx?`,
        },
      },
      { status: 400 },
    );
  }

  return Response.json(respuesta, { status: respuesta.ok ? 200 : 400 });
}
