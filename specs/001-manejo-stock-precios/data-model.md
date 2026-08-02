# Phase 1 — Data Model: Manejo de Stock y Precios

**Feature**: `001-manejo-stock-precios` | **Fecha**: 2026-07-29
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Motor: SQLite, archivo único, vía `better-sqlite3`. `PRAGMA journal_mode = WAL`,
`PRAGMA foreign_keys = ON`.

Convenciones que salen de la investigación: los importes son **enteros de unidad de moneda**, sin
centavos (R5, PRD RF-01/RF-31), las
marcas temporales son **`TEXT` ISO-8601 con milisegundos en la hora de la librería, UTC-3 con
desfase explícito** (R6), y los historiales son
**append-only** (Principio III, FR-028).

---

## Entidades

### `libro`

La unidad del catálogo. Nunca se borra físicamente.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `INTEGER PK AUTOINCREMENT` | |
| `titulo` | `TEXT NOT NULL` | No vacío tras recortar (FR-002) |
| `titulo_normalizado` | `TEXT NOT NULL` | Derivado de `titulo` por `normalizarTitulo` (R3). **`UNIQUE`** |
| `editorial` | `TEXT NOT NULL` | No vacía tras recortar (FR-002) |
| `editorial_normalizada` | `TEXT NOT NULL` | Derivada de `editorial`: minúsculas, sin acentos, espacios colapsados. **No** participa de ninguna clave |
| `foto` | `BLOB NULL` | Opcional (FR-001) |
| `foto_embedding` | `BLOB NULL` | 512 floats del embedding CLIP (R1). Presente si y sólo si hay `foto` |
| `stock` | `INTEGER NOT NULL` | `>= 0`, entero (FR-002) |
| `precio` | `INTEGER NOT NULL` | `> 0` y entero, sin decimales (FR-002, FR-040) |
| `estado` | `TEXT NOT NULL` | `'activo'` \| `'archivado'`. Default `'activo'` |
| `creado_en` | `TEXT NOT NULL` | ISO-8601 con desfase `-03:00` |

**Unicidad — la decisión más consecuente del modelo**: `UNIQUE(titulo_normalizado)` sobre **toda**
la tabla, sin importar `estado` y **sin incluir `editorial`**. Es la restricción de PRD §8: no
pueden coexistir dos libros con el mismo título de editoriales distintas. Al ser un índice único a
nivel de base, el invariante se sostiene incluso si un camino de código se olvida de validarlo
(FR-004, FR-033, FR-037).

**Transiciones de estado**:

```
                 archivar (FR-011)
    ┌─────────┐ ──────────────────► ┌────────────┐
    │ activo  │                     │ archivado  │
    └─────────┘ ◄────────────────── └────────────┘
        ▲        reactivar (FR-035 manual · FR-018 alta masiva)
        │
     alta (FR-001 manual · FR-017 alta masiva)
```

Un libro `archivado` sale de las consultas (FR-005, FR-006) pero conserva todo su historial
(FR-011). Toda reactivación fija `stock` y `precio` y **siempre** escribe sus dos
entradas de historial, incluso con valores idénticos (FR-027b, excepción única).

---

### `movimiento_precio`

Historial de precio. Append-only.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `INTEGER PK AUTOINCREMENT` | Desempata el orden ante igual `fecha` (R6) |
| `libro_id` | `INTEGER NOT NULL` | `FK → libro(id)` |
| `fecha` | `TEXT NOT NULL` | ISO-8601 con desfase `-03:00` |
| `precio_anterior` | `INTEGER NOT NULL` | `0` cuando el origen es un alta (FR-031) |
| `precio_nuevo` | `INTEGER NOT NULL` | `> 0` |
| `origen` | `TEXT NOT NULL` | Ver enumeración abajo |

**`origen` ∈** `'edición manual'` · `'alta manual'` · `'reactivación'` ·
`'actualización masiva por Excel'` · `'alta por Excel'` — exactamente FR-022. Se aplica como
`CHECK` para que un origen inventado falle en la base, no sólo en el código.

---

### `movimiento_stock`

Historial de stock. Append-only.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `INTEGER PK AUTOINCREMENT` | Desempate de orden (R6) |
| `libro_id` | `INTEGER NOT NULL` | `FK → libro(id)` |
| `fecha` | `TEXT NOT NULL` | ISO-8601 con desfase `-03:00` |
| `cantidad_anterior` | `INTEGER NOT NULL` | `>= 0`; `0` cuando el origen es un alta (FR-031) |
| `cantidad_resultante` | `INTEGER NOT NULL` | `>= 0` |
| `origen` | `TEXT NOT NULL` | Ver enumeración abajo |
| `venta_id` | `INTEGER NULL` | `FK → venta(id)`. Poblado si y sólo si `origen = 'venta'` |

**`origen` ∈** `'venta'` · `'edición manual'` · `'alta manual'` · `'reactivación'` ·
`'alta por Excel'` — exactamente FR-023, aplicado con `CHECK`.

`venta_id` es la vinculación que pedía CHK020: permite reconciliar el historial de stock con el de
ventas sin adivinar por marca temporal.

---

### `venta`

Una unidad vendida. Append-only.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `INTEGER PK AUTOINCREMENT` | |
| `libro_id` | `INTEGER NOT NULL` | `FK → libro(id)` |
| `fecha` | `TEXT NOT NULL` | ISO-8601 con desfase `-03:00` |
| `precio_venta` | `INTEGER NOT NULL` | Copia del `precio` vigente al vender (FR-009) |

El precio se **copia**, no se referencia: cambiar el precio del libro después no debe alterar una
venta ya registrada.

---

### `reporte_importacion` y `reporte_fila`

Reporte persistido del flujo de **actualización de precios** (FR-036, RF-27). Append-only: no se
edita ni se borra. El reporte del flujo de alta masiva **no** se persiste (decisión registrada en
los supuestos de la spec).

`reporte_importacion`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `INTEGER PK AUTOINCREMENT` | |
| `fecha` | `TEXT NOT NULL` | ISO-8601 con desfase `-03:00` |
| `nombre_archivo` | `TEXT NOT NULL` | |
| `filas_totales` | `INTEGER NOT NULL` | |
| `filas_aplicadas` | `INTEGER NOT NULL` | |

`reporte_fila` — una por cada fila **no aplicada**, con su motivo

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `INTEGER PK AUTOINCREMENT` | |
| `reporte_id` | `INTEGER NOT NULL` | `FK → reporte_importacion(id)` |
| `numero_fila` | `INTEGER NOT NULL` | Fila en el archivo original, para que la librera la ubique |
| `titulo_crudo` | `TEXT NOT NULL` | Tal como venía, sin normalizar |
| `motivo` | `TEXT NOT NULL` | Ver categorías abajo |
| `detalle` | `TEXT NULL` | Campo que falla, o título del libro casi-coincidente |

**Invariante de completitud (FR-030)**: `filas_aplicadas + count(reporte_fila) = filas_totales`.
Es verificable con una consulta, y es la forma de garantizar que ninguna fila se descartó en
silencio.

---

## Categorías de clasificación de fila

Enumeración compartida por los dos flujos de Excel, y el vocabulario de `reporte_fila.motivo`:

| Categoría | Aplica a | Efecto |
|---|---|---|
| `aplicada` | ambos | El cambio se hizo (no genera `reporte_fila`) |
| `sin_cambio` | precios | Coincide con un activo pero el precio es igual al vigente (FR-027b) |
| `sin_coincidencia` | precios | Ningún libro coincide |
| `coincide_archivado` | precios | Coincide con un archivado: no se toca (FR-014, apartado propio) |
| `casi_coincidencia` | precios | Variante de edición: se destaca, no se aplica (FR-015) |
| `duplicada_en_archivo` | ambos | No es la primera ocurrencia del título en el archivo (FR-021) |
| `duplicada_de_activo` | alta masiva | Coincide con un libro activo existente (FR-019) |
| `invalida` | ambos | Falta un campo, o stock/precio fuera de rango (FR-019) |

### Orden de precedencia (RF-28, FR-021b)

Cada fila recibe **una sola** categoría. Se evalúa en este orden y gana la primera que da
positivo:

| # | Común a los dos flujos |
|---|---|
| 1 | `invalida` — falta un campo, o stock/precio fuera de rango |
| 2 | `duplicada_en_archivo` — **posicional**: toda ocurrencia posterior a la primera, sin importar si la primera se aplicó |

| # | Alta masiva | # | Actualización de precios |
|---|---|---|---|
| 3 | exacta con activo → `duplicada_de_activo` | 3 | exacta con activo → `aplicada`, o `sin_cambio` si el precio iguala |
| 4 | exacta con archivado → reactivar (`aplicada`) | 4 | exacta con archivado → `coincide_archivado` |
| 5 | sin coincidencia → crear (`aplicada`) | 5 | casi-coincidencia de activo → `casi_coincidencia` |
| | | 6 | casi-coincidencia de archivado → `coincide_archivado` |
| | | 7 | nada de lo anterior → `sin_coincidencia` |

**Dos consecuencias que hay que testear explícitamente**:

- **La coincidencia exacta gana sobre la casi-coincidencia.** Una fila `"El Principito"` puede
  coincidir exacto con un libro y a la vez ser casi-coincidencia de `"El Principito (tapa
  blanda)"`; se resuelve por la exacta. Es posible porque `esCasiCoincidencia` compara por
  superconjunto de palabras.
- **Validar antes de deduplicar, pero contar la ocurrencia igual.** Una fila sin título no tiene
  clave y no puede deduplicarse, de ahí que la validación vaya primero. Pero una fila con título
  legible **ocupa el lugar de primera ocurrencia aunque sea inválida en otro campo**: por eso, si
  la primera es inválida, la posterior sale `duplicada_en_archivo` y ninguna se aplica.

La clasificación es **determinista y no depende del resultado del procesamiento**: el mismo
archivo contra el mismo catálogo produce siempre las mismas categorías.

---

## Índices

| Índice | Para qué |
|---|---|
| `UNIQUE(libro.titulo_normalizado)` | Clave del catálogo; sostiene FR-004/FR-033/FR-037 en la base |
| `libro(estado)` | Filtrar activos en cada búsqueda (FR-005) y archivados en FR-034 |
| `libro(editorial_normalizada)` | Búsqueda por editorial (FR-005) |
| `movimiento_precio(libro_id, fecha)` | Historial por libro y filtro por fecha (FR-026) |
| `movimiento_stock(libro_id, fecha)` | Ídem |
| `venta(libro_id, fecha)` | Ídem |

**Semántica de la búsqueda (FR-005)**: tanto por título como por editorial se matchea por
**subcadena** sobre la columna normalizada correspondiente (`titulo_normalizado`,
`editorial_normalizada`), con el término de búsqueda pasado por la misma normalización. El motivo de
normalizar también la editorial: `LIKE` en SQLite ignora mayúsculas **sólo en ASCII**, así que sin
columna derivada buscar `anagrama` no encontraría `Anagramá` ni `ANAGRAMA` con acento. La
normalización de editorial es más simple que la de título — no toca artículos ni puntuación, porque
no es una clave y no participa del matcheo de los Excel.

A 2.000 filas, `LIKE '%…%'` es un scan de tabla de microsegundos: **no hace falta FTS5** para
cumplir RNF-01. Si el catálogo creciera un orden de magnitud, FTS5 es el siguiente paso natural.

---

## Reglas de validación (centralizadas en `src/domain/`)

Se aplican idénticas en el alta manual, la edición y las dos ingestas de Excel — una sola
implementación, para que no divergan:

| Regla | Definición |
|---|---|
| Título | No vacío tras recortar |
| Editorial | No vacía tras recortar |
| Stock | Entero, `>= 0` |
| Precio | Entero `> 0`. Se acepta parte decimal cero (`1234,00`); toda otra parte decimal se rechaza sin redondear (FR-040) |
| Unicidad | `titulo_normalizado` no existente en **ningún** libro (activo o archivado) |
| Cambio real | Una escritura cuyo valor iguala el vigente no se aplica ni historiza — salvo reactivación (FR-027b) |

---

## Trazabilidad: entidad → requerimiento

| Entidad | FR |
|---|---|
| `libro` | FR-001, FR-002, FR-004, FR-011, FR-032, FR-033, FR-037 |
| `movimiento_precio` | FR-022, FR-027, FR-027b, FR-031 |
| `movimiento_stock` | FR-023, FR-027, FR-027b, FR-031 |
| `venta` | FR-009, FR-024 |
| `reporte_importacion` / `reporte_fila` | FR-030, FR-036 |
| Categorías de fila | FR-013, FR-014, FR-015, FR-019, FR-021 |
