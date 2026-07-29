# Quickstart — Validación de "Manejo de Stock y Precios"

**Feature**: `001-manejo-stock-precios` | **Fecha**: 2026-07-29
**Spec**: [spec.md](./spec.md) | **Contratos**: [contracts/server-actions.md](./contracts/server-actions.md)

Cómo levantar el proyecto y comprobar, historia por historia, que la feature funciona de punta a
punta. No contiene código de implementación: los detalles de cada entidad están en
[data-model.md](./data-model.md) y las firmas en los contratos.

---

## Prerequisitos

- Node.js 20 o superior (necesario para `better-sqlite3` y `onnxruntime-node` precompilados).
- El archivo `.db` **no** se versiona (Principio IV). Se crea al primer arranque.
- La primera consulta por foto descarga el modelo CLIP una vez y lo deja en caché. Requiere red
  **sólo** esa primera vez; después es totalmente offline.

```bash
npm install
npm run dev          # http://localhost:3000
```

Otros comandos:

```bash
npm test             # Vitest, toda la suite
npm run test:watch   # ciclo rojo-verde-refactor
npm run build && npm start
```

---

## Puerta previa: la suite en rojo

Antes de validar nada a mano, el estado esperado según el Principio I es: **tests escritos, en
rojo, antes de la implementación**. La validación manual de abajo recién tiene sentido cuando
`npm test` está en verde.

```bash
npm test
```

---

## Validación por historia

Cada bloque es independiente y se puede correr solo, en el orden de prioridad de la spec.

### US1 · Registrar libros y consultar precio (P1)

1. Dar de alta un libro con título, editorial, stock `3` y precio `12500` (`$125,00`).
2. Buscarlo por una palabra del título → aparece con su precio.
3. Buscarlo por editorial → aparece.
4. Intentar el alta de otro libro con el **mismo título** → rechazado con mensaje.
5. Intentar el alta con el mismo título y **otra editorial** → **también rechazado**: la editorial
   no forma parte de la clave (FR-037, PRD §8). Si esto se acepta, es un bug.
6. Intentar el alta con precio `0` y con stock `-1` → rechazados, sin persistir.
7. Abrir el historial del libro recién creado → tiene **dos** entradas, ambas con origen
   `alta manual`: stock `0 → 3` y precio `0 → 12500` (FR-031).

**Se espera**: la búsqueda responde en menos de 1 segundo (RNF-01). Con un catálogo de prueba de
~2.000 libros, verificable con el escenario de carga de US2.

### US2 · Carga inicial por Excel de alta masiva (P1)

Preparar un `.xlsx` con columnas *libro*, *editorial*, *stock*, *precio* y estas filas a propósito:

| Fila | Contenido | Resultado esperado |
|---|---|---|
| 1 | válida, título nuevo | creada, con sus dos entradas de historial `alta por Excel` |
| 2 | título repetido de la fila 1 | `duplicada_en_archivo` |
| 3 | *stock* vacío | `invalida`, detalle `stock` |
| 4 | *precio* `abc` | `invalida`, detalle `precio` |
| 5 | título de un libro **activo** existente | `duplicada_de_activo`, sin modificar el libro |
| 6 | título de un libro **archivado** | reactivado con los valores de la fila |

1. Subir un archivo **sin** la columna *editorial* → rechazo total, ninguna fila aplicada.
2. Subir el archivo bueno → comprobar que `filasAplicadas + noAplicadas.length = filasTotales`
   (FR-030). Si esa suma no cierra, hay filas descartadas en silencio.
3. Subir un archivo de **5.000 filas** → procesa sin fallar ni truncar (RNF-03, FR-030b).

### US3 · Vender descontando stock (P2)

1. Sobre un libro con stock `3`, marcar vendido → stock `2`.
2. El historial de ventas tiene una entrada con el precio **vigente al momento de vender**.
3. El historial de stock tiene `3 → 2` con origen `venta`, vinculada a esa venta (`venta_id`).
4. Cambiar el precio del libro y volver a mirar la venta anterior → **su precio no cambió**.
5. Llevar el stock a `0` y volver a intentar vender → impedido, sin cambio de stock ni venta.

### US4 · Corregir a mano precio, stock, título y editorial (P2)

1. Cambiar el precio → nuevo valor + entrada de historial con anterior, nuevo y origen
   `edición manual`.
2. Cambiar el stock → ídem en el historial de stock.
3. **Volver a fijar el mismo precio que ya tiene** → se informa "sin cambios" y **no** se agrega
   entrada de historial (FR-027b). Si aparece una entrada con anterior igual a nuevo, es un bug.
4. Corregir un error de tipeo en el título → el libro pasa a ser encontrable por el título nuevo, y
   **no** se escribe ninguna entrada de historial (los renombres no se historizan).
5. Intentar renombrar un libro al título de otro (activo o archivado) → rechazado.

### US5 · Actualización masiva de precios (P2)

Preparar un `.xlsx` con columnas *libro* y *precio*, cubriendo cada categoría:

| Fila | Contenido | Resultado esperado |
|---|---|---|
| 1 | libro activo, precio distinto | aplicada + historial `actualización masiva por Excel` |
| 2 | libro activo, **mismo** precio | `sin_cambio`, sin historial |
| 3 | título inexistente | `sin_coincidencia` |
| 4 | libro **archivado** | `coincide_archivado`, en apartado propio, sin modificar |
| 5 | `"<título> (tapa blanda)"` de un libro activo | `casi_coincidencia`, destacada, **no** aplicada |
| 6 | título repetido de la fila 1 | `duplicada_en_archivo` |

1. Subir el archivo y revisar el reporte: cada fila en su categoría, con cantidad y detalle.
2. **Subir el mismo archivo por segunda vez** → el historial de precio queda **exactamente igual**
   que después de la primera pasada (FR-027b, idempotencia). Es la comprobación más rápida de que
   no se está escribiendo historial sin cambio real.
3. Cerrar el reporte y abrir la consulta de reportes anteriores → el reporte sigue ahí, con el mismo
   contenido, sin opción de editarlo ni borrarlo (FR-036).

### US6 · Archivar y reactivar (P3)

1. Archivar un libro activo → desaparece de la búsqueda por texto y de la consulta por foto; su
   historial sigue accesible.
2. Abrirlo en la consulta de archivados → aparece ahí, y no aparecen los activos.
3. Reactivarlo fijando stock y precio → vuelve a las búsquedas, con dos entradas de historial de
   origen `reactivación` (no `edición manual`).
4. **Reactivar fijando exactamente el mismo stock y precio que ya tenía** → las dos entradas se
   escriben **igual**. Es la única excepción a FR-027b; si no aparecen, es un bug.
5. Intentar dar de alta un libro con el título de uno archivado → rechazado, con la opción de
   reactivar ese libro ofrecida en el mensaje.

### US7 · Historiales y filtros (P3)

1. Abrir cada historial (precio, stock, ventas) → cada registro muestra su fecha y sus valores:
   ventas el precio de venta; precio el anterior, el nuevo y el origen; stock la cantidad anterior,
   la resultante y el origen.
2. Filtrar por rango de fechas, por título y por editorial → recorta correctamente.
3. Mirar el historial de un libro archivado → sus registros siguen apareciendo.
4. Mirar las dos entradas que generó un alta (mismo milisegundo) → aparecen en orden estable
   (desempate por `id`, R6).

### US8 · Búsqueda por foto (P3)

Requiere un **set de validación**: al menos 20 libros activos con foto cargada, más una foto de
consulta distinta de cada uno (otra toma, no la misma imagen).

1. Consultar con la foto de un libro del set → devuelve una **lista** de candidatos ordenada por
   similitud.
2. **AC-12**: el libro correcto aparece entre los 5 primeros, en menos de 3 segundos (RNF-02).
3. Consultar con la foto de algo que no está en el catálogo → informa que no encontró candidatos, y
   **no** devuelve un libro arbitrario.
4. Consultar con la foto de un libro archivado → no aparece entre los candidatos.

> **Esta es la validación con riesgo real.** La elección de librería (R1) es la única decisión del
> plan cuyo resultado no se puede garantizar por análisis. Si el paso 2 falla sobre el set de
> validación, la escalera de remedios está en
> [research.md § R1](./research.md#r1--búsqueda-por-foto-rf-11-rnf-02-ac-12) — no se da por buena
> la elección hasta que ese paso pase.

---

## Comprobaciones transversales

Independientes de cualquier historia, son los invariantes que la constitución no negocia:

| Comprobación | Cómo |
|---|---|
| **Ningún stock ni precio sin historial** (Principio III) | Para cada libro, la última entrada de cada historial debe coincidir con el valor vigente del libro |
| **Historial append-only** (FR-028) | No existe ninguna operación de UI ni de servicio que borre o edite entradas |
| **Ningún libro borrado** (FR-028) | No existe `DELETE` sobre `libro` en el código |
| **Reporte completo** (FR-030) | `filasAplicadas + noAplicadas.length = filasTotales` en toda importación |
| **Una sola normalización** (Constitución) | `normalizarTitulo` tiene una única implementación y todos los flujos la usan |
| **Sin secretos ni datos del negocio** (Principio IV) | `git status` limpio de `*.db`, `*.xlsx` y `.env` antes de cada commit |

---

## Riesgo sin cobertura, por decisión

**No hay resguardo de datos**: ni backup automático, ni exportación, ni restauración (PRD §7, riesgo
asumido). Corolario práctico durante la validación: una carga masiva mal procesada **no tiene
deshacer**. Conviene copiar el `.db` a mano antes de probar los flujos de Excel contra datos que
importen.
