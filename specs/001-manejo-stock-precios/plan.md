# Implementation Plan: Manejo de Stock y Precios — Puentes de Papel

**Branch**: `main` (repo local sin remoto ni flujo de PR) | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-manejo-stock-precios/spec.md`

## Summary

Aplicación local mono-usuario para que la dueña de "Puentes de Papel" mantenga stock y precios de
su catálogo (~2.000 libros): ABM con baja lógica, venta unitaria, dos flujos separados de Excel
(actualización de precios y alta masiva), búsqueda por nombre/editorial y por foto, y trazabilidad
completa de todo movimiento de stock y de precio.

**Enfoque técnico**: Next.js App Router como aplicación full-stack de un solo proceso, con Server
Actions para las mutaciones y un Route Handler por cada flujo de Excel. Toda la lógica de negocio
vive en `src/services/` (casos de uso transaccionales) y las reglas puras en `src/domain/`; la UI y
las acciones nunca tocan SQL. Persistencia en SQLite mediante `better-sqlite3`, con una transacción
sincrónica por operación que envuelve el cambio del dato y sus entradas de historial — así el
invariante del Principio III se cumple por construcción y no por disciplina. La búsqueda por foto
se resuelve con embeddings CLIP locales (Transformers.js sobre `onnxruntime-node`) y similitud
coseno por fuerza bruta sobre 2.000 vectores, que a esa escala es sub-milisegundo.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 20+

**Primary Dependencies**: Next.js (App Router), React, `better-sqlite3`, `exceljs`,
`@huggingface/transformers` + `onnxruntime-node`, `sharp` (preprocesado de imagen)

**Storage**: SQLite, archivo único `.db`, sin servidor. Esquema en [data-model.md](./data-model.md)

**Testing**: Vitest

**Target Platform**: escritorio local (Linux/WSL2 en desarrollo), navegador contra `localhost`

**Project Type**: aplicación web full-stack de un solo proyecto

**Performance Goals**: búsqueda por texto <1 s p95; búsqueda por foto <3 s p95; procesar archivos
Excel de hasta 5.000 filas sin fallar ni truncar

**Constraints**: sin servidor de base de datos ni servicios externos; sin autenticación (decisión
explícita); sin resguardo de datos (fuera de alcance, riesgo asumido); una única función de
normalización de títulos compartida por todos los flujos

**Scale/Scope**: 1 usuaria, ~2.000 libros, archivos de hasta 5.000 filas, 8 historias de usuario,
42 requerimientos funcionales

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Derived from `.specify/memory/constitution.md` v1.0.0.

**Evaluación inicial (pre Phase 0) y re-evaluación (post Phase 1): ambas PASS.** El diseño no
cambió ninguna postura entre las dos pasadas; se anota una sola vez con lo que el diseño agrega.

- [x] **I. Test-First (NO NEGOCIABLE)** — PASS. `src/domain/` es puro y sin dependencias, así que
      la mayor densidad de reglas (normalización, casi-coincidencia, validación) se testea sin base
      de datos y es lo primero que se escribe en rojo. Los casos de uso se testean contra una base
      en archivo temporal por test. `tasks.md` debe emitir la tarea de test antes que la de
      implementación en cada par.
- [x] **II. Nunca inventa datos** — PASS. Ninguna celda faltante recibe valor por defecto: se
      clasifica `invalida` con el campo que falla. Las coincidencias ambiguas quedan como
      `casi_coincidencia` sin aplicarse. `buscarPorFoto` devuelve **siempre** una lista, y `[]` si
      nada supera el umbral — el contrato hace imposible presentar una única respuesta como certeza.
- [x] **III. Trazabilidad Total (NO NEGOCIABLE)** — PASS. Cada caso de uso que escribe stock o
      precio corre dentro de `db.transaction(...)` de `better-sqlite3`, que es sincrónica: no hay
      `await` intercalado y el par dato+historial es indivisible. `foreign_keys = ON` impide
      historial huérfano. No existe `DELETE` sobre `libro` ni sobre las tablas de movimiento, y los
      `origen` se validan con `CHECK` en la base además de en el código.
- [x] **IV. Cero secretos** — PASS. No hay credenciales: sin autenticación, sin servicios externos.
      El modelo CLIP se descarga de un repositorio público sin token. `.gitignore` debe cubrir
      `*.db`, `*.db-wal`, `*.db-shm`, `*.xlsx` y `.env*`.
- [x] **V. Alcance anclado al PRD** — PASS. Los 42 FR trazan a los 30 RF del PRD; los invariantes
      FR-027 a FR-029 trazan a los principios II y III. El plan **no** agrega capacidades: las tres
      cuestiones abiertas que necesitarían alcance nuevo quedan listadas como pendientes de enmienda
      en lugar de resolverse por cuenta propia (ver abajo).
- [x] **Restricciones técnicas** — PASS. Next.js App Router + TypeScript + React; SQLite por
      `better-sqlite3` en un archivo local; los dos flujos de Excel son endpoints separados y no
      intercambiables; `normalizarTitulo` es una única implementación compartida; los presupuestos
      de RNF-01/02/03 están asignados a comprobaciones concretas del quickstart.

**Una desviación menor, justificada**: `AGENTS.md` menciona *"librería `xlsx` o similar"* y el plan
elige `exceljs`. La cláusula "o similar" lo permite; el motivo está en
[research.md § R2](./research.md#r2--lectura-de-archivos-excel-rf-06-rf-18-rnf-03) — la versión de
SheetJS publicada en npm está congelada con advisories conocidos y las corregidas se distribuyen
fuera de npm.

**Sin pendientes de producto.** La primera versión de este plan listaba cinco cuestiones que
necesitaban enmienda del PRD antes de poder cerrarse; todas se resolvieron con enmiendas posteriores,
así que ninguna historia se implementa sobre un supuesto:

| Ítem | Decisión | Enmienda |
|---|---|---|
| CHK007 / CHK008 | Precedencia de clasificación de filas: primero `invalida`, después `duplicada_en_archivo` (posicional), y al final las que dependen del catálogo | RF-28, AC-30, AC-31 |
| CHK009 | Categorías mutuamente excluyentes; casi-coincidencia de archivado → `coincide_archivado` | RF-08, AC-32 |
| CHK010 | En alta masiva sólo hay coincidencia **exacta**: una variante de edición es un **libro nuevo** y conviven | RF-19, AC-33 |
| CHK024 / CHK025 | Sobre un archivado no se modifica stock ni precio ni se vende; sí título, editorial y reactivación | RF-29, AC-34, AC-35 |
| CHK012 | Reconocimiento de encabezados: primera hoja, primera fila no vacía, sin sinónimos, columna obligatoria repetida = rechazo | RF-30, AC-36, AC-37 |

Lo que queda abierto en `checklists/integridad.md` son enunciados por precisar y verificaciones a
instrumentar, ninguno bloqueante para implementar ni testear.

## Project Structure

### Documentation (this feature)

```text
specs/001-manejo-stock-precios/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── server-actions.md
├── spec.md              # /speckit-specify output
├── checklists/
│   ├── requirements.md  # calidad de la spec — 16/16
│   └── integridad.md    # calidad de requerimientos — 20/29 resueltos
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/                          # App Router: UI + endpoints
│   ├── page.tsx                  # búsqueda y consulta de precio (US1)
│   ├── libros/                   # alta, edición, venta, archivar, reactivar (US1, US3, US4, US6)
│   ├── excel/                    # las dos pantallas de importación (US2, US5)
│   ├── historiales/              # consulta y filtros (US7)
│   ├── foto/                     # consulta por foto (US8)
│   ├── actions/                  # Server Actions (borde UI → servicios)
│   └── api/excel/
│       ├── precios/route.ts      # POST — actualización de precios
│       └── alta-masiva/route.ts  # POST — alta masiva
├── domain/                       # reglas puras, sin I/O — el núcleo testeable
│   ├── normalizar-titulo.ts      # ÚNICA normalización (Constitución)
│   ├── casi-coincidencia.ts      # léxico de variantes de edición
│   ├── validar-libro.ts          # validación compartida por todos los flujos
│   ├── precio.ts                 # conversión a entero de moneda (rechaza decimales)
│   ├── categorias-fila.ts        # vocabulario y precedencia de clasificación
│   └── resultado.ts              # Resultado<T> y ErrorNegocio (contrato)
├── db/
│   ├── conexion.ts               # apertura, WAL, foreign_keys
│   ├── esquema.sql               # DDL con UNIQUE y CHECK
│   ├── migraciones.ts
│   └── transaccion.ts            # helper que envuelve dato + historial
├── services/                     # casos de uso transaccionales
│   ├── catalogo.ts               # alta, edición, archivar, reactivar
│   ├── operacion.ts              # venta, cambios de precio y stock
│   ├── importacion-precios.ts    # flujo de precios
│   ├── importacion-alta.ts       # flujo de alta masiva
│   ├── reportes.ts               # persistencia y consulta de reportes
│   ├── busqueda.ts               # texto y archivados
│   ├── historial.ts              # consulta y filtros
│   └── foto.ts                   # embeddings y ranking por coseno
└── excel/
    ├── leer.ts                   # lectura por streaming, detección de columnas
    └── clasificar.ts             # fila cruda → categoría

scripts/
└── sembrar.ts                    # catálogo de prueba de ~2.000 libros (RNF-01)

tests/
├── unit/                         # domain/ — sin base de datos
├── integration/                  # services/ — base en archivo temporal por test
├── helpers/
│   └── db-temporal.ts            # base aislada por test
└── fixtures/
    ├── excel/                    # .xlsx sintéticos por categoría de fila
    └── fotos/                    # set de validación de AC-12
```

**Structure Decision**: proyecto único (Opción 1 del template) adaptado a Next.js full-stack. No se
usa la estructura `backend/` + `frontend/` porque no hay dos despliegues: es un solo proceso Next.js
sirviendo UI y endpoints. El corte que importa no es cliente/servidor sino **`domain/` puro vs
`services/` con I/O**: es lo que permite que el grueso de las reglas se testee primero y sin base de
datos, que es lo que el Principio I necesita para ser practicable.

Los fixtures son parte de la estructura y no un detalle: `tests/fixtures/excel/` materializa las
ocho categorías de fila y `tests/fixtures/fotos/` es el set de validación sin el cual AC-12 no es
comprobable.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Sin violaciones que justificar. Las compuertas de los principios I, II, III y V pasan, y la
constitución no admite justificarlas — se corrigen. La única desviación es de las restricciones
técnicas (elección de librería de Excel) y está justificada arriba, con la cláusula "o similar" de
`AGENTS.md` habilitándola.
