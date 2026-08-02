'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { MotivoNoAplicada } from '@/domain/categorias-fila';
import type { Reporte } from '@/excel/reporte';

/**
 * Subida y reporte del Excel de alta masiva (T042).
 *
 * La pantalla se ordena alrededor del reporte, no de la subida: lo que la
 * librera necesita después de subir 2.000 filas es saber **qué no entró y por
 * qué**, con el número de fila para poder ir a buscarla en su archivo. Por eso
 * el detalle de cada fila omitida ocupa el centro y los totales van arriba como
 * resumen.
 *
 * Nunca se dice "listo" a secas: aunque no falle nada, se informan los tres
 * números, y el que suma tiene que cerrar contra el total (FR-030).
 */

interface ErrorSubida {
  tipo: string;
  mensaje?: string;
  faltantes?: string[];
  repetidas?: string[];
  encontrados?: string[];
}

type Respuesta = { ok: true; reporte: Reporte } | { ok: false; error: ErrorSubida };

const MOTIVOS: Record<MotivoNoAplicada, string> = {
  invalida: 'Datos inválidos',
  duplicada_en_archivo: 'Repetida dentro del archivo',
  duplicada_de_activo: 'Ya está en el catálogo',
  // Los tres siguientes son del flujo de precios: no los emite el alta masiva,
  // pero el tipo los incluye y dejarlos sin texto los mostraría como el nombre
  // interno de la categoría.
  sin_cambio: 'El precio ya era ése',
  sin_coincidencia: 'No coincide con ningún libro',
  coincide_archivado: 'Coincide con un libro archivado',
  casi_coincidencia: 'Se parece a otro título',
};

export function SubidaAltaMasiva() {
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function enviar(formData: FormData) {
    setSubiendo(true);
    setRespuesta(null);
    try {
      const peticion = await fetch('/api/excel/alta-masiva', { method: 'POST', body: formData });
      setRespuesta((await peticion.json()) as Respuesta);
    } catch {
      setRespuesta({
        ok: false,
        error: { tipo: 'sin_respuesta', mensaje: 'No se pudo subir el archivo. Probá de nuevo.' },
      });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <div className="cabecera-pagina">
        <h1>Alta masiva por Excel</h1>
        <Link className="boton-secundario" href="/">
          Volver al catálogo
        </Link>
      </div>

      <form action={enviar} className="formulario">
        <p className="conteo">
          El archivo tiene que traer las columnas <strong>libro</strong>,{' '}
          <strong>editorial</strong>, <strong>stock</strong> y <strong>precio</strong>. Se lee la
          primera hoja y las columnas de más se ignoran.
        </p>

        <label>
          Archivo .xlsx
          <input
            name="archivo"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
          />
        </label>

        <button type="submit" disabled={subiendo}>
          {subiendo ? 'Procesando…' : 'Cargar libros'}
        </button>
      </form>

      {respuesta !== null && !respuesta.ok && <Rechazo error={respuesta.error} />}
      {respuesta !== null && respuesta.ok && <ReporteImportacion reporte={respuesta.reporte} />}
    </>
  );
}

/**
 * El rechazo por encabezados lista **lo que se encontró** además de lo que
 * falta: sin eso, la librera lee "falta la columna precio" mirando un archivo
 * donde hay una columna que ella llama precio (FR-039, AC-37).
 */
function Rechazo({ error }: { error: ErrorSubida }) {
  return (
    <div className="reporte">
      <p className="aviso-rechazo" role="alert">
        {error.mensaje ?? 'No se pudo procesar el archivo.'}
      </p>
      <p className="conteo">No se creó ni se modificó ningún libro.</p>
    </div>
  );
}

function ReporteImportacion({ reporte }: { reporte: Reporte }) {
  return (
    <div className="reporte">
      <h2>{reporte.nombreArchivo}</h2>

      <p className={reporte.noAplicadas.length === 0 ? 'aviso-ok' : 'aviso'} role="status">
        Se cargaron <strong>{reporte.filasAplicadas}</strong> de{' '}
        <strong>{reporte.filasTotales}</strong> filas.{' '}
        {reporte.noAplicadas.length === 0
          ? 'No quedó ninguna fila afuera.'
          : `Quedaron ${reporte.noAplicadas.length} sin cargar.`}
      </p>

      {reporte.noAplicadas.length > 0 && (
        <table className="tabla-libros">
          <thead>
            <tr>
              <th className="numero">Fila</th>
              <th>Libro</th>
              <th>Motivo</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {reporte.noAplicadas.map((fila) => (
              <tr key={fila.numeroFila}>
                <td className="numero">{fila.numeroFila}</td>
                <td>{fila.tituloCrudo === '' ? <em>sin título</em> : fila.tituloCrudo}</td>
                <td>{MOTIVOS[fila.motivo]}</td>
                <td>
                  {fila.campo !== undefined && <strong>{fila.campo}: </strong>}
                  {fila.detalle}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
