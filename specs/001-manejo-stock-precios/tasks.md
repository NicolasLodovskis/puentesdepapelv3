---
description: "Task list for Manejo de Stock y Precios — Puentes de Papel"
---

# Tasks: Manejo de Stock y Precios — Puentes de Papel

**Input**: Design documents from `/specs/001-manejo-stock-precios/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY. El Principio I de la [constitución](../../.specify/memory/constitution.md) es no negociable: cada tarea de implementación va precedida por su test, y el test debe observarse **FALLANDO** antes de escribir la implementación. No hay tareas de implementación sin su par de test.

**Organization**: agrupadas por historia de usuario, en el orden de prioridad de la spec, para que cada historia se pueda implementar y validar de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: a qué historia pertenece (US1…US8)
- Cada tarea incluye la ruta exacta del archivo

## Path Conventions

Proyecto único Next.js full-stack (ver [plan.md § Project Structure](./plan.md#project-structure)):
`src/app/` rutas y UI · `src/domain/` reglas puras · `src/services/` casos de uso · `src/db/` persistencia · `src/excel/` parseo · `tests/` unit, integration y fixtures.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicializar el proyecto con el stack fijado en el plan.

- [X] T001 Inicializar proyecto Next.js con App Router, TypeScript y React en la raíz (`package.json`, `tsconfig.json`, `next.config.ts`)
- [X] T002 [P] Configurar Vitest con entorno node y alias de rutas en `vitest.config.ts`
- [X] T003 [P] Crear `.gitignore` cubriendo `*.db`, `*.db-wal`, `*.db-shm`, `*.xlsx`, `*.xls` y `.env*` (Principio IV — cero secretos ni datos del negocio)
- [X] T004 [P] Configurar lint y formato en `eslint.config.mjs` y `.prettierrc`
- [X] T005 Instalar dependencias de runtime `better-sqlite3` y `exceljs` en `package.json` (ver [research.md § R2](./research.md))
- [X] T006 Agregar scripts `dev`, `build`, `start`, `test` y `test:watch` en `package.json`, coincidentes con los documentados en `AGENTS.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: dominio puro y persistencia. Es la base de todas las historias.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta que esta fase esté completa.

### Dominio puro — tests primero, sin base de datos

- [X] T007 [P] Escribir test en rojo de `normalizarTitulo` en `tests/unit/normalizar-titulo.test.ts`: acentos, mayúsculas, puntuación, comillas y guiones tipográficos, espacios múltiples, **contenido de paréntesis conservado como palabras**, artículo inicial y forma `"Titulo, El"` (ver [research.md § R3](./research.md))
- [X] T008 Implementar `normalizarTitulo` en `src/domain/normalizar-titulo.ts` hasta verde — **única implementación de normalización del sistema** (restricción de la constitución)
- [X] T009 [P] Escribir test en rojo de conversión a entero de moneda en `tests/unit/precio.test.ts`: string con coma y con punto, aceptación de la parte decimal cero (`1234,00`), rechazo **sin redondear** de toda otra parte decimal, rechazo de separador de miles, de no numérico, de ausente y de `<= 0` (FR-040; enmienda del 2026-07-30, antes era redondeo a centavos)
- [X] T010 Implementar conversión de precio en `src/domain/precio.ts` — entero de moneda, sin centavos (FR-040)
- [X] T011 [P] Escribir test en rojo de `validarCamposLibro` en `tests/unit/validar-libro.test.ts`: título y editorial vacíos o sólo espacios, stock no entero o negativo, precio `<= 0` o no numérico
- [ ] T012 Implementar `validarCamposLibro` en `src/domain/validar-libro.ts` — compartida por alta manual, edición y las dos ingestas
- [ ] T013 [P] Definir los tipos `Resultado<T>` y `ErrorNegocio` en `src/domain/resultado.ts` según [contracts/server-actions.md](./contracts/server-actions.md), incluyendo `libroId` y `estado` en `titulo_duplicado`
- [ ] T014 [P] Definir el vocabulario de categorías de fila en `src/domain/categorias-fila.ts` (las 8 de [data-model.md](./data-model.md))

### Persistencia

- [ ] T015 Escribir el esquema en `src/db/esquema.sql`: las 6 tablas de [data-model.md](./data-model.md), con `UNIQUE(titulo_normalizado)`, la columna derivada `editorial_normalizada`, los `CHECK` de `origen`, y las FK incluida `movimiento_stock.venta_id`
- [ ] T016 Implementar apertura de conexión con `PRAGMA journal_mode = WAL` y `PRAGMA foreign_keys = ON` en `src/db/conexion.ts`
- [ ] T017 Implementar migraciones idempotentes en `src/db/migraciones.ts`
- [ ] T018 [P] Crear helper que provee una base temporal aislada por test en `tests/helpers/db-temporal.ts`
- [ ] T019 Escribir test en rojo del invariante transaccional en `tests/integration/transaccion.test.ts`: si la inserción del historial falla, el cambio del dato **no** queda aplicado (FR-027, Principio III)
- [ ] T020 Implementar el helper transaccional sobre `db.transaction(...)` en `src/db/transaccion.ts`
- [ ] T021 [P] Escribir test en rojo en `tests/integration/esquema.test.ts` que verifica que la **base** rechaza título normalizado duplicado y `origen` fuera de la enumeración, no sólo el código
- [ ] T022 Crear layout base y estilos mínimos en `src/app/layout.tsx`

**Checkpoint**: dominio y persistencia listos — las historias pueden empezar.

---

## Phase 3: User Story 1 - Registrar libros y consultar su precio (Priority: P1) 🎯 MVP

**Goal**: la librera carga un libro y después lo encuentra por nombre o editorial con su precio.

**Independent Test**: cargar un libro por el formulario y encontrarlo buscando por nombre y por editorial, con su precio. No depende de ninguna otra historia.

### Tests for User Story 1 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T023 [P] [US1] Test en rojo de alta en `tests/integration/us1-alta.test.ts`: alta válida persiste y es recuperable; alta con título o editorial vacíos, stock `< 0` o precio `<= 0` se rechaza con mensaje y **no persiste nada**; el alta escribe las dos entradas iniciales de historial con origen `"alta manual"` y valor anterior `0`; y el alta **con foto** la deja asociada al libro mientras el alta **sin foto** se acepta igual, porque la foto es opcional (FR-001, FR-002, FR-031, US1 esc. 5)
- [ ] T024 [P] [US1] Test en rojo de unicidad en `tests/integration/us1-unicidad.test.ts`: rechazo cuando el título normalizado coincide con un libro **activo**; con un libro **archivado**, devolviendo `libroId` y `estado` para poder ofrecer reactivación; y **con editorial distinta**, porque la editorial no forma parte de la clave (FR-004, FR-037)
- [ ] T025 [P] [US1] Test en rojo de búsqueda en `tests/integration/us1-busqueda.test.ts`: buscar por nombre y por editorial devuelve los activos coincidentes con su precio y **excluye archivados**; la búsqueda por editorial es insensible a mayúsculas **y a acentos** (buscar `anagrama` encuentra `Anagramá`) y matchea por subcadena (FR-005, [data-model.md](./data-model.md))

### Implementation for User Story 1

- [ ] T026 [US1] Implementar `altaLibro` en `src/services/catalogo.ts`, en una sola transacción: libro + `movimiento_stock` + `movimiento_precio` (depende de T020)
- [ ] T027 [P] [US1] Implementar `buscarLibros` en `src/services/busqueda.ts` sobre `titulo_normalizado` y `editorial_normalizada`, por subcadena, filtrando por `estado = 'activo'`
- [ ] T028 [US1] Server Action de alta en `src/app/actions/catalogo.ts`
- [ ] T029 [P] [US1] Server Action de búsqueda en `src/app/actions/busqueda.ts`
- [ ] T030 [US1] Formulario de alta con mensajes de validación por campo y **campo de foto opcional** en `src/app/libros/nuevo/page.tsx` (la foto se guarda ya; el embedding llega con T089)
- [ ] T031 [US1] Pantalla de búsqueda y resultado con precio en `src/app/page.tsx`
- [ ] T032 [P] [US1] Script de siembra de catálogo de prueba de ~2.000 libros en `scripts/sembrar.ts`
- [ ] T033 [US1] Test de rendimiento RNF-01 (`< 1 s` p95 sobre el catálogo sembrado) en `tests/integration/us1-rendimiento.test.ts` (depende de T032)

**Checkpoint**: US1 funciona sola y es demostrable — es el MVP.

---

## Phase 4: User Story 2 - Carga inicial por Excel de alta masiva (Priority: P1)

**Goal**: cargar todo el inventario de una vez desde un `.xlsx`, sabiendo exactamente qué filas no entraron y por qué.

**Independent Test**: subir un archivo con filas válidas, inválidas y duplicadas; comprobar que se crearon exactamente las válidas y que el reporte lista las demás con su motivo.

### Tests for User Story 2 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T034 [P] [US2] Crear fixtures `.xlsx` de alta masiva, uno por categoría de fila, en `tests/fixtures/excel/`
- [ ] T035 [P] [US2] Test en rojo de columnas en `tests/integration/us2-columnas.test.ts`: con las 4 columnas se acepta; si falta alguna, **rechazo total** sin crear ni modificar nada (FR-016)
- [ ] T035b [P] [US2] Test en rojo de reconocimiento de encabezados en `tests/unit/encabezados.test.ts`, compartido por los dos flujos: se aceptan nombres con espacios sobrantes, mayúsculas y acentos, y las columnas extra se ignoran; se rechaza el sinónimo (*importe* por *precio*) y la **columna obligatoria repetida**, con el mensaje listando los encabezados encontrados; se usa sólo la primera hoja y el encabezado es la primera fila no vacía (FR-039, AC-36, AC-37)
- [ ] T036 [P] [US2] Test en rojo de creación en `tests/integration/us2-creacion.test.ts`: cada fila válida sin coincidencia crea su libro y escribe las dos entradas con origen `"alta por Excel"` y anterior `0`; y **una variante de edición de un libro existente crea un libro nuevo** en lugar de tratarse como casi-coincidencia, quedando ambos en el catálogo (FR-017, AC-33)
- [ ] T037 [P] [US2] Test en rojo de reporte en `tests/integration/us2-reporte.test.ts`: `invalida` con el campo que falla, `duplicada_en_archivo`, `duplicada_de_activo` sin modificar el libro existente, y el **invariante de completitud** `filasAplicadas + noAplicadas.length === filasTotales` (FR-019, FR-021, FR-030)
- [ ] T037b [P] [US2] Test en rojo de precedencia en `tests/unit/clasificar.test.ts`, con una tabla de casos que fuerza cada colisión de FR-021b: campo faltante + título repetido → `invalida`; título repetido + coincide con activo → `duplicada_en_archivo`; **primera ocurrencia inválida y posterior válida → ninguna se aplica** (la primera `invalida`, la posterior `duplicada_en_archivo`); y coincidencia exacta ganando sobre casi-coincidencia (FR-021, FR-021b)

### Implementation for User Story 2

- [ ] T038 [US2] Implementar lectura por streaming y el reconocimiento de encabezados de FR-039 en `src/excel/leer.ts`: primera hoja, primera fila no vacía, comparación sin espacios/mayúsculas/acentos, sin sinónimos, columnas extra ignoradas, y rechazo con la lista de encabezados encontrados si falta o se repite una obligatoria
- [ ] T039 [US2] Implementar la clasificación de filas con el orden de precedencia de FR-021b en `src/excel/clasificar.ts`: primero `invalida`, después `duplicada_en_archivo` (posicional), y al final las que dependen del catálogo. Compartida por los dos flujos (depende de T014)
- [ ] T040 [US2] Implementar `importacion-alta` con una transacción **por fila** en `src/services/importacion-alta.ts` (depende de T038, T039)
- [ ] T041 [US2] Route Handler `POST` en `src/app/api/excel/alta-masiva/route.ts`
- [ ] T042 [US2] Pantalla de subida y reporte en `src/app/excel/alta-masiva/page.tsx`
- [ ] T043 [US2] Test de volumen RNF-03 (archivo de 5.000 filas, sin fallar ni truncar) en `tests/integration/us2-volumen.test.ts`

> **Resuelto (CHK010)**: en alta masiva se evalúa **sólo coincidencia exacta** y una variante de
> edición es un **libro nuevo** — si existe "El Principito", la fila "El Principito (tapa dura)" crea
> otro libro y ambos conviven. Es intencional: acá la librera carga su propio inventario y las
> ediciones distintas son ejemplares distintos, mientras que en el flujo de precios aplicar el precio
> a la edición equivocada corrompería un dato. RF-19 ampliado, AC-33.

**Checkpoint**: US1 y US2 funcionan de forma independiente. El sistema ya es usable de verdad.

---

## Phase 5: User Story 3 - Vender un libro descontando stock (Priority: P2)

**Goal**: marcar un libro como vendido, descontando una unidad y dejando registro de la venta.

**Independent Test**: vender un libro con stock ≥ 1 y comprobar descuento, venta registrada y movimiento de stock; comprobar que con stock 0 no se puede vender.

### Tests for User Story 3 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T044 [P] [US3] Test en rojo de venta en `tests/integration/us3-venta.test.ts`: stock `S → S-1`, `venta` con el precio **vigente al momento**, y `movimiento_stock` con origen `"venta"` y `venta_id` apuntando a esa venta (FR-009, FR-023, FR-024)
- [ ] T045 [P] [US3] Test en rojo de bloqueo en `tests/integration/us3-venta-bloqueada.test.ts`: con stock `0` se impide sin alterar stock ni registrar venta; un libro **archivado** no puede venderse aunque tenga stock; y cambiar el precio después **no** altera una venta ya registrada (FR-010, FR-038)

### Implementation for User Story 3

- [ ] T046 [US3] Implementar `venderUnidad` en `src/services/operacion.ts`, todo en una transacción, rechazando libros archivados (FR-038)
- [ ] T047 [US3] Server Action de venta en `src/app/actions/operacion.ts`
- [ ] T048 [US3] Acción de vender desde el resultado de búsqueda en `src/app/page.tsx`

> **Resuelto (CHK025)**: sólo un libro **activo** puede venderse — ahora es RF-29 / FR-038, con AC-34 y AC-35. Ya no es un supuesto.

**Checkpoint**: la operación diaria de venta funciona.

---

## Phase 6: User Story 4 - Corregir a mano los datos de un libro (Priority: P2)

**Goal**: ajustar precio, stock, título y editorial, con historial en los dos primeros.

**Independent Test**: cambiar precio, stock, título y editorial de un libro y verificar el valor nuevo; en precio y stock, además, la entrada de historial con valor anterior y origen `"edición manual"`.

### Tests for User Story 4 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T049 [P] [US4] Test en rojo de edición en `tests/integration/us4-edicion.test.ts`: cambiar precio y stock guarda el valor y escribe su entrada con anterior, nuevo y origen `"edición manual"`; valores inválidos se rechazan sin escribir historial (FR-007, FR-008, FR-022, FR-023)
- [ ] T050 [P] [US4] Test en rojo de no-cambio en `tests/integration/us4-sin-cambio.test.ts`: fijar el mismo precio o el mismo stock que ya tenía devuelve `huboCambio: false` y **no** escribe entrada de historial (FR-027b)
- [ ] T051b [P] [US4] Test en rojo de restricciones de archivado en `tests/integration/us4-archivado.test.ts`: sobre un libro **archivado**, modificar stock o precio se impide con mensaje sin escribir historial; modificar **título y editorial sí se permite** (FR-038, AC-34)
- [ ] T051 [P] [US4] Test en rojo de datos descriptivos en `tests/integration/us4-datos.test.ts`: editar título y editorial persiste y vuelve al libro encontrable por los valores nuevos, **sin** escribir historial; título o editorial vacíos se rechazan; y colisión de título normalizado contra cualquier libro (activo o archivado) se rechaza (FR-032, FR-033)

### Implementation for User Story 4

- [ ] T052 [P] [US4] Implementar `cambiarPrecio` y `cambiarStock` en `src/services/operacion.ts`, rechazando libros archivados (FR-038) y con el corte por no-cambio antes de abrir la transacción
- [ ] T053 [P] [US4] Implementar `editarDatosLibro` en `src/services/catalogo.ts`, recalculando `titulo_normalizado`
- [ ] T054 [US4] Server Actions de edición en `src/app/actions/catalogo.ts` (depende de T052, T053)
- [ ] T055 [US4] Pantalla de edición en `src/app/libros/[id]/editar/page.tsx`

> **Resuelto (CHK024)**: un libro **archivado no** recibe edición manual de precio ni de stock, pero **sí** de título y editorial. RF-29 / FR-038, con AC-34.

**Checkpoint**: el mantenimiento correctivo funciona.

---

## Phase 7: User Story 5 - Actualización masiva de precios (Priority: P2)

**Goal**: aplicar el Excel de la distribuidora a lo que se puede resolver sin ambigüedad, e informar el resto para decisión manual.

**Independent Test**: subir un Excel contra un catálogo con activos, archivados, sin coincidencia y casi-coincidencias; verificar qué precios cambiaron, qué historial se escribió y qué muestra cada categoría del reporte.

### Tests for User Story 5 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T056 [P] [US5] Test en rojo de casi-coincidencia en `tests/unit/casi-coincidencia.test.ts`, con el **set de ejemplos de AC-10** como tabla de casos: variantes de edición del léxico dan positivo, títulos legítimamente distintos dan negativo (ver [research.md § R4](./research.md))
- [ ] T057 [P] [US5] Crear fixtures `.xlsx` de actualización de precios, uno por categoría, en `tests/fixtures/excel/`
- [ ] T057b [P] [US5] Test en rojo de columnas en `tests/integration/us5-columnas.test.ts`: con las columnas *libro* y *precio* se acepta y se lee; si falta alguna, **rechazo total** con mensaje y **ningún precio modificado** (FR-012, RF-06, AC-07 del PRD)
- [ ] T058 [P] [US5] Test en rojo de aplicación en `tests/integration/us5-aplicacion.test.ts`: los activos coincidentes actualizan precio y escriben historial con origen `"actualización masiva por Excel"`; los archivados **no se modifican** (FR-013)
- [ ] T059 [P] [US5] Test en rojo de reporte en `tests/integration/us5-reporte.test.ts`: `sin_cambio`, `sin_coincidencia`, `coincide_archivado` en apartado propio, `casi_coincidencia` sin aplicar, `duplicada_en_archivo`, y el invariante de completitud (FR-014, FR-015, FR-021, FR-030). Incluir la aserción explícita de que **el conteo total de libros no cambia** tras procesar el archivo: este flujo nunca crea libros (FR-020, PRD §7)
- [ ] T059b [P] [US5] Test en rojo de casi-coincidencia de archivado en `tests/integration/us5-casi-archivado.test.ts`: una fila que es casi-coincidencia de un libro **archivado** no modifica nada y cae en `coincide_archivado`, **no** en `casi_coincidencia` ni en `sin_coincidencia` (FR-014, FR-015, FR-021b)
- [ ] T060 [P] [US5] Test en rojo de idempotencia en `tests/integration/us5-idempotencia.test.ts`: reprocesar el mismo archivo deja el historial de precio **exactamente igual** que después de la primera pasada (FR-027b)
- [ ] T061 [P] [US5] Test en rojo de reporte persistido en `tests/integration/us5-reporte-persistido.test.ts`: el reporte queda guardado con fecha, totales y detalle; se puede volver a consultar con el mismo contenido; no existe operación de edición ni de borrado (FR-036)
- [ ] T061b [P] [US5] Test en rojo de volumen en `tests/integration/us5-volumen.test.ts`: archivo de 5.000 filas procesado sin fallar ni truncar, **incluida la persistencia de una fila de reporte por cada fila no aplicada** — es el flujo que más escribe a escala (FR-030b, RNF-03)

### Implementation for User Story 5

- [ ] T062 [US5] Implementar `esCasiCoincidencia` y el léxico de variantes de edición en `src/domain/casi-coincidencia.ts`
- [ ] T063 [US5] Implementar `importacion-precios` con transacción por fila en `src/services/importacion-precios.ts` (depende de T038, T039, T062)
- [ ] T064 [US5] Implementar la persistencia y consulta de reportes en `src/services/reportes.ts`
- [ ] T065 [US5] Route Handler `POST` en `src/app/api/excel/precios/route.ts` — endpoint **separado** del de alta masiva (FR-016)
- [ ] T066 [US5] Pantalla de subida con las casi-coincidencias **destacadas en otro color** y el apartado propio de archivados en `src/app/excel/precios/page.tsx`
- [ ] T067 [US5] Pantalla de reportes anteriores, sólo lectura, en `src/app/excel/precios/reportes/page.tsx`

**Checkpoint**: el segundo gran ahorro de tiempo funciona, y sin aplicar nada ambiguo por su cuenta.

---

## Phase 8: User Story 6 - Archivar y reactivar (Priority: P3)

**Goal**: sacar del catálogo lo que dejó de venderse sin perder su historia, y poder recuperarlo.

**Independent Test**: archivar un libro y comprobar que sale de las búsquedas conservando historial; reactivarlo a mano y comprobar que vuelve con sus dos entradas; reactivarlo por Excel de alta masiva y comprobar lo mismo.

### Tests for User Story 6 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T068 [P] [US6] Test en rojo de archivado en `tests/integration/us6-archivar.test.ts`: queda `archivado`, sale de la búsqueda por texto y de la consulta por foto, y su historial sigue accesible (FR-011)
- [ ] T069 [P] [US6] Test en rojo de listado en `tests/integration/us6-archivados.test.ts`: la consulta de archivados lista **únicamente** archivados (FR-034)
- [ ] T070 [P] [US6] Test en rojo de reactivación manual en `tests/integration/us6-reactivar.test.ts`: vuelve a activo con el stock y precio fijados, con dos entradas de origen `"reactivación"`; y **fijando los mismos valores que ya tenía, las dos entradas se escriben igual** (FR-035, excepción de FR-027b)
- [ ] T071 [P] [US6] Test en rojo de reactivación por Excel en `tests/integration/us6-reactivar-excel.test.ts`: una fila válida de alta masiva cuyo título coincide con un archivado lo reactiva con origen `"alta por Excel"`, también con valores idénticos (FR-018)

### Implementation for User Story 6

- [ ] T072 [US6] Implementar `archivarLibro` y `reactivarLibro` en `src/services/catalogo.ts`, con la excepción explícita a la regla de no-cambio
- [ ] T073 [P] [US6] Implementar `listarArchivados` en `src/services/busqueda.ts`
- [ ] T074 [US6] Conectar la reactivación en el flujo de alta masiva en `src/services/importacion-alta.ts` (depende de T040, T072)
- [ ] T075 [US6] Server Actions de archivar y reactivar en `src/app/actions/catalogo.ts`
- [ ] T076 [US6] Pantalla de archivados con acción de reactivar en `src/app/libros/archivados/page.tsx`
- [ ] T077 [US6] Ofrecer reactivación desde el rechazo del alta duplicada contra un archivado en `src/app/libros/nuevo/page.tsx` (usa `libroId` y `estado` del error, T013)

**Checkpoint**: el ciclo de vida completo del libro funciona.

---

## Phase 9: User Story 7 - Revisar y filtrar los historiales (Priority: P3)

**Goal**: navegar lo que la trazabilidad viene escribiendo desde la primera historia.

**Independent Test**: generar movimientos conocidos (una venta, un cambio manual, una actualización masiva) y verificar que cada historial muestra sus campos y que los filtros recortan bien.

### Tests for User Story 7 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T078 [P] [US7] Test en rojo de contenido en `tests/integration/us7-historiales.test.ts`: ventas muestra el precio de venta; precio muestra anterior, nuevo y origen; stock muestra cantidad anterior, resultante y origen; y los registros de un libro archivado siguen apareciendo (FR-025)
- [ ] T079 [P] [US7] Test en rojo de filtros y orden en `tests/integration/us7-filtros.test.ts`: filtro por rango de fechas, por título y por editorial; orden por fecha descendente con **desempate por `id`** para las dos entradas que un alta escribe en el mismo milisegundo (FR-026, [research.md § R6](./research.md))

### Implementation for User Story 7

- [ ] T080 [US7] Implementar `consultarHistorial` en `src/services/historial.ts`, convirtiendo el rango de fechas local a UTC
- [ ] T081 [US7] Pantalla de historiales con los tres tipos y sus filtros en `src/app/historiales/page.tsx`

> **Limitación conocida (CHK021)**: el filtro por título resuelve contra el título **vigente**. Un libro renombrado muestra sus entradas viejas bajo el nombre nuevo, por no historizar renombres.

**Checkpoint**: la trazabilidad es navegable, no sólo almacenada.

---

## Phase 10: User Story 8 - Encontrar un libro sacándole una foto (Priority: P3)

**Goal**: identificar un libro que la librera tiene en la mano, ofreciéndole candidatos para elegir.

**Independent Test**: con un set de libros con foto cargada, consultar con otra toma de uno de ellos y comprobar que aparece entre los primeros candidatos.

**⚠️ Es la historia con riesgo técnico real.** La elección de R1 no se puede garantizar por análisis: AC-12 es la compuerta y sólo se evalúa contra fotos reales.

### Tests for User Story 8 (MANDATORY - write first, must FAIL) ⚠️

- [ ] T082 [US8] Instalar `@huggingface/transformers`, `onnxruntime-node` y `sharp` en `package.json`
- [ ] T083 [US8] Construir el set de validación en `tests/fixtures/fotos/`: al menos 20 libros con foto de alta más una **segunda toma distinta** de cada uno, además de fotos de libros fuera del catálogo
- [ ] T084 [P] [US8] Test en rojo de embedding en `tests/integration/us8-embedding.test.ts`: dimensión esperada (512) y determinismo para la misma imagen
- [ ] T085 [P] [US8] Test en rojo de AC-12 en `tests/integration/us8-ac12.test.ts`: para cada libro del set, consultar con su segunda toma lo devuelve entre los **5 primeros**, en menos de 3 segundos (AC-12, RNF-02)
- [ ] T086 [P] [US8] Test en rojo de casos negativos en `tests/integration/us8-sin-candidatos.test.ts`: una foto ajena al catálogo devuelve lista **vacía** y nunca un libro arbitrario; los archivados no aparecen como candidatos (FR-029, US8 esc. 3)

### Implementation for User Story 8

- [ ] T087 [US8] Implementar el cálculo de embedding con preprocesado por `sharp` en `src/services/foto.ts`
- [ ] T088 [US8] Implementar el ranking por similitud coseno sobre los vectores de libros activos en `src/services/foto.ts` (depende de T087)
- [ ] T089 [US8] Calcular y guardar `foto_embedding` al cargar la foto en el alta y en la edición, en `src/services/catalogo.ts`
- [ ] T090 [US8] Pantalla de consulta por foto con la **lista** de candidatos ordenada en `src/app/foto/page.tsx`
- [ ] T091 [US8] Evaluar T085 sobre el set real y registrar el resultado en `specs/001-manejo-stock-precios/research.md` (sección R1); si falla, aplicar la escalera de remedios ahí documentada sobre `src/services/foto.ts`: modelo `patch16` → sumar señal de OCR → recorte automático de la tapa

**Checkpoint**: todas las historias funcionan de forma independiente.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: los invariantes que la constitución no negocia, verificados de forma transversal.

- [ ] T092 [P] Test de invariante de trazabilidad en `tests/integration/invariantes.test.ts`: para todo libro, la última entrada de cada historial coincide con su valor vigente (Principio III)
- [ ] T093 [P] Test de append-only en `tests/integration/append-only.test.ts`: no existe operación que borre o edite entradas de historial ni que borre libros (FR-028)
- [ ] T094 [P] Test de normalización única en `tests/unit/normalizacion-unica.test.ts`: todos los flujos usan `normalizarTitulo` y no hay una segunda implementación (restricción de la constitución)
- [ ] T095 [P] Documentar el arranque y los comandos en `README.md`
- [ ] T096 Ejecutar la validación completa de [quickstart.md](./quickstart.md) historia por historia, incluidas las 6 comprobaciones transversales

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — arranca de inmediato
- **Foundational (Phase 2)**: depende de Setup — **BLOQUEA todas las historias**
- **Historias (Phase 3+)**: todas dependen de Foundational
  - US1, US2, US3, US4, US5, US7 son independientes entre sí
  - **US6 depende de US2** (T074 conecta la reactivación al flujo de alta masiva) y de US1 (T077 usa el rechazo del alta)
  - **US8 depende de US1** (T089 guarda el embedding en el alta)
- **Polish (Phase N)**: depende de todas las historias que se quieran cerrar

### Within Each User Story

- Los tests se escriben y se observan **FALLANDO** antes de la implementación (Principio I, no negociable)
- Dominio antes que servicios; servicios antes que Server Actions y Route Handlers; endpoints antes que UI
- Toda tarea que escriba stock o precio incluye su entrada de historial en la misma transacción (Principio III)
- Cada tarea traza a un RF del PRD vigente (Principio V)

### Parallel Opportunities

- Setup: T002, T003 y T004 en paralelo
- Foundational: los tests de dominio T007, T009, T011 en paralelo, y T013, T014, T018, T021 entre sí. Cada implementación espera su test en rojo
- Dentro de cada historia, **todos los tests marcados [P] en paralelo** — son archivos distintos
- Servicios en archivos distintos en paralelo: T027 con T026; T052 con T053; T073 con T072
- Las historias US3, US4, US5 y US7 pueden avanzar en paralelo una vez cerrada la fase Foundational

---

## Parallel Example: User Story 1

```bash
# Los tres tests de US1 juntos (archivos distintos), antes de tocar implementación:
Task: "Test en rojo de alta en tests/integration/us1-alta.test.ts"
Task: "Test en rojo de unicidad en tests/integration/us1-unicidad.test.ts"
Task: "Test en rojo de búsqueda en tests/integration/us1-busqueda.test.ts"

# Verificar que los tres FALLAN. Después, los servicios en archivos distintos:
Task: "Implementar altaLibro en src/services/catalogo.ts"
Task: "Implementar buscarLibros en src/services/busqueda.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup
2. Phase 2: Foundational — **CRÍTICO**, bloquea todo
3. Phase 3: US1
4. **PARAR Y VALIDAR**: cargar un libro y encontrarlo por nombre y editorial
5. Demostrable: ya reemplaza la consulta manual de precios

### Incremental Delivery

1. Setup + Foundational → base lista
2. + US1 → **MVP**: cargar y consultar
3. + US2 → el catálogo entero entra de una vez; el sistema pasa a ser usable de verdad
4. + US3 y US4 → la operación diaria (vender, corregir)
5. + US5 → la actualización masiva de precios
6. + US6 → ciclo de vida completo del libro
7. + US7 → la trazabilidad se vuelve navegable
8. + US8 → la comodidad de la foto, y la única con riesgo técnico real

### Bloqueos de producto a resolver antes de cerrar

Ninguno impide arrancar; cada uno impide **cerrar** su historia:

| Bloqueo | Tarea | Historia |
|---|---|---|
| ~~CHK007 / CHK008 — precedencia de categorías de fila~~ | ~~T039~~ | **Resuelto** por RF-28 / FR-021b |
| ~~CHK009 — casi-coincidencia contra sin coincidencia~~ | ~~T059~~ | **Resuelto**: categorías mutuamente excluyentes |
| ~~CHK010 — casi-coincidencia en alta masiva~~ | ~~T040~~ | **Resuelto**: RF-19 / FR-017 — es un libro nuevo |
| ~~CHK024 — edición manual sobre archivados~~ | ~~T052~~ | **Resuelto**: RF-29 / FR-038 |
| ~~CHK025 — venta sólo de activos~~ | ~~T046~~ | **Resuelto**: RF-29 / FR-038 |

**Ya no quedan bloqueos de producto.** Los cinco ítems que estaban abiertos se resolvieron con
enmiendas del PRD (RF-19, RF-22, RF-28, RF-29 y AC-30 a AC-35), así que las ocho historias se pueden
implementar y cerrar sin supuestos pendientes. El único ítem de diseño que sigue abierto es la regla
completa de reconocimiento de encabezados (CHK012), que afecta a T038 pero no bloquea sus tests.

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes
- La etiqueta `[Story]` mapea cada tarea a su historia, para trazabilidad
- Cada historia se puede completar y validar por separado
- **Verificar que los tests fallan antes de implementar** — nunca omitir (Principio I)
- Toda tarea que escriba stock o precio debe escribir su entrada de historial en la misma transacción (Principio III)
- Toda tarea debe trazar a un RF del PRD vigente (Principio V)
- Commitear por tarea o grupo lógico, con el código y sus tests juntos
- No commitear `*.db`, `*.xlsx` reales ni `.env` (Principio IV)
