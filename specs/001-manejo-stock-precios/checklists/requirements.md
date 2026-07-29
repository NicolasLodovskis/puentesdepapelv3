# Specification Quality Checklist: Manejo de Stock y Precios — Puentes de Papel

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-29
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Iteración 1

**Corregido**: *Success criteria are measurable* — SC-003 no declaraba población de medición y
SC-008 no era verificable ("0 precios corregidos a mano por sorpresa"). Ambos reescritos con
población y umbral verificables.

**Fallaba**: *No [NEEDS CLARIFICATION] markers remain* — 2 marcadores de alcance, ambos por
conflicto real entre el PRD-001 y la constitución v1.0.0, no por falta de un default. Elevados
al usuario como Q1 y Q2.

### Iteración 2 — todos los ítems en verde

Q1 y Q2 resueltos por el usuario (Q1: A, Q2: B). Al elegir ampliar el alcance en los dos casos,
el Principio V obligó a **enmendar el PRD-001 antes de tocar la spec**:

- **PRD RF-13 / RF-14**: se agregó "alta manual" a la enumeración de orígenes de historial.
- **PRD RF-23 / RF-24** (nuevos): edición de título y editorial, con rechazo por colisión de
  título normalizado contra un libro activo.
- **PRD AC-22 / AC-23 / AC-24** (nuevos): criterios binarios para lo anterior.
- **PRD**: fila "Última enmienda" con fecha y detalle. El PRD pasa de 22 RF/21 AC a
  **24 RF / 24 AC**.

Cambios resultantes en la spec: US1 escenario 6 (historial inicial del alta manual); US4
retitulada a "Corregir a mano los datos de un libro" con escenarios 4-6; FR-022 y FR-023 con el
origen "alta manual"; **FR-031, FR-032, FR-033** nuevos; dos supuestos nuevos sobre las
decisiones de detalle que Q2 dejaba abiertas.

**Decisiones de detalle tomadas dentro de Q2** (documentadas como supuestos en spec.md, no
preguntadas de nuevo por tener un default defendible):

- Corregir título o editorial **no** escribe historial: la trazabilidad obligatoria del
  Principio III cubre stock y precio, y el PRD no pide historial de datos descriptivos.
- La colisión al editar un título se rechaza sólo contra libros **activos**, replicando RF-17.

### Trazabilidad verificada

Los **24 RF** del PRD-001 enmendado están cubiertos por los **33 FR** de la spec:

| RF | FR | RF | FR |
|---|---|---|---|
| RF-01 | FR-001, FR-002, FR-031 | RF-13 | FR-023 |
| RF-02 | FR-007 | RF-14 | FR-022 |
| RF-03 | FR-008 | RF-15 | FR-025 |
| RF-04 | FR-011, FR-028 | RF-16 | FR-026 |
| RF-05 | FR-009, FR-010 | RF-17 | FR-004 |
| RF-06 | FR-012 | RF-18 | FR-016 |
| RF-07 | FR-003, FR-013 | RF-19 | FR-017 |
| RF-08 | FR-014, FR-030 | RF-20 | FR-018 |
| RF-09 | FR-015 | RF-21 | FR-019, FR-030 |
| RF-10 | FR-005 | RF-22 | FR-021 |
| RF-11 | FR-006 | RF-23 | FR-032 |
| RF-12 | FR-009, FR-024 | RF-24 | FR-033 |

Sin FR huérfanos: FR-020 traza a PRD §7 (fuera de alcance) y FR-027 a FR-029 a los principios
II y III de la constitución.

### Iteración 3 — sesión de `/speckit-clarify` (2026-07-29)

Cinco preguntas respondidas e integradas. El checklist se mantiene en **16/16**: ninguna casilla
cambió de estado, porque la spec ya cumplía todos los ítems y las clarificaciones profundizaron
requerimientos existentes en vez de abrir huecos nuevos.

Enmiendas al PRD que salieron de esta sesión — el PRD pasa de 24 RF / 24 AC a
**26 RF / 3 RNF / 27 AC**:

| # | Clarificación | Cambio en el PRD |
|---|---|---|
| 1 | Unicidad global del título normalizado | RF-17, RF-24, AC-15, AC-24 reformulados a "activo o archivado" |
| 2 | Reactivación manual de archivados | RF-25, RF-26, AC-25, AC-26 nuevos |
| 3 | Resguardo de datos fuera de alcance | §7 y la mitigación de §8; SC-007 de la spec reformulado |
| 4 | Sin cambio ⇒ sin historial | RF-13 y RF-14 con la cláusula de no-cambio; AC-27 nuevo |
| 5 | Volumen de referencia | RNF-01 y RNF-02 con la escala; **RNF-03** nuevo (5.000 filas) |

**Supera lo dicho en la Iteración 2**: la nota de iteración 2 decía que la colisión al editar un
título se rechazaba *sólo contra libros activos*. La clarificación 1 lo cambió: ahora la
unicidad es global (activos + archivados), en FR-004 y FR-033. La otra decisión de la iteración
2 (corregir título o editorial no escribe historial) sigue vigente.

**FR nuevos en la spec** (de 33 a 37): FR-034 y FR-035 (consulta de archivados y reactivación
manual), FR-027b (sin cambio ⇒ sin historial) y FR-030b (5.000 filas). Trazas nuevas:
RF-25→FR-034, RF-26→FR-035, RNF-03→FR-030b; RF-13/RF-14 ganan FR-027b.

**Riesgo aceptado explícitamente**: sin resguardo de datos en el sistema, una corrupción del
archivo `.db` pierde inventario e historiales. Registrado en PRD §7 y en "Fuera de Alcance" de
la spec, no como omisión.

### Cobertura por historia

Las 8 historias cubren los 26 RF sin solapamiento de responsabilidad: US1 (RF-01, RF-10,
RF-17), US2 (RF-18, RF-19, RF-21, RF-22), US3 (RF-05, RF-12, RF-13), US4 (RF-02, RF-03, RF-23,
RF-24), US5 (RF-06 a RF-09, RF-14, RF-22), US6 (RF-04, RF-20, **RF-25, RF-26**), US7 (RF-15,
RF-16), US8 (RF-11). Los RNF son transversales: RNF-01→US1, RNF-02→US8, RNF-03→US2 y US5.
