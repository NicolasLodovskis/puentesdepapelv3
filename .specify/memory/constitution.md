<!--
Sync Impact Report
==================
Version change: TEMPLATE (sin versionar) → 1.0.0
Bump rationale: Ratificación inicial. El archivo estaba sin completar (sólo placeholders);
  se definen 5 principios y 2 secciones normativas por primera vez → MAJOR inicial 1.0.0.

Principios definidos (antes placeholders):
- [PRINCIPLE_1_NAME] → I. Test-First (NO NEGOCIABLE)
- [PRINCIPLE_2_NAME] → II. El Sistema Nunca Inventa Datos
- [PRINCIPLE_3_NAME] → III. Trazabilidad Total (NO NEGOCIABLE)
- [PRINCIPLE_4_NAME] → IV. Cero Secretos en el Código
- [PRINCIPLE_5_NAME] → V. Alcance Anclado al PRD Vigente

Secciones agregadas:
- [SECTION_2_NAME] → Restricciones Técnicas
- [SECTION_3_NAME] → Flujo de Desarrollo y Puertas de Calidad
- Governance completada.

Secciones removidas: ninguna.

Templates y artefactos dependientes:
- ✅ .specify/templates/plan-template.md — "Constitution Check" reemplazado por las 5 puertas concretas
- ✅ .specify/templates/spec-template.md — trazabilidad al PRD y prohibición de datos inventados
- ✅ .specify/templates/tasks-template.md — tests pasan de OPCIONALES a OBLIGATORIOS y primero (Principio I)
- ✅ AGENTS.md — referencia a la constitución agregada
- ⚠ .specify/templates/checklist-template.md — genérico, sin referencias a principios; no requiere cambios
- N/A .specify/templates/commands/*.md — el directorio no existe en este repo
- N/A README.md / docs/quickstart.md — no existen en este repo

Follow-up TODOs: ninguno. No quedan placeholders sin resolver.
-->

# Puentes de Papel Constitution

## Core Principles

### I. Test-First (NO NEGOCIABLE)

Los tests se escriben ANTES que la implementación, sin excepciones. El ciclo es
rojo-verde-refactor y se respeta en ese orden:

- Escribir el test que expresa el comportamiento esperado.
- Ejecutarlo y verificar que FALLA por la razón correcta (rojo). Un test que pasa antes
  de existir la implementación es un test inválido y MUST reescribirse.
- Escribir la implementación mínima que lo hace pasar (verde).
- Refactorizar con los tests en verde.

Cada Requerimiento Funcional del PRD MUST tener al menos un test automatizado derivado de
su Criterio de Aceptación. Ninguna tarea de implementación se marca como completa si su
test no existía antes del código. Los tests corren con Vitest (`npm test`).

**Rationale**: es un sistema de un solo usuario sin QA externo ni segundo par de ojos. El
test escrito primero es la única especificación ejecutable que impide que un cambio de
precios o de stock rompa datos reales de la librería sin que nadie lo note.

### II. El Sistema Nunca Inventa Datos

El sistema MUST NOT crear, completar, adivinar ni estimar datos que el usuario no ingresó
o que no están en la fuente procesada:

- Un campo ausente o inválido en un Excel es un error reportado, NUNCA un valor por
  defecto silencioso.
- Una coincidencia dudosa de título NUNCA se resuelve automáticamente: se reporta como
  casi-coincidencia para decisión humana.
- La búsqueda por foto devuelve candidatos ordenados por similitud, NUNCA una única
  respuesta presentada como certeza.
- Ante ambigüedad, el sistema informa y no modifica datos. No modificar es siempre
  preferible a modificar mal.

**Rationale**: los datos son el inventario y los precios de un negocio real. Un dato
inventado se propaga a una venta con precio equivocado y no hay forma de distinguirlo de
un dato correcto a posteriori.

### III. Trazabilidad Total (NO NEGOCIABLE)

Todo movimiento de stock y todo cambio de precio MUST quedar registrado en su historial,
desde el alta del libro en adelante. Concretamente:

- Toda escritura que altere stock registra: fecha, cantidad anterior, cantidad resultante
  y origen del cambio.
- Toda escritura que altere precio registra: fecha, precio anterior, nuevo precio y origen
  del cambio.
- El alta de un libro genera su entrada inicial de historial de stock y de precio: no
  existe stock ni precio sin origen conocido.
- Las bajas son SIEMPRE lógicas. El borrado físico de libros y el borrado o la edición de
  entradas de historial están PROHIBIDOS.
- La escritura del dato y la escritura de su historial MUST ocurrir en la misma
  transacción: si falla el historial, falla el cambio.

**Rationale**: la trazabilidad es un objetivo explícito del PRD, no una feature opcional.
Sin historial completo desde el alta es imposible reconstruir por qué un precio o un stock
tiene el valor que tiene, y una actualización masiva por Excel mal aplicada se vuelve
irreversible.

### IV. Cero Secretos en el Código

El código fuente MUST NOT contener credenciales, tokens, claves de API ni rutas absolutas
de máquinas específicas. La configuración variable se resuelve por variables de entorno o
archivos de configuración locales excluidos del control de versiones. Los archivos de base
de datos (`*.db`) y los Excel reales del negocio NUNCA se commitean.

**Rationale**: aunque el sistema es local y sin autenticación, el repositorio es histórico
y público en potencia; un secreto commiteado no se borra con un commit posterior.

### V. Alcance Anclado al PRD Vigente

No se agrega ninguna feature que no esté en el PRD vigente. Si algo parece necesario y no
está en el PRD, la secuencia MUST ser: enmendar el PRD primero, después implementar. Está
explícitamente fuera de alcance y MUST NOT implementarse: tienda virtual o compra por
parte de clientes, facturación fiscal, autenticación / login / roles / multiusuario,
borrado físico de libros, y alta de libros desde el flujo de actualización de precios.

**Rationale**: es un sistema para una sola persona con una necesidad acotada. Cada feature
no pedida es superficie que hay que testear, mantener y que puede corromper datos, sin
entregar valor a la única usuaria.

## Restricciones Técnicas

Estas restricciones son vinculantes y MUST NOT cambiarse sin enmienda constitucional:

- **Stack**: Next.js (App Router) full-stack — UI + API Routes / Server Actions —,
  TypeScript y React.
- **Persistencia**: SQLite embebida vía `better-sqlite3`, un único archivo `.db` local, sin
  servidor de base de datos. No se reemplaza por otro motor.
- **Excel**: dos flujos SEPARADOS y no intercambiables — actualización de precios
  (columnas *libro*, *precio*) y alta masiva (columnas *libro*, *editorial*, *stock*,
  *precio*).
- **Normalización de títulos**: la comparación de títulos usa una única función de
  normalización compartida (minúsculas, sin acentos, sin puntuación, ignorando el orden del
  artículo). MUST NOT existir una segunda implementación divergente.
- **Tests**: Vitest.
- **Mono-usuario**: sin autenticación por decisión explícita. No se agrega capa de sesión,
  usuarios ni permisos.
- **Rendimiento**: búsqueda por nombre/editorial < 1 s (p95); búsqueda por foto < 3 s (p95).
  Estos límites se verifican, no se asumen.

## Flujo de Desarrollo y Puertas de Calidad

- **Orden de trabajo**: PRD → spec → plan → tasks → implementación. Ninguna implementación
  arranca sin tarea trazable a un RF del PRD.
- **Puerta de test (Principio I)**: una tarea de implementación sólo puede iniciarse si su
  test existe y falla. `npm test` MUST estar en verde antes de considerar completa
  cualquier tarea o de commitear.
- **Puerta de trazabilidad (Principio III)**: toda revisión de un cambio que escriba stock
  o precio MUST verificar que existe su entrada de historial y su test correspondiente.
- **Puerta de alcance (Principio V)**: todo cambio se rechaza si implementa algo que no
  mapea a un RF del PRD vigente.
- **Manejo de errores**: los flujos de Excel reportan siempre cantidad y motivo de cada
  fila omitida o no aplicada. Fallar en silencio está prohibido.
- **Commits**: se commitea por tarea o grupo lógico, con el código y sus tests juntos.

## Governance

Esta constitución tiene precedencia sobre cualquier otra práctica, preferencia de estilo o
conveniencia de implementación. Ante conflicto entre esta constitución y otra guía del
repositorio, manda la constitución.

**Procedimiento de enmienda**: toda enmienda MUST (1) documentarse en este archivo, (2)
declararse en el Sync Impact Report del encabezado, (3) propagarse a los templates y guías
dependientes en el mismo cambio, y (4) ser aprobada por la propietaria del producto. Una
enmienda que amplía el alcance funcional MUST ir precedida por la actualización del PRD.

**Política de versionado** (semver):

- **MAJOR**: se remueve o redefine un principio de forma incompatible con lo anterior.
- **MINOR**: se agrega un principio o sección, o se expande materialmente una guía.
- **PATCH**: aclaraciones, redacción, correcciones sin cambio semántico.

**Revisión de cumplimiento**: cada plan de feature ejecuta el "Constitution Check" del
`plan-template.md` antes de la Fase 0 y lo re-verifica después de la Fase 1. Las
violaciones que no puedan eliminarse se documentan en "Complexity Tracking" con
justificación y la alternativa más simple descartada; los Principios I, II, III y V no
admiten justificación de violación — se corrigen. Para guía operativa de día a día
(comandos, estructura, stack) ver `AGENTS.md`.

**Version**: 1.0.0 | **Ratified**: 2026-07-29 | **Last Amended**: 2026-07-29
