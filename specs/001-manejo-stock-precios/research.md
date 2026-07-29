# Phase 0 — Research: Manejo de Stock y Precios

**Feature**: `001-manejo-stock-precios` | **Fecha**: 2026-07-29
**Spec**: [spec.md](./spec.md) | **Constitución**: [v1.0.0](../../.specify/memory/constitution.md)

Resuelve la única dependencia técnica sin definir del PRD (búsqueda por foto) y fija las
decisiones que la spec dejó deliberadamente abiertas por ser de implementación. Cada decisión
que **no** agrega alcance funcional se toma acá; las que lo agregarían quedan listadas al final
como pendientes de enmienda del PRD (Principio V).

---

## R1 — Búsqueda por foto (RF-11, RNF-02, AC-12)

**Decision**: **embeddings de imagen locales con Transformers.js (`@huggingface/transformers`,
modelo CLIP `Xenova/clip-vit-base-patch32`) ejecutado vía `onnxruntime-node`, más similitud
coseno por fuerza bruta sobre los vectores guardados en SQLite.**

- Al cargar la foto de un libro se calcula su embedding (512 floats) y se guarda como `BLOB`.
- Al consultar por foto se calcula el embedding de la consulta y se rankea contra todos los
  vectores de libros **activos** con coseno.
- Se devuelven los N mejores como candidatos ordenados (FR-006), nunca una única respuesta.

**Umbral de similitud**: se descartan los candidatos con coseno **< 0,75**, y si no queda ninguno
la consulta devuelve lista vacía en lugar de un libro arbitrario (US8 esc. 3, FR-029). El valor es
un punto de partida, no una constante sagrada: vive en un único módulo, y **T091 lo calibra contra
el set de validación** buscando el número que maximice los aciertos de AC-12 sin dejar entrar
candidatos absurdos cuando la foto no está en el catálogo. Sin un umbral explícito, el test de
"foto ajena → lista vacía" no sería falsable, porque el coseno siempre devuelve *algo* como mejor
resultado.

**Rationale**:

- **Cabe holgado en el presupuesto de RNF-02 (<3 s p95)**: el costo real es un único forward
  pass del modelo sobre la foto de consulta (cientos de ms en CPU). El ranking es trivial:
  2.000 vectores × 512 floats = ~4 MB, y un barrido de coseno sobre eso es sub-milisegundo. No
  hace falta índice vectorial ni extensión de SQLite.
- **Robusto a las condiciones reales de uso**: la librera fotografía un libro físico con el
  celular — luz, ángulo, perspectiva y fondo cambian entre la foto del alta y la de consulta.
  Los embeddings toleran eso; el hashing perceptual no.
- **100% local y offline**: el modelo se descarga una vez y queda en caché. No hay servicio
  externo, coherente con un sistema mono-usuario de escritorio.
- **Degrada bien**: si el ranking no alcanza AC-12 con el set de validación, se puede sumar una
  segunda señal (ver alternativa OCR) sin rehacer el diseño.

**Alternatives considered**:

| Alternativa | Por qué se descartó |
|---|---|
| **Hashing perceptual** (dHash/pHash con `sharp` o `image-hash`) | Muchísimo más liviano y sin modelo, pero está diseñado para reconocer *la misma imagen* re-comprimida, no el mismo objeto fotografiado de nuevo. Frágil ante perspectiva, recorte, reflejos y fondo — exactamente el caso de uso. Se rechaza como mecanismo primario. |
| **OCR del título** (`tesseract.js`) y reuso de la búsqueda de texto | Elegante porque reusa FR-003/FR-005, pero el OCR sobre tipografías de tapa estilizadas y fotos con ángulo es poco confiable. **Queda como señal secundaria** si AC-12 no se alcanza con embeddings solos. |
| **Feature matching clásico** (ORB/SIFT vía `opencv4nodejs`) | Muy robusto a perspectiva, pero es una dependencia nativa pesada y de instalación frágil, y sin índice hay que comparar contra 2.000 imágenes: no entra en <3 s. |
| **API de visión en la nube** | Prohibido por diseño: el PRD pide librería **local**, y agregaría un secreto de API contra el Principio IV. |

**Riesgo abierto**: es la única decisión del plan con incertidumbre real de resultado. **AC-12
(el libro correcto entre los 5 primeros) es la compuerta**, y sólo se puede evaluar con un set
de validación de fotos reales. Mitigación: implementar US8 al final (ya es P3) y construir el
set de validación antes de dar por buena la elección. Si falla, la escalera es: subir a
`clip-vit-base-patch16` → sumar la señal de OCR → recortar automáticamente la tapa antes del
embedding.

---

## R2 — Lectura de archivos Excel (RF-06, RF-18, RNF-03)

**Decision**: **`exceljs`**, con lectura por streaming para los archivos grandes.

**Rationale**:

- `AGENTS.md` especifica *"librería `xlsx` o similar"*, así que la elección concreta está
  permitida y es del plan.
- `exceljs` se publica y mantiene en npm de forma normal. La versión de SheetJS disponible en
  npm (`xlsx@0.18.5`) está congelada y arrastra advisories conocidos; las versiones corregidas
  se distribuyen fuera de npm (CDN propio), lo que complica un `npm install` reproducible.
- Tiene lector por streaming, útil para el techo de 5.000 filas de RNF-03 sin cargar todo el
  libro en memoria.
- Sólo se necesita **lectura** de `.xlsx`: no hace falta escribir ni dar formato.

**Alternatives considered**: `xlsx` (SheetJS) — descartada por el punto de distribución/advisories
de arriba, no por capacidad. `node-xlsx` — envoltorio sobre SheetJS, hereda el problema.

---

## R3 — Normalización de títulos (FR-003; cierra CHK002, CHK003, CHK006)

**Decision**: una única función pura `normalizarTitulo(titulo: string): string`, con estos pasos
en este orden:

1. Normalización Unicode **NFD** y eliminación de marcas diacríticas → quita acentos y diéresis.
2. Reemplazo de comillas y guiones tipográficos por sus equivalentes ASCII.
3. `toLowerCase()`.
4. Eliminación de todo carácter que no sea alfanumérico o espacio — **los paréntesis se eliminan
   pero su contenido se conserva como palabras**.
5. Colapso de espacios múltiples y recorte de extremos.
6. **Manejo del artículo**: si el título termina en `, <artículo>` se lo quita de ahí; y si
   empieza con un artículo, también se lo quita. Conjunto cerrado de artículos (español):
   `el, la, los, las, lo, un, una, unos, unas`.

**Consecuencias verificables**:

- `"El Principito"` → `principito`; `"Principito, El"` → `principito`. Coinciden (FR-004).
- `"El Principito (tapa blanda)"` → `principito tapa blanda`. **No** coincide con `principito`,
  y por eso la lógica de casi-coincidencia (R4) es alcanzable — si el paso 4 borrara el
  contenido del paréntesis, ambos normalizarían igual y FR-015 nunca podría dispararse.

**Rationale**: quitar el artículo es más simple e **idempotente** que reordenarlo, y cubre las
dos formas en que aparece en catálogos ("El X" y "X, El"). Fijar un conjunto cerrado de artículos
lo hace determinista y testeable, en vez de depender de heurística.

**Riesgo aceptado**: quitar el artículo inicial hace colisionar `"La Casa"` con `"Casa"`. Es la
consecuencia buscada de la regla; se documenta para que no se lea como bug.

**Alternatives considered**: reordenar el artículo al frente en vez de quitarlo (deja dos formas
normalizadas distintas para el mismo libro, no sirve como clave); usar sólo `localeCompare` con
`sensitivity: 'base'` (resuelve acentos y mayúsculas pero no puntuación ni artículos, y no
produce una cadena almacenable como clave).

---

## R4 — Detección de casi-coincidencias (FR-015; cierra CHK005)

**Decision**: una fila es **casi-coincidencia** de un libro activo cuando, comparando sus títulos
normalizados como listas de palabras, **una es superconjunto de la otra por palabras completas**
y **todas las palabras extra pertenecen a un léxico cerrado de variantes de edición**.

- Léxico inicial: `tapa, blanda, dura, rustica, bolsillo, ilustrada, ilustrado, edicion,
  aniversario, version, comentada, anotada, bilingue, revisada, ampliada`.
- El léxico vive en un único módulo de dominio, versionado con el código.
- La compuerta de aceptación es el **set de ejemplos** de AC-10, implementado como tabla de
  casos en los tests.

**Rationale**: convierte *"comparte el núcleo del título difiriendo sólo en variantes de
edición"* en un predicado determinista y binario, sin umbral difuso ni criterio humano — que es
justo lo que CHK005 marcaba como no medible. También evita distancias tipo Levenshtein, que
producirían falsos positivos entre títulos legítimamente distintos y cuyo umbral sería un número
arbitrario imposible de justificar.

**Alternatives considered**: distancia de Levenshtein o trigramas con umbral (rechazado: umbral
arbitrario, falsos positivos entre libros distintos, no auditable); detectar sólo texto entre
paréntesis (rechazado: el paso 4 de R3 ya perdió los paréntesis, y las variantes también
aparecen sin ellos).

**Nota de alcance**: la función se implementa una sola vez, pero **se conecta únicamente al flujo
de actualización de precios**, que es donde FR-015 la exige. Ver "Pendientes" (CHK010).

---

## R5 — Representación del precio (cierra CHK013)

**Decision**: **entero de centavos** (`INTEGER` en SQLite), con dos decimales de precisión.
Conversión a/desde string sólo en los bordes (UI y lectura de Excel), nunca aritmética en punto
flotante sobre dinero.

**Rationale**: `precio > 0` no acotaba precisión ni redondeo. Guardar centavos elimina de raíz el
error de representación de `REAL` (0.1 + 0.2), hace exacta la comparación de FR-027b
("precio igual al vigente ⇒ sin historial") y hace exacta la copia del precio vigente a la venta
(FR-009). El redondeo se define una sola vez: la lectura de Excel redondea a centavo más cercano
y rechaza lo que no sea numérico.

**Alternatives considered**: `REAL` (rechazado: comparación por igualdad inexacta rompe FR-027b);
`TEXT` decimal con una librería de decimales (rechazado: complejidad innecesaria para importes de
librería, y comparaciones más lentas).

---

## R6 — Fecha/hora del historial y orden (cierra CHK018, CHK019)

**Decision**: guardar cada marca temporal como **`TEXT` en ISO-8601 con milisegundos en UTC**
(`YYYY-MM-DDTHH:MM:SS.sssZ`); mostrar y filtrar en la zona local de la máquina. El **orden de los
historiales es por marca temporal y, ante empate, por `id` autoincremental ascendente**.

**Rationale**: la spec pedía historial con "fecha" sin precisar precisión ni zona, y de eso
dependen tanto el filtro por fecha (FR-026) como el orden de registros. ISO-8601 en UTC ordena
lexicográficamente igual que cronológicamente, lo que hace el `ORDER BY` trivial y correcto en
SQLite sin tipo `DATE` nativo. El desempate por `id` resuelve el caso de las dos entradas que un
alta escribe en la misma transacción (stock y precio), que comparten milisegundo.

**Alternatives considered**: epoch en `INTEGER` (equivalente en corrección, pero ilegible al
inspeccionar el `.db` a mano, que es un modo de diagnóstico esperable en un sistema de un archivo);
guardar hora local sin zona (rechazado: ambiguo en los cambios de horario y no ordenable de forma
confiable).

---

## R7 — Atomicidad de dato + historial (FR-027, Principio III)

**Decision**: cada caso de uso que escribe stock o precio se ejecuta dentro de una
**transacción sincrónica de `better-sqlite3`** (`db.transaction(...)`), que envuelve la
actualización del libro y la inserción de sus entradas de historial. La base se abre con
`PRAGMA journal_mode = WAL` y `PRAGMA foreign_keys = ON`.

Para los flujos de Excel: **una transacción por fila**, no una por archivo.

**Rationale**: `better-sqlite3` es sincrónico, así que una transacción es un bloque de código sin
`await` en el medio — no hay riesgo de intercalado y el invariante "si falla el historial, no se
aplica el cambio" se cumple por construcción. La granularidad por fila implementa literalmente el
caso borde de la spec ("cada fila se aplica de forma completa o no se aplica") y evita que un
archivo de 5.000 filas mantenga una transacción abierta con toda la carga adentro. `foreign_keys`
garantiza que no exista historial huérfano.

**Alternatives considered**: una transacción por archivo (rechazado: contradice el caso borde de
atomicidad por fila y hace que un solo error tire abajo una carga inicial entera); triggers de
SQLite que escriban el historial (rechazado: esconde la regla de negocio fuera del código
testeable y vuelve invisible el invariante en los tests de Vitest).

---

## R8 — Forma de la aplicación Next.js

**Decision**: App Router con **Server Actions** para todas las mutaciones (alta, edición, venta,
archivar, reactivar) y un **Route Handler** (`POST`) para la subida de los dos tipos de Excel. La
lógica de negocio vive en `src/services/` (casos de uso transaccionales) y las reglas puras en
`src/domain/`; ni la UI ni las acciones tocan SQL directamente.

**Rationale**: las Server Actions evitan diseñar y versionar una API REST que nadie más va a
consumir — es una app mono-usuario de un solo proceso. La subida de archivo se hace por Route
Handler porque necesita recibir `multipart/form-data` y devolver un reporte estructurado. Separar
`domain/` puro permite que la normalización, la casi-coincidencia y las validaciones se testeen
con Vitest sin base de datos, que es donde vive la mayor densidad de reglas y de tests.

**Alternatives considered**: API REST completa bajo `app/api/` (rechazada: superficie y
versionado sin consumidor); lógica dentro de los componentes (rechazada: imposible de testear
primero, choca con el Principio I).

---

## Pendientes que el plan NO puede resolver

Requieren decisión de producto y enmienda del PRD (Principio V). No bloquean el arranque de la
implementación, pero sí bloquean las historias que tocan:

**Ninguno.** Las cinco cuestiones que esta sección listaba como pendientes de enmienda del PRD se
resolvieron después de escribir este documento:

| Ítem | Decisión | Enmienda |
|---|---|---|
| CHK007 / CHK008 | Precedencia de clasificación: `invalida` → `duplicada_en_archivo` (posicional) → catálogo | RF-28, AC-30, AC-31 |
| CHK009 | Categorías mutuamente excluyentes; casi-coincidencia de archivado → `coincide_archivado` | RF-08, AC-32 |
| CHK010 | En alta masiva sólo coincidencia **exacta**: una variante de edición es un **libro nuevo** | RF-19, AC-33 |
| CHK024 / CHK025 | Sobre un archivado: no stock, no precio, no venta; sí título, editorial y reactivación | RF-29, AC-34, AC-35 |
| CHK012 | Encabezados: primera hoja, primera fila no vacía, sin sinónimos, columna repetida = rechazo | RF-30, AC-36, AC-37 |

Ninguna historia se implementa sobre un supuesto sin respaldo en el PRD. El único riesgo abierto del
plan sigue siendo el de **R1** (búsqueda por foto), que es técnico y no de producto.
