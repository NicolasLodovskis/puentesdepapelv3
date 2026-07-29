# Contracts — Interfaz interna de la aplicación

**Feature**: `001-manejo-stock-precios` | **Fecha**: 2026-07-29
**Modelo**: [data-model.md](../data-model.md) | **Research**: [research.md](../research.md#r8--forma-de-la-aplicación-nextjs)

El sistema no expone una API pública: es mono-usuario, un solo proceso, sin consumidores externos
(PRD §6). El contrato relevante es el **límite entre la UI y los casos de uso**: Server Actions
para las mutaciones y un Route Handler para la subida de archivos.

Las firmas son el contrato que los tests consumen. Están en TypeScript porque son el borde
programático real, no porque describan implementación.

---

## Convenciones

Toda acción devuelve un resultado discriminado, nunca lanza para errores esperables. Los errores
de validación son parte del contrato: la spec exige mensajes, no excepciones (FR-002, FR-029).

```ts
type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; error: ErrorNegocio }

type ErrorNegocio =
  | { tipo: 'validacion'; campo: 'titulo' | 'editorial' | 'stock' | 'precio'; mensaje: string }
  | { tipo: 'titulo_duplicado'; libroId: number; estado: 'activo' | 'archivado'; mensaje: string }
  | { tipo: 'sin_stock'; mensaje: string }
  | { tipo: 'no_encontrado'; mensaje: string }
  | { tipo: 'estado_invalido'; mensaje: string }
```

`titulo_duplicado` lleva `estado` y `libroId` a propósito: cuando el duplicado es un **archivado**,
la UI necesita ofrecer reactivarlo (FR-004, FR-035, US6 esc. 6). Sin esos dos campos, ese camino no
se puede construir.

**Los importes cruzan el límite en centavos** (`number` entero). La conversión a texto con coma
decimal ocurre sólo en la UI (R5).

---

## Catálogo

```ts
// FR-001, FR-002, FR-004, FR-031, FR-037
function altaLibro(input: {
  titulo: string
  editorial: string
  stock: number
  precioCentavos: number
  foto?: Uint8Array
}): Promise<Resultado<{ libroId: number }>>
```

Escribe, en una sola transacción: el libro, su `movimiento_stock` inicial
(`cantidad_anterior: 0`, origen `'alta manual'`) y su `movimiento_precio` inicial
(`precio_anterior_centavos: 0`, mismo origen). Si hay `foto`, calcula y guarda el embedding.

```ts
// FR-032, FR-033
function editarDatosLibro(input: {
  libroId: number
  titulo: string
  editorial: string
}): Promise<Resultado<void>>
```

No escribe historial: los renombres no se historizan (decisión registrada en los supuestos de la
spec). Rechaza con `titulo_duplicado` si el nuevo título normalizado choca con **cualquier** otro
libro.

```ts
// FR-007, FR-022, FR-027, FR-027b
function cambiarPrecio(input: {
  libroId: number
  precioCentavos: number
}): Promise<Resultado<{ huboCambio: boolean }>>

// FR-008, FR-023, FR-027, FR-027b
function cambiarStock(input: {
  libroId: number
  stock: number
}): Promise<Resultado<{ huboCambio: boolean }>>
```

`huboCambio: false` cuando el valor entrante iguala al vigente: no se escribe ni dato ni historial
(FR-027b). Es un éxito, no un error — la UI lo informa como "sin cambios".

```ts
// FR-009, FR-010, FR-023, FR-024
function venderUnidad(input: { libroId: number }): Promise<Resultado<{ ventaId: number }>>
```

En una transacción: `stock - 1`, inserta `venta` copiando el precio vigente, e inserta
`movimiento_stock` con origen `'venta'` y `venta_id` apuntando a la venta. Devuelve `sin_stock` si
`stock = 0`, sin tocar nada.

```ts
// FR-011
function archivarLibro(input: { libroId: number }): Promise<Resultado<void>>

// FR-035, FR-027b (excepción)
function reactivarLibro(input: {
  libroId: number
  stock: number
  precioCentavos: number
}): Promise<Resultado<void>>
```

`reactivarLibro` escribe **siempre** las dos entradas de historial con origen `'reactivación'`,
incluso si `stock` y `precioCentavos` coinciden con los que el libro ya tenía.

---

## Consultas

```ts
// FR-005 — sólo activos, RNF-01 (<1 s p95 sobre ~2.000 libros)
function buscarLibros(input: {
  texto: string
  campo: 'titulo' | 'editorial' | 'ambos'
}): Promise<LibroResumen[]>

// FR-034 — sólo archivados
function listarArchivados(input: { texto?: string }): Promise<LibroResumen[]>

type LibroResumen = {
  libroId: number
  titulo: string
  editorial: string
  stock: number
  precioCentavos: number
  tieneFoto: boolean
}
```

```ts
// FR-006 — RNF-02 (<3 s p95), AC-12 (correcto entre los 5 primeros)
function buscarPorFoto(input: {
  foto: Uint8Array
  maxCandidatos?: number  // default 5
}): Promise<Candidato[]>

type Candidato = LibroResumen & { similitud: number }  // coseno en [-1, 1], orden descendente
```

Devuelve `[]` cuando ningún libro supera el umbral mínimo: la spec prohíbe devolver un libro
arbitrario (US8 esc. 3). Nunca devuelve un único resultado presentado como certeza — el contrato es
una lista, siempre (FR-029).

```ts
// FR-025, FR-026
function consultarHistorial(input: {
  tipo: 'precio' | 'stock' | 'ventas'
  filtro?: { desde?: string; hasta?: string; titulo?: string; editorial?: string }
}): Promise<EntradaHistorial[]>
```

`desde`/`hasta` son fechas locales que se convierten a rango UTC (R6). El orden es por `fecha`
descendente y, ante empate, por `id` descendente.

> **Abierto (CHK021)**: el filtro por `titulo` resuelve contra el título **vigente** del libro. Si
> un libro fue renombrado, sus entradas viejas aparecen bajo el nombre nuevo. Es consecuencia de no
> historizar renombres; queda documentado, no resuelto.

---

## Ingesta de Excel

Route Handler, porque recibe `multipart/form-data`:

```
POST /api/excel/precios      → RF-06, FR-012 a FR-015, FR-021, FR-036
POST /api/excel/alta-masiva  → RF-18, FR-016 a FR-019, FR-021
```

Los dos flujos son **endpoints distintos y no intercambiables** (FR-016). Ambos aceptan un campo
`archivo` y devuelven:

```ts
type RespuestaImportacion =
  | { ok: false; error: { tipo: 'columnas_faltantes'; faltantes: string[] } }
  | { ok: true; reporte: Reporte }

type Reporte = {
  reporteId: number | null   // number en precios (persistido); null en alta masiva
  nombreArchivo: string
  filasTotales: number
  filasAplicadas: number
  noAplicadas: FilaNoAplicada[]
}

type FilaNoAplicada = {
  numeroFila: number
  tituloCrudo: string
  motivo: MotivoFila
  detalle?: string
}

type MotivoFila =
  | 'sin_cambio' | 'sin_coincidencia' | 'coincide_archivado' | 'casi_coincidencia'
  | 'duplicada_en_archivo' | 'duplicada_de_activo' | 'invalida'
```

**El rechazo por columnas faltantes es total**: no se aplica ninguna fila (FR-012, FR-016). Es la
única forma de fallo que no produce reporte.

**Invariante del contrato (FR-030)**: `filasAplicadas + noAplicadas.length === filasTotales`.
Siempre. Es la garantía de que ninguna fila se descarta en silencio, y es un test de contrato, no
una aspiración.

`reporteId` es `number` sólo en el flujo de precios, que persiste el reporte (FR-036); en alta
masiva es `null` por decisión explícita. La consulta de reportes anteriores:

```ts
// FR-036
function listarReportesPrecios(): Promise<ReporteResumen[]>
function verReportePrecios(input: { reporteId: number }): Promise<Reporte>
```

Sin operaciones de edición ni borrado: los reportes son append-only, igual que los historiales.

---

## Contrato de dominio puro

Estas funciones no tocan la base y son el corazón testeable del sistema. Sus tests no necesitan
SQLite y son los primeros que se escriben (Principio I).

```ts
// R3 — FR-003. Única implementación; nadie más normaliza títulos.
function normalizarTitulo(titulo: string): string

// R4 — FR-015. Predicado determinista, sin umbral difuso.
function esCasiCoincidencia(normalizadoA: string, normalizadoB: string): boolean

// FR-002 — compartido por alta manual, edición y las dos ingestas de Excel.
function validarCamposLibro(input: {
  titulo: unknown; editorial: unknown; stock: unknown; precio: unknown
}): Resultado<{ titulo: string; editorial: string; stock: number; precioCentavos: number }>
```

`normalizarTitulo` es la restricción de la constitución sobre una única función de normalización
compartida: si aparece una segunda implementación, el matcheo de los dos flujos de Excel puede
divergir del de la búsqueda y del de la unicidad.
