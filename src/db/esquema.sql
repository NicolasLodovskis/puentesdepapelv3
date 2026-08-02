-- Esquema de "Puentes de Papel" — data-model.md
--
-- Convenciones:
--   · Importes: INTEGER, entero de unidad de moneda, sin centavos (R5, FR-040).
--   · Marcas temporales: TEXT ISO-8601 con milisegundos en la hora de la
--     librería, UTC-3 con desfase explícito: 2026-08-01T22:08:40.583-03:00 (R6).
--   · Historiales: append-only. No hay DELETE ni UPDATE sobre ellos (FR-028).
--
-- Las restricciones viven en la base y no sólo en el código a propósito: un
-- camino que se olvide de validar tiene que fallar igual (Principio III).

-- ---------------------------------------------------------------------------
-- libro — la unidad del catálogo. Nunca se borra físicamente (FR-028).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libro (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo                TEXT    NOT NULL CHECK (length(trim(titulo)) > 0),
  -- Derivado de `titulo` por normalizarTitulo (R3). UNIQUE sobre TODA la tabla,
  -- sin importar el estado y SIN incluir la editorial: es la restricción de
  -- PRD §8. Al ser índice único, el invariante se sostiene aunque un camino de
  -- código se olvide de comprobarlo (FR-004, FR-033, FR-037).
  titulo_normalizado    TEXT    NOT NULL UNIQUE,
  editorial             TEXT    NOT NULL CHECK (length(trim(editorial)) > 0),
  -- Derivada de `editorial`: minúsculas, sin acentos, espacios colapsados. No
  -- participa de ninguna clave; existe porque LIKE de SQLite ignora mayúsculas
  -- sólo en ASCII, así que sin ella `anagrama` no encontraría `Anagramá`.
  editorial_normalizada TEXT    NOT NULL,
  foto                  BLOB,
  -- 512 floats del embedding CLIP (R1).
  foto_embedding        BLOB,
  stock                 INTEGER NOT NULL CHECK (stock >= 0),
  precio                INTEGER NOT NULL CHECK (precio > 0),
  estado                TEXT    NOT NULL DEFAULT 'activo'
                                CHECK (estado IN ('activo', 'archivado')),
  creado_en             TEXT    NOT NULL,

  -- No puede haber embedding sin su foto: sería un vector que no corresponde a
  -- ninguna imagen guardada y ensuciaría el ranking de la búsqueda por foto.
  -- La recíproca NO se exige: el alta guarda la foto y el embedding se calcula
  -- después (T030 y T089), así que una foto sin embedding es un estado válido.
  CHECK (foto_embedding IS NULL OR foto IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_libro_estado
  ON libro (estado);

CREATE INDEX IF NOT EXISTS idx_libro_editorial_normalizada
  ON libro (editorial_normalizada);

-- ---------------------------------------------------------------------------
-- movimiento_precio — historial de precio. Append-only (FR-022, FR-027).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimiento_precio (
  -- El id desempata el orden cuando dos entradas comparten `fecha`: el alta
  -- escribe las dos suyas en el mismo milisegundo (R6).
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  libro_id         INTEGER NOT NULL REFERENCES libro (id),
  fecha            TEXT    NOT NULL,
  -- 0 cuando el origen es un alta: no había precio anterior (FR-031).
  precio_anterior  INTEGER NOT NULL CHECK (precio_anterior >= 0),
  precio_nuevo     INTEGER NOT NULL CHECK (precio_nuevo > 0),
  -- Exactamente la enumeración de FR-022, como CHECK para que un origen
  -- inventado falle en la base y no sólo en el código.
  origen           TEXT    NOT NULL CHECK (origen IN (
                     'edición manual',
                     'alta manual',
                     'reactivación',
                     'actualización masiva por Excel',
                     'alta por Excel'
                   ))
);

CREATE INDEX IF NOT EXISTS idx_movimiento_precio_libro_fecha
  ON movimiento_precio (libro_id, fecha);

-- ---------------------------------------------------------------------------
-- movimiento_stock — historial de stock. Append-only (FR-023, FR-027).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimiento_stock (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  libro_id            INTEGER NOT NULL REFERENCES libro (id),
  fecha               TEXT    NOT NULL,
  cantidad_anterior   INTEGER NOT NULL CHECK (cantidad_anterior >= 0),
  cantidad_resultante INTEGER NOT NULL CHECK (cantidad_resultante >= 0),
  -- Exactamente la enumeración de FR-023.
  origen              TEXT    NOT NULL CHECK (origen IN (
                        'venta',
                        'edición manual',
                        'alta manual',
                        'reactivación',
                        'alta por Excel'
                      )),
  -- Vincula el movimiento con la venta que lo produjo, para reconciliar los dos
  -- historiales sin adivinar por marca temporal (CHK020).
  venta_id            INTEGER REFERENCES venta (id),

  -- Poblado si y sólo si el origen es una venta: un movimiento de venta sin su
  -- venta, o una venta colgada de un movimiento que no lo es, dejarían el
  -- historial sin poder reconciliarse.
  CHECK ((origen = 'venta') = (venta_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_movimiento_stock_libro_fecha
  ON movimiento_stock (libro_id, fecha);

-- ---------------------------------------------------------------------------
-- venta — una unidad vendida. Append-only (FR-024).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venta (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  libro_id     INTEGER NOT NULL REFERENCES libro (id),
  fecha        TEXT    NOT NULL,
  -- Copia del precio vigente al vender, no una referencia: cambiar el precio
  -- del libro después no debe alterar una venta ya registrada (FR-009).
  precio_venta INTEGER NOT NULL CHECK (precio_venta > 0)
);

CREATE INDEX IF NOT EXISTS idx_venta_libro_fecha
  ON venta (libro_id, fecha);

-- ---------------------------------------------------------------------------
-- reporte_importacion / reporte_fila — reporte persistido del flujo de
-- actualización de precios (FR-036, RF-27). Append-only: no se edita ni se
-- borra. El reporte del alta masiva no se persiste, por decisión de la spec.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reporte_importacion (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha           TEXT    NOT NULL,
  nombre_archivo  TEXT    NOT NULL,
  filas_totales   INTEGER NOT NULL CHECK (filas_totales >= 0),
  filas_aplicadas INTEGER NOT NULL CHECK (filas_aplicadas >= 0),

  CHECK (filas_aplicadas <= filas_totales)
);

CREATE TABLE IF NOT EXISTS reporte_fila (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id  INTEGER NOT NULL REFERENCES reporte_importacion (id),
  -- Fila en el archivo original, para que la librera pueda ubicarla.
  numero_fila INTEGER NOT NULL CHECK (numero_fila > 0),
  -- Tal como venía, sin normalizar: es lo que la librera ve en su archivo.
  titulo_crudo TEXT   NOT NULL,
  -- Las categorías del flujo de precios que NO son 'aplicada' — una fila
  -- aplicada no genera reporte. `duplicada_de_activo` no está porque es
  -- exclusiva del alta masiva, cuyo reporte no se persiste.
  motivo      TEXT    NOT NULL CHECK (motivo IN (
                'sin_cambio',
                'sin_coincidencia',
                'coincide_archivado',
                'casi_coincidencia',
                'duplicada_en_archivo',
                'invalida'
              )),
  -- Campo que falla, o título del libro casi-coincidente.
  detalle     TEXT
);

CREATE INDEX IF NOT EXISTS idx_reporte_fila_reporte
  ON reporte_fila (reporte_id);
