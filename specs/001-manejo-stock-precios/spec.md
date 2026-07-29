# Feature Specification: Manejo de Stock y Precios — Puentes de Papel

**Feature Branch**: `main` (repositorio local sin flujo de PR; ver Assumptions)

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: "@PRD.md" — PRD-001: Manejo de Stock — Puentes de Papel. Partió de 22 RF / 2 RNF / 21 AC; tras las enmiendas de `/speckit-clarify`, del checklist de integridad y de la definición de precedencia, el PRD vigente tiene **30 RF / 3 RNF / 37 AC**

## Clarifications

### Session 2026-07-29

- Q: El título normalizado, ¿debe ser único sólo entre libros activos o en todo el catálogo? → A: Unicidad global (activos + archivados); al chocar con un archivado se informa y se ofrece reactivarlo. PRD RF-17/RF-24 y AC-15/AC-24 enmendados.
- Q: ¿Se puede reactivar un libro archivado a mano, o sólo por Excel de alta masiva? → A: Reactivación manual explícita, fijando stock y precio, con historial de origen **"reactivación"** y escrito siempre, incluso si los valores no cambian; también accesible desde el rechazo del alta duplicada. PRD RF-25/RF-26 y AC-25/AC-26 nuevos. *(El origen y la excepción a FR-027b se precisaron al resolver CHK016/CHK017 del checklist de integridad.)*
- Q: ¿El sistema debe resguardar la base (backup automático o exportación)? → A: Fuera de alcance; resguardar el archivo es responsabilidad de la usuaria, como riesgo asumido. SC-007 reformulado a lo que el sistema sí garantiza (no borra nada) y el límite agregado a PRD §7.
- Q: Si una fila de Excel trae el mismo precio que el vigente, ¿se escribe historial? → A: No; no es un cambio. La fila se informa como coincidente "sin cambio" y reprocesar el archivo es idempotente. Regla general para stock y precio en PRD RF-13/RF-14, con AC-27 nuevo.
- Q: ¿Cuál es el volumen de referencia para verificar los tiempos de respuesta? → A: Catálogo de ~2.000 libros y archivos Excel de hasta 5.000 filas. Anclado en PRD RNF-01/RNF-02 y en el nuevo RNF-03.

## User Scenarios & Testing *(mandatory)*

Actor único en todas las historias: **la librera** (dueña de "Puentes de Papel", única
usuaria, un único acceso local sin autenticación).

### User Story 1 - Registrar libros y consultar su precio (Priority: P1)

La librera carga un libro con su título, editorial, foto (opcional), cantidad en stock y
precio. Después, cuando un cliente le pregunta cuánto sale un libro, lo busca por nombre o
por editorial y ve el precio en pantalla.

**Why this priority**: es el corte mínimo que entrega valor por sí solo. Sin libros
cargados y consultables no hay nada que vender, actualizar ni historizar; todas las demás
historias operan sobre este catálogo.

**Independent Test**: se prueba completo cargando un libro por el formulario de alta y
buscándolo después por nombre y por editorial, verificando que aparece con su precio. No
requiere ninguna otra historia.

**Acceptance Scenarios**:

1. **Dado** un formulario con título y editorial no vacíos, stock entero ≥ 0 y precio > 0,
   **cuando** la librera confirma el alta, **entonces** el libro queda persistido y es
   recuperable en una consulta posterior.
2. **Dado** un formulario donde el título o la editorial están vacíos, el stock no es un
   entero ≥ 0, o el precio no es > 0, **cuando** la librera confirma el alta, **entonces**
   el sistema la rechaza con un mensaje que indica el campo inválido y no persiste el libro.
3. **Dado** un libro existente cuyo título normalizado es T —esté activo o archivado—,
   **cuando** la librera intenta dar de alta otro libro cuyo título también normaliza a T,
   **entonces** el sistema lo impide con un mensaje y no crea el segundo libro; y si el
   coincidente está archivado, el mensaje lo indica y ofrece reactivarlo.
4. **Dado** uno o más libros activos cargados, **cuando** la librera busca por nombre o por
   editorial, **entonces** el sistema devuelve los libros coincidentes con su precio.
5. **Dado** un libro cargado con foto, **cuando** la librera lo consulta, **entonces** la
   foto queda asociada al libro; y **dado** un alta sin foto, **entonces** el alta se acepta
   igual (la foto es opcional).
6. **Dado** un libro cargado con título T y editorial E1, **cuando** la librera intenta dar de
   alta otro libro con el mismo título T y editorial E2 distinta, **entonces** el sistema lo
   impide y no crea el segundo libro: la editorial no forma parte de la clave.
7. **Dada** un alta manual válida con stock S y precio P, **cuando** se crea el libro,
   **entonces** se agrega una entrada en el historial de stock (fecha, cantidad anterior 0,
   cantidad resultante S, origen "alta manual") **y** una entrada en el historial de precio
   (fecha, precio anterior 0, nuevo precio P, origen "alta manual").

---

### User Story 2 - Cargar todo el catálogo inicial desde un Excel de alta masiva (Priority: P1)

La librera tiene su inventario en un Excel con las columnas *libro*, *editorial*, *stock* y
*precio*. Lo sube una sola vez y el sistema crea todos los libros, informándole exactamente
qué filas no pudo cargar y por qué.

**Why this priority**: es la vía por la que el sistema se vuelve usable de verdad — cargar
cientos de libros a mano por el formulario de US1 no es viable. El PRD la señala
explícitamente como el mecanismo principal para la carga inicial de todo el stock.

**Independent Test**: se prueba subiendo un Excel de alta masiva con filas válidas,
inválidas y duplicadas, y verificando que se crearon exactamente las válidas y que el
reporte lista las demás con su motivo. Sólo necesita el modelo de libro de US1.

**Acceptance Scenarios**:

1. **Dado** un archivo Excel de alta masiva, **cuando** se sube: si contiene las columnas
   *libro*, *editorial*, *stock* y *precio* el sistema lo acepta y lee su contenido; si le
   falta alguna, lo rechaza con un mensaje y no crea ni modifica ningún libro.
2. **Dado** un Excel cuyo encabezado está en la primera fila no vacía de la primera hoja, con
   nombres que difieren sólo en mayúsculas, acentos o espacios sobrantes, y con columnas extra,
   **cuando** se sube, **entonces** se acepta y las columnas extra se ignoran; **y dado** un
   encabezado con un sinónimo o con una columna obligatoria repetida, **entonces** se rechaza y el
   mensaje lista los encabezados encontrados.
3. **Dado** un Excel de alta masiva aceptado, **cuando** se procesa, **entonces** por cada
   fila válida cuyo título normalizado no coincide con ningún libro existente (ni activo ni
   archivado) se crea un libro con su título, editorial, stock y precio, persistido y
   recuperable en una consulta posterior.
4. **Dada** una fila válida que crea un libro nuevo con stock S y precio P, **cuando** se
   crea el libro, **entonces** se agrega una entrada en el historial de stock (fecha,
   cantidad anterior 0, cantidad resultante S, origen "alta por Excel") **y** una entrada en
   el historial de precio (fecha, precio anterior 0, nuevo precio P, origen "alta por Excel").
5. **Dado** un Excel de alta masiva procesado, **cuando** hay filas duplicadas (título
   normalizado coincide con un libro activo) o inválidas (falta *libro*, *editorial*,
   *stock* o *precio*; o *stock* no es entero ≥ 0; o *precio* no es número > 0),
   **entonces** esas filas no crean ni modifican ningún libro y se listan en un reporte con
   la cantidad y el motivo de cada omisión.
6. **Dado** un Excel de alta masiva con dos o más filas cuyos títulos normalizan al mismo
   valor, **cuando** se procesa, **entonces** sólo la primera ocurrencia se procesa y cada
   duplicada posterior se lista en el reporte con el motivo "duplicada dentro del archivo".

---

### User Story 3 - Vender un libro descontando stock (Priority: P2)

La librera vende un libro y lo marca como vendido: el stock baja en una unidad y la venta
queda registrada con su fecha y el precio al que se vendió.

**Why this priority**: es la operación diaria más frecuente y la razón por la que el stock
se mantiene vivo. Depende de tener catálogo (US1/US2), pero no de los flujos de Excel de
precios ni de los historiales navegables.

**Independent Test**: se prueba marcando como vendido un libro con stock ≥ 1 y verificando
el descuento, el registro de venta y la entrada de historial de stock; y verificando que un
libro con stock 0 no se puede vender.

**Acceptance Scenarios**:

1. **Dado** un libro con stock S ≥ 1, **cuando** la librera lo marca como vendido,
   **entonces** el stock pasa a S − 1, se registra la venta en el historial de ventas
   (fecha y precio de venta, igual al precio vigente del libro en ese momento) y se registra
   el cambio en el historial de stock (fecha, cantidad anterior S, cantidad resultante
   S − 1, origen "venta").
2. **Dado** un libro con stock = 0, **cuando** la librera intenta marcarlo como vendido,
   **entonces** el sistema lo impide con un mensaje, el stock no cambia y no se registra
   ninguna venta.

---

### User Story 4 - Corregir a mano los datos de un libro (Priority: P2)

La librera ajusta el precio de un libro suelto, corrige su cantidad en stock después de un
recuento, o arregla un título o una editorial que quedaron mal escritos en la carga. Cada
cambio de precio o de stock queda registrado con el valor anterior y el motivo.

**Why this priority**: es el mantenimiento correctivo del día a día. Sin esto, cualquier
error de carga —un precio, un stock o un título mal tipeado— queda congelado hasta la próxima
actualización masiva, y un título mal escrito además rompe el matcheo de los dos flujos de
Excel.

**Independent Test**: se prueba cambiando el precio, el stock, el título y la editorial de un
libro existente y verificando el valor nuevo; en precio y stock, además, la entrada de
historial correspondiente con el valor anterior y origen "edición manual".

**Acceptance Scenarios**:

1. **Dado** un libro existente con precio P, **cuando** la librera cambia su precio a P',
   **entonces** P' queda guardado **y** se agrega una entrada en el historial de precio con
   fecha, precio anterior (P), nuevo precio (P') y origen "edición manual".
2. **Dado** un libro existente con stock S, **cuando** la librera modifica manualmente su
   stock a S', **entonces** S' queda guardado **y** se agrega una entrada en el historial de
   stock con fecha, cantidad anterior (S), cantidad resultante (S') y origen
   "edición manual".
3. **Dado** un intento de fijar un precio que no es > 0 o un stock que no es entero ≥ 0,
   **cuando** la librera confirma, **entonces** el sistema lo rechaza con un mensaje, no
   cambia el dato y no escribe historial.
4. **Dado** un libro existente, **cuando** la librera cambia su título y/o su editorial por
   valores no vacíos, **entonces** los nuevos valores quedan persistidos y el libro pasa a ser
   recuperable por ellos en la búsqueda por nombre/editorial.
5. **Dado** un intento de dejar vacío el título o la editorial, **cuando** la librera
   confirma, **entonces** el sistema lo rechaza con un mensaje y no modifica el libro.
6. **Dado** un libro existente cuyo título normalizado es T —esté activo o archivado—,
   **cuando** la librera intenta cambiar el título de otro libro a un valor que también
   normaliza a T, **entonces** el sistema lo impide con un mensaje y no modifica el libro.

---

### User Story 5 - Actualizar precios en masa desde el Excel de la distribuidora (Priority: P2)

La distribuidora le manda un Excel con columnas *libro* y *precio*. La librera lo sube y el
sistema actualiza los precios que puede resolver sin ambigüedad, y le informa el resto para
que decida a mano.

**Why this priority**: es el segundo gran ahorro de tiempo del sistema después de la carga
inicial, y el flujo con mayor riesgo de corromper precios — por eso su reporte y su
tratamiento de casi-coincidencias son parte del corte, no un extra.

**Independent Test**: se prueba subiendo un Excel de precios contra un catálogo con libros
activos, archivados, sin coincidencia y casi-coincidentes, y verificando qué precios
cambiaron, qué historiales se escribieron y qué muestra el reporte en cada categoría.

**Acceptance Scenarios**:

1. **Dado** un archivo Excel de actualización de precios, **cuando** se sube: si contiene
   las columnas *libro* y *precio* el sistema lo acepta y lee su contenido; si le falta
   alguna, lo rechaza con un mensaje y no modifica ningún precio.
2. **Dado** un Excel de precios aceptado, **cuando** se procesa, **entonces** por cada fila
   cuyo título normalizado coincide con un libro **activo** se actualiza su precio **y** se
   agrega una entrada en el historial de precio con fecha, precio anterior, nuevo precio y
   origen "actualización masiva por Excel".
3. **Dado** un Excel de precios procesado, **cuando** una fila coincide con un libro
   **archivado**, **entonces** ese libro no se modifica y la fila se lista en un apartado
   separado del reporte rotulado "coincide con un libro archivado — no actualizado", con
   cantidad y detalle.
4. **Dado** un Excel de precios procesado, **cuando** hay filas sin ninguna coincidencia,
   **entonces** no modifican ningún dato y se listan en el reporte como tales, con cantidad
   y detalle.
5. **Dado** un libro archivado, **cuando** una fila es casi-coincidencia de ese libro,
   **entonces** no se modifica nada y la fila va al apartado de archivados, no a
   casi-coincidencias ni a sin coincidencia.
6. **Dado** un Excel de precios procesado, **cuando** una fila no coincide exactamente pero,
   tras la normalización, comparte el núcleo del título con un libro activo difiriendo sólo
   en variantes de edición entre paréntesis (p. ej. "tapa blanda" / "rústica" /
   "versión rústica"), **entonces** esa fila se muestra destacada en otro color como
   casi-coincidencia y su precio **no** se actualiza automáticamente.
7. **Dado** un Excel de precios con dos o más filas cuyos títulos normalizan al mismo valor,
   **cuando** se procesa, **entonces** sólo la primera ocurrencia se aplica y cada duplicada
   posterior se lista en el reporte con el motivo "duplicada dentro del archivo".
8. **Dado** un libro activo con precio P, **cuando** se procesa una fila que coincide con él y
   trae el mismo precio P, **entonces** el libro no se modifica, no se agrega entrada al
   historial de precio y la fila se informa como coincidente sin cambio.
9. **Dado** un Excel de precios ya procesado, **cuando** se lo procesa de nuevo sin cambios,
   **entonces** el historial de precio queda exactamente igual que después del primer
   procesamiento.
10. **Dado** un Excel de precios procesado, **cuando** termina el procesamiento, **entonces** su
   reporte queda guardado con fecha, totales por categoría y el detalle de cada fila no aplicada
   con su motivo; y la librera puede volver a abrirlo más tarde con el mismo contenido, sin
   poder editarlo ni borrarlo.

---

### User Story 6 - Archivar libros que dejan de venderse y reactivarlos (Priority: P3)

Cuando un libro deja de venderse, la librera lo da de baja: desaparece de las búsquedas pero
su historia queda. Si más adelante vuelve a entrar en una carga masiva, el libro se reactiva
en lugar de duplicarse.

**Why this priority**: mantiene limpio el catálogo de consulta sin perder trazabilidad, y es la
única vía para recuperar un libro archivado por error. Es valioso pero no bloquea la operación
diaria.

**Independent Test**: se prueba archivando un libro activo y verificando que ya no aparece
en las búsquedas y que su historial sigue accesible; reactivándolo a mano y verificando que
vuelve con el stock y el precio fijados y con sus dos entradas de historial; y subiendo un
Excel de alta masiva con el título de un libro archivado, verificando que se reactiva con los
valores nuevos.

**Nota de dependencia**: el escenario 6 (reactivar desde el rechazo del alta duplicada) es el
único punto de contacto con US1. US1 puede entregarse antes con sólo el mensaje de rechazo; el
atajo a reactivar llega con esta historia.

**Acceptance Scenarios**:

1. **Dado** un libro activo, **cuando** la librera lo da de baja, **entonces** queda marcado
   como archivado, deja de aparecer en la búsqueda por nombre/editorial y en la consulta por
   foto, y su historial se conserva accesible.
2. **Dado** un libro archivado con stock S y precio P cuyo título normalizado coincide con
   una fila válida de un Excel de alta masiva que trae stock S' y precio P', **cuando** se
   procesa el Excel, **entonces** el libro queda marcado como activo, su stock pasa a S' y
   su precio a P', y se agregan una entrada en el historial de stock (fecha, cantidad
   anterior S, cantidad resultante S', origen "alta por Excel") **y** una entrada en el
   historial de precio (fecha, precio anterior P, nuevo precio P', origen "alta por Excel").
3. **Dado** un libro archivado, **cuando** se procesa un Excel de **actualización de
   precios** cuyo título coincide con él, **entonces** el libro no se reactiva ni se
   modifica (sólo se reporta).
4. **Dados** uno o más libros archivados y uno o más activos, **cuando** la librera abre la
   consulta de archivados, **entonces** el sistema lista únicamente los archivados.
5. **Dado** un libro archivado con stock S y precio P, **cuando** la librera lo reactiva a
   mano fijando stock S' y precio P', **entonces** el libro queda activo, vuelve a aparecer en
   las búsquedas, su stock pasa a S' y su precio a P', y se agregan una entrada en el historial
   de stock (fecha, cantidad anterior S, cantidad resultante S', origen "reactivación") **y**
   una entrada en el historial de precio (fecha, precio anterior P, nuevo precio P', origen
   "reactivación").
6. **Dado** un intento de alta manual cuyo título coincide con un libro archivado, **cuando**
   el sistema lo rechaza, **entonces** ofrece reactivar ese libro archivado y desde ahí la
   librera puede completar la reactivación sin volver a empezar.
7. **Dado** un libro archivado con stock S y precio P, **cuando** se lo reactiva —a mano o por
   Excel de alta masiva— fijando exactamente los mismos S y P, **entonces** las dos entradas de
   historial se escriben igual, porque la reactivación es la única excepción a "sin cambio ⇒ sin
   historial".
8. **Dado** un libro archivado, **cuando** la librera intenta modificar su stock o su precio, o
   marcarlo como vendido, **entonces** el sistema lo impide con un mensaje y no modifica nada ni
   escribe historial; **y cuando** modifica su título o su editorial, o lo reactiva, **entonces**
   la operación se permite.

---

### User Story 7 - Revisar y filtrar los historiales (Priority: P3)

La librera abre los historiales de ventas, de precios y de stock para entender qué pasó:
cuándo cambió un precio, de cuánto a cuánto y por qué; cuánto se vendió en un período.

**Why this priority**: la trazabilidad se escribe desde la primera historia (es invariante
del sistema), pero poder navegarla es una capacidad de consulta posterior que no bloquea
ninguna operación.

**Independent Test**: se prueba generando movimientos conocidos (una venta, un cambio de
precio manual, una actualización masiva) y verificando que cada historial muestra sus
campos, y que los filtros por fecha, título y editorial recortan correctamente.

**Acceptance Scenarios**:

1. **Dado** un historial con registros, **cuando** la librera lo abre, **entonces** el
   sistema muestra cada registro con su fecha y sus valores: en ventas, el precio de venta;
   en precio, el precio anterior, el nuevo precio y el origen; en stock, la cantidad
   anterior, la cantidad resultante y el origen.
2. **Dado** un historial con registros, **cuando** la librera aplica un filtro por fecha y/o
   título y/o editorial, **entonces** el sistema muestra únicamente los registros que
   cumplen el filtro.
3. **Dado** un libro archivado con historial, **cuando** la librera consulta los
   historiales, **entonces** sus registros siguen apareciendo.

---

### User Story 8 - Encontrar un libro sacándole una foto (Priority: P3)

La librera tiene el libro en la mano y no recuerda el título exacto. Le saca una foto y el
sistema le ofrece una lista de candidatos ordenada por parecido para que elija cuál es.

**Why this priority**: es una comodidad de consulta con alternativa funcional completa (la
búsqueda por nombre/editorial de US1) y con una dependencia técnica todavía sin resolver.

**Independent Test**: se prueba con un conjunto de libros activos con foto cargada,
consultando con una foto de uno de ellos y verificando que aparece entre los primeros
candidatos de la lista.

**Acceptance Scenarios**:

1. **Dado** un libro activo con foto, **cuando** la librera consulta a partir de una foto de
   ese libro, **entonces** el sistema devuelve una lista de candidatos ordenada por
   similitud en la que el libro correcto aparece entre los primeros 5.
2. **Dada** una consulta por foto, **cuando** el sistema responde, **entonces** presenta
   siempre una lista de candidatos para que la librera elija, y nunca una única respuesta
   presentada como certeza.
3. **Dada** una foto que no se parece a ningún libro del catálogo, **cuando** se consulta,
   **entonces** el sistema informa que no encontró candidatos y no devuelve un libro
   arbitrario.

---

### Edge Cases

- **Excel sin columnas obligatorias** → se rechaza el archivo completo con un mensaje que lista los
  encabezados encontrados; no se crea ni modifica ningún dato.
- **Encabezado con un sinónimo** (*"importe"* en lugar de *precio*) → se rechaza: el sistema no
  interpreta la intención del archivo. El mensaje lista lo que encontró para que se pueda corregir.
- **Columna obligatoria repetida** (dos columnas *precio*) → se rechaza: elegir una sería adivinar.
- **Libro de Excel con varias hojas** → se usa sólo la primera; si no tiene las columnas, se rechaza.
- **Filas vacías o un título arriba del encabezado** → el encabezado es la primera fila no vacía.
- **Excel vacío o sólo con encabezados** → se acepta y se reporta 0 filas procesadas, sin
  error.
- **Fila de Excel con celdas en blanco** → se omite y se reporta como inválida indicando el
  campo faltante; nunca se completa con un valor por defecto.
- **Fila de Excel con precio 0, negativo o no numérico; o stock negativo o no entero** → se
  omite y se reporta como inválida.
- **Título que normaliza igual pero es otra edición** (variantes de tapa/versión entre
  paréntesis) → se marca como casi-coincidencia para revisión manual; no se actualiza.
- **Dos filas del mismo archivo que normalizan al mismo título** → se procesa la primera, el
  resto se reporta como "duplicada dentro del archivo".
- **La primera ocurrencia de un título repetido es inválida y una posterior es válida** →
  ninguna de las dos se aplica: la primera se reporta como inválida y la posterior como
  duplicada dentro del archivo. La corrección es arreglar la primera y volver a subir el archivo,
  que es seguro en los dos flujos.
- **Fila que califica para varias categorías** → recibe una sola, la primera del orden de
  precedencia de FR-021b. Una coincidencia exacta siempre gana sobre una casi-coincidencia.
- **Casi-coincidencia de un libro archivado** → va al apartado de archivados, no a
  casi-coincidencias ni a sin coincidencia.
- **Fila de alta masiva que coincide con un libro activo** → se omite como duplicada; el
  libro activo no se modifica.
- **Fila de alta masiva que coincide con un libro archivado** → reactiva el libro con los
  valores nuevos (no crea un segundo libro).
- **Fila de alta masiva que es variante de edición de un libro existente** → se crea como libro
  **nuevo**; ambos conviven. La casi-coincidencia no aplica a este flujo (FR-017).
- **Intento de modificar stock, precio o vender un libro archivado** → se impide con un mensaje,
  sin modificar nada ni escribir historial (FR-038). Corregir su título o su editorial, en cambio,
  sí está permitido.
- **Alta manual de un título que ya existe archivado** → se impide y se informa que existe
  archivado, ofreciendo reactivarlo, en lugar de crear un duplicado.
- **Fila de Excel con dos candidatos (un activo y un archivado con el mismo título)** →
  imposible por construcción: el título normalizado es único en todo el catálogo (FR-004,
  FR-033).
- **Fila de actualización de precios que coincide con un libro archivado** → no se aplica;
  se reporta en el apartado separado.
- **Venta con stock 0** → se impide, sin cambio de stock ni registro de venta.
- **Mismo Excel subido dos veces** → el segundo procesamiento no agrega entradas de historial:
  todas sus filas coinciden sin cambio.
- **Edición manual que fija el mismo valor que ya tenía** → no se escribe historial; no hubo
  cambio.
- **Libro sin foto consultado por foto** → no puede ser candidato; se resuelve por la
  búsqueda por nombre/editorial.
- **Fallo al escribir el historial** → el cambio de dato se revierte por completo; no queda
  stock ni precio sin su registro de historial.
- **Interrupción a mitad de un Excel** → no quedan filas aplicadas a medias: cada fila se
  aplica de forma completa o no se aplica.

## Requirements *(mandatory)*

Cada requerimiento traza al RF del PRD-001 vigente que lo origina (Principio V de la
constitución). Los marcados como *Invariante* provienen de los principios II y III y aplican
a todos los flujos.

### Functional Requirements

**Catálogo y alta manual**

- **FR-001**: El sistema MUST permitir dar de alta un libro con título, editorial, foto
  (opcional), cantidad en stock y precio. *(RF-01)*
- **FR-002**: El sistema MUST rechazar el alta, con un mensaje que identifique el problema y
  sin persistir nada, cuando el título o la editorial estén vacíos, el stock no sea un entero
  ≥ 0, o el precio no sea un número > 0. *(RF-01)*
- **FR-003**: El sistema MUST comparar títulos mediante una única normalización compartida
  por todos los flujos: minúsculas, sin acentos, sin puntuación e ignorando el orden del
  artículo. *(RF-07)*
- **FR-004**: El sistema MUST impedir dar de alta un libro cuyo título normalizado coincida
  con el de cualquier otro libro existente, **activo o archivado**: el título normalizado es
  único en todo el catálogo. Cuando el coincidente está archivado, el mensaje MUST indicarlo y
  ofrecer reactivarlo en lugar de crear un duplicado. *(RF-17)*

**Consulta**

- **FR-005**: El sistema MUST permitir buscar libros por nombre o por editorial, devolviendo
  los libros **activos** coincidentes con su precio. *(RF-10)*
- **FR-006**: El sistema MUST permitir consultar un libro por foto, devolviendo una lista de
  candidatos ordenada por similitud para que la usuaria elija. *(RF-11)*

**Operación diaria**

- **FR-007**: El sistema MUST permitir modificar el precio de un libro **activo**, y MUST
  impedirlo sobre un libro archivado (FR-038). *(RF-02, RF-29)*
- **FR-008**: El sistema MUST permitir modificar manualmente la cantidad en stock de un libro
  **activo**, y MUST impedirlo sobre un libro archivado (FR-038). *(RF-03, RF-29)*
- **FR-009**: El sistema MUST permitir marcar como vendido un libro **activo**, descontando una
  unidad de stock y registrando la venta con su fecha y con el precio vigente del libro en ese
  momento. Un libro archivado MUST NOT poder venderse (FR-038). *(RF-05, RF-12, RF-29)*
- **FR-010**: El sistema MUST impedir marcar como vendido un libro con stock 0, sin alterar
  el stock ni registrar venta. *(RF-05)*
- **FR-011**: El sistema MUST permitir dar de baja un libro mediante baja lógica
  (archivado/inactivo), conservando su historial y excluyéndolo de las consultas de FR-005 y
  FR-006. *(RF-04)*

**Excel — actualización de precios**

- **FR-012**: El sistema MUST permitir subir un Excel de actualización de precios con las
  columnas *libro* y *precio*, y MUST rechazarlo con un mensaje si falta alguna. *(RF-06)*
- **FR-013**: El sistema MUST actualizar el precio de los libros **activos** cuyo título
  normalizado coincida con una fila del Excel de precios, y MUST NOT modificar los libros
  archivados. Cuando el precio de la fila es igual al vigente, la fila se informa como
  coincidente **sin cambio** y no genera escritura ni historial (FR-027b). *(RF-07)*
- **FR-014**: El sistema MUST reportar, sin modificar datos, las filas sin coincidencia y —
  en un apartado separado rotulado "coincide con un libro archivado — no actualizado" — las
  filas que coincidan con un libro archivado **o que sean casi-coincidencia de un libro
  archivado**, indicando cantidad y detalle en ambos casos. *(RF-08)*
- **FR-015**: El sistema MUST destacar visualmente, en otro color y sin actualizarlas, las
  filas que sean casi-coincidencias de un libro **activo** (mismo núcleo de título difiriendo
  sólo en variantes de edición entre paréntesis), para revisión manual. La casi-coincidencia de
  un libro **archivado** no se destaca: va al apartado de archivados (FR-014, FR-021b). *(RF-09)*

**Excel — alta masiva**

- **FR-016**: El sistema MUST permitir subir un Excel de alta masiva con las columnas
  *libro*, *editorial*, *stock* y *precio*, mediante un flujo separado e independiente del de
  actualización de precios, y MUST rechazarlo con un mensaje si falta alguna columna.
  *(RF-18)*
- **FR-017**: El sistema MUST crear un libro por cada fila válida cuyo título normalizado no
  coincida con ningún libro existente (ni activo ni archivado). En este flujo la comparación es
  **sólo por coincidencia exacta**: una variante de edición es un **libro distinto** y se crea
  como tal — si existe "El Principito", la fila "El Principito (tapa dura)" crea un libro nuevo y
  ambos conviven. La casi-coincidencia (FR-015) MUST NOT aplicarse acá. *(RF-19)*
- **FR-018**: El sistema MUST reactivar el libro **archivado** cuyo título normalizado
  coincida con una fila válida del Excel de alta masiva, actualizando su stock y su precio
  con los valores de la fila. *(RF-20)*
- **FR-019**: El sistema MUST reportar, sin crear ni modificar libros, las filas omitidas del
  Excel de alta masiva —duplicadas (coinciden con un libro activo) o inválidas (falta *libro*,
  *editorial*, *stock* o *precio*; o *stock* no es entero ≥ 0; o *precio* no es número > 0)—
  indicando la cantidad y el motivo de cada una. *(RF-21)*
- **FR-020**: El sistema MUST NOT crear libros a partir del Excel de **actualización de
  precios**: en ese flujo las filas sin coincidencia sólo se reportan. *(PRD §7)*

**Excel — ambos flujos**

- **FR-021**: Cuando dos o más filas de un mismo archivo tengan títulos que normalicen al
  mismo valor, el sistema MUST procesar únicamente la primera ocurrencia y MUST reportar las
  restantes como omitidas por "duplicada dentro del archivo". La condición es **posicional**:
  toda ocurrencia posterior se reporta como duplicada aunque la primera no se haya aplicado —
  si la primera es inválida, la posterior tampoco se aplica. Cuentan como ocurrencia todas las
  filas con título legible, aun si son inválidas en otro campo. *(RF-22)*
- **FR-021b**: El sistema MUST asignar a cada fila **una sola** categoría, evaluando en este
  orden y quedándose con la primera que dé positivo. Común a los dos flujos: **(1)** `invalida`;
  **(2)** `duplicada_en_archivo`. En **alta masiva**: **(3)** coincidencia exacta con un activo →
  `duplicada_de_activo`; **(4)** coincidencia exacta con un archivado → reactivar (`aplicada`);
  **(5)** sin coincidencia → crear (`aplicada`). En **actualización de precios**: **(3)**
  coincidencia exacta con un activo → `aplicada`, o `sin_cambio` si el precio iguala al vigente;
  **(4)** coincidencia exacta con un archivado → `coincide_archivado`; **(5)** casi-coincidencia
  de un activo → `casi_coincidencia`; **(6)** casi-coincidencia de un archivado →
  `coincide_archivado`; **(7)** nada de lo anterior → `sin_coincidencia`. Las categorías son
  mutuamente excluyentes. *(RF-28)*

**Trazabilidad**

- **FR-022**: El sistema MUST guardar un historial de cambios de precio con fecha, precio
  anterior, nuevo precio y origen del cambio, donde el origen es uno de: "edición manual",
  "alta manual", "reactivación", "actualización masiva por Excel" o "alta por Excel". *(RF-14)*
- **FR-023**: El sistema MUST guardar un historial de cambios de stock con fecha, cantidad
  anterior, cantidad resultante y origen del cambio, donde el origen es uno de: "venta",
  "edición manual", "alta manual", "reactivación" o "alta por Excel". *(RF-13)*
- **FR-024**: El sistema MUST guardar un historial de ventas con fecha y precio de venta,
  vinculado al libro vendido. *(RF-12)*
- **FR-025**: El sistema MUST permitir revisar los historiales de precio, de ventas y de
  stock. *(RF-15)*
- **FR-026**: El sistema MUST permitir filtrar los historiales por fecha, título y editorial.
  *(RF-16)*
- **FR-027** *(Invariante)*: Toda escritura que altere el stock o el precio de un libro MUST
  registrar su entrada de historial de forma indivisible con el cambio del dato: si no se
  puede registrar el historial, el cambio no se aplica. *(Constitución III)*
- **FR-027b** *(Invariante)*: Una operación que deja el stock o el precio igual al vigente
  **no** es un cambio: el sistema MUST NOT modificar el libro ni escribir entrada de historial.
  El historial contiene sólo movimientos reales, y reprocesar el mismo Excel deja las mismas
  entradas que procesarlo una vez. **Única excepción**: una reactivación (FR-018, FR-035) MUST
  registrar siempre sus dos entradas, aun con valores idénticos, por ser un evento de ciclo de
  vida que debe quedar trazado. *(RF-13, RF-14)*
- **FR-028** *(Invariante)*: El sistema MUST NOT borrar libros físicamente ni permitir borrar
  o editar entradas de historial ya registradas. *(RF-04, PRD §7, Constitución III)*
- **FR-029** *(Invariante)*: El sistema MUST NOT completar, adivinar ni estimar datos
  ausentes, inválidos o ambiguos: los informa y no modifica datos. *(Constitución II)*
- **FR-030**: Todo procesamiento de Excel MUST informar el resultado completo: cantidad de
  filas aplicadas y, para cada fila no aplicada, su motivo. Ninguna fila puede quedar sin
  reportar. *(RF-08, RF-21, Constitución II)*
- **FR-030b**: El sistema MUST procesar archivos de hasta 5.000 filas en ambos flujos sin
  fallar ni truncar filas. *(RNF-03)*

**Corrección de datos descriptivos**

- **FR-031**: El alta manual de un libro MUST registrar sus entradas iniciales de historial:
  una de stock (cantidad anterior 0, cantidad resultante el stock inicial) y una de precio
  (precio anterior 0, nuevo precio el precio inicial), ambas con origen "alta manual".
  *(RF-01, RF-13, RF-14 — enmienda del 2026-07-29; Constitución III)*
- **FR-032**: El sistema MUST permitir modificar el título y la editorial de un libro
  existente —**activo o archivado** (FR-038)—, y MUST rechazar el cambio con un mensaje si el
  nuevo título o la nueva editorial quedan vacíos. *(RF-23, RF-29)*
- **FR-033**: El sistema MUST impedir modificar el título de un libro cuando el nuevo título
  normalizado coincida con el de cualquier otro libro existente, **activo o archivado**, con la
  misma regla de unicidad global que aplica al alta (FR-004). *(RF-24)*

**Reactivación**

- **FR-034**: El sistema MUST permitir consultar los libros **archivados**, listando únicamente
  esos, para que la usuaria pueda encontrar uno y reactivarlo. *(RF-25)*
- **FR-035**: El sistema MUST permitir reactivar manualmente un libro archivado fijando su
  stock y su precio en el momento de la reactivación, registrando ambas entradas de historial
  con origen **"reactivación"** —distinto de "edición manual", para que el historial permita
  reconstruir que hubo una reactivación— y escribiéndolas incluso si los valores coinciden con
  los que el libro ya tenía (FR-027b). La reactivación MUST poder iniciarse también desde el
  rechazo de un alta duplicada contra un libro archivado (FR-004). *(RF-26)*
- **FR-036**: El sistema MUST persistir el reporte de cada procesamiento de un Excel de
  **actualización de precios**, con su fecha, los totales por categoría y el detalle de cada
  fila no aplicada con su motivo, y MUST permitir consultar los reportes anteriores. Los
  reportes MUST NOT poder editarse ni borrarse. *(RF-27)*
- **FR-037**: El sistema MUST impedir el alta de dos libros con el mismo título normalizado
  aunque tengan editoriales distintas: la editorial **no** forma parte de la clave. *(RF-17,
  PRD §8 Restricciones)*
- **FR-038**: Sobre un libro **archivado** el sistema MUST impedir modificar el stock y el precio
  —incluida la venta, que descuenta stock— y MUST permitir modificar su título y su editorial
  (FR-032, sujeto a FR-033) y reactivarlo (FR-035). Recíprocamente, FR-007, FR-008 y FR-009 sólo
  aplican a libros **activos**. *(RF-29)*
- **FR-039**: El sistema MUST reconocer los encabezados de un Excel con estas reglas, comunes a los
  dos flujos: **(a)** usar únicamente la **primera hoja**; **(b)** tomar como encabezado la
  **primera fila no vacía**; **(c)** comparar los nombres recortando espacios y sin distinguir
  mayúsculas ni acentos; **(d)** **no** aceptar sinónimos — el nombre debe coincidir con el
  declarado, porque interpretar "importe" o "costo" como precio de venta sería adivinar la intención
  del archivo (FR-029); **(e)** ignorar las columnas extra sin error; **(f)** **rechazar** el archivo
  si una columna obligatoria aparece repetida, porque elegir una de las dos sería adivinar. Todo
  rechazo por encabezados MUST indicar qué columnas faltan o están repetidas **y listar los
  encabezados encontrados**. *(RF-30)*

### Key Entities

- **Libro**: la unidad del catálogo. Título, editorial, foto (opcional), cantidad en stock,
  precio vigente y estado (activo / archivado). Su título normalizado es la clave con la que se
  lo identifica entre flujos y es **único en todo el catálogo**, sin importar el estado. Nunca
  se borra físicamente.
- **Movimiento de Precio**: registro histórico de un cambio de precio de un libro. Fecha,
  precio anterior, precio nuevo y origen. Append-only.
- **Movimiento de Stock**: registro histórico de un cambio de cantidad de un libro. Fecha,
  cantidad anterior, cantidad resultante y origen. Append-only.
- **Venta**: registro de una unidad vendida de un libro. Fecha y precio de venta (el vigente
  al momento de la venta). Append-only.
- **Reporte de Importación**: resultado de procesar un Excel. Fecha, totales por categoría, y el
  detalle de cada fila no aplicada con su motivo: coincidente sin cambio, sin coincidencia,
  coincide con un libro archivado, casi-coincidencia, duplicada dentro del archivo, duplicada de
  un libro activo, o inválida (con el campo que falla). El del flujo de **actualización de
  precios** se persiste y es consultable después, y no se edita ni se borra (append-only, igual
  que los historiales); el del flujo de alta masiva sólo se muestra al terminar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sobre el catálogo de referencia (~2.000 libros), en el 95% de las consultas la
  librera obtiene el precio de un libro buscando por nombre o editorial en menos de 1 segundo.
- **SC-002**: Sobre el catálogo de referencia (~2.000 libros), en el 95% de las consultas por
  foto la librera recibe la lista de candidatos en menos de 3 segundos.
- **SC-003**: Para cada libro del conjunto de validación con foto cargada, consultarlo por
  foto lo devuelve entre los 5 primeros candidatos de la lista.
- **SC-004**: La librera carga la totalidad de su inventario inicial en una sola operación de
  archivo, sin dar de alta libros de uno en uno, con archivos de hasta 5.000 filas procesados
  sin fallas ni filas truncadas.
- **SC-005**: El 100% de los cambios de stock y de precio tiene su entrada de historial con
  valor anterior, valor resultante y origen — verificable auditando los historiales contra
  los movimientos realizados.
- **SC-006**: El 100% de las filas de un archivo procesado queda clasificado como aplicada o
  como no aplicada con un motivo explícito; ninguna fila se descarta en silencio.
- **SC-007**: El sistema nunca elimina un libro ni una entrada de historial: el 100% de las
  bajas queda recuperable como archivada y los historiales sólo crecen — verificable
  comprobando que no existe ninguna operación que borre libros o entradas. *(La durabilidad del
  archivo ante fallas de disco o corrupción queda fuera de alcance: resguardarlo es
  responsabilidad de la usuaria.)*
- **SC-008**: El 100% de las coincidencias ambiguas de una actualización masiva de precios
  (casi-coincidencias y coincidencias con libros archivados) queda pendiente de decisión de la
  librera: cero precios modificados automáticamente sobre una coincidencia no exacta.

## Assumptions

- **Venta unitaria**: "marcar como vendido" descuenta exactamente 1 unidad por operación
  (AC-05 del PRD). No hay venta de varias unidades en un solo paso.
- **Precio de venta**: la venta registra el precio vigente del libro en ese momento; cambiar
  el precio después no altera ventas ya registradas.
- **Venta vinculada al libro**: aunque RF-12 sólo enumera fecha y precio, la venta queda
  asociada a su libro, porque RF-16 exige filtrar los historiales por título y editorial.
- **Archivados fuera de las consultas, dentro de los historiales**: un libro archivado no
  aparece en FR-005 ni FR-006, pero sus movimientos siguen visibles en los historiales
  (AC-04).
- **Fotos del catálogo como base de la búsqueda por foto**: la consulta por foto compara
  contra las fotos cargadas en el alta; un libro sin foto no puede ser candidato.
- **Casi-coincidencia calibrada por ejemplos**: el PRD no fija un umbral numérico de
  similitud; la regla se valida contra un conjunto fijo de ejemplos conocidos de variantes de
  edición (AC-10). El conjunto de ejemplos es el criterio de aceptación.
- **Formato de los Excel**: las reglas concretas de reconocimiento de encabezados están en FR-039
  (primera hoja, primera fila no vacía, comparación sin espacios ni mayúsculas ni acentos, sin
  sinónimos, columnas extra ignoradas, columna obligatoria repetida = rechazo).
- **Volumen de referencia**: catálogo de aproximadamente **2.000 libros** y archivos Excel de
  hasta **5.000 filas**. Es la escala contra la que se verifican SC-001, SC-002 y SC-004; no es
  un límite duro del sistema, es la magnitud de diseño y de prueba.
- **Reportes de importación**: el de **actualización de precios** se persiste y es consultable
  después (FR-036, RF-27), porque a 5.000 filas un reporte no revisitable es inservible. El de
  **alta masiva** se muestra sólo al terminar y no se persiste: es un evento puntual de carga
  inicial que la librera revisa en el momento.
- **Moneda única y precio sin desglose**: un solo importe por libro, sin impuestos,
  descuentos ni monedas alternativas (no hay RF que los pida).
- **Sin autenticación por decisión explícita**: un único acceso local, sin login, roles ni
  aislamiento entre usuarios (PRD §6). No es una omisión.
- **Rama de trabajo**: el repositorio es local, sin remoto ni flujo de PR, y trabaja sobre
  `main`; no se creó rama por feature porque no hay hook `before_specify` configurado.
- **Corregir título o editorial no escribe historial**: la trazabilidad obligatoria cubre
  stock y precio (Constitución III y RF-13/RF-14); el PRD no pide un historial de datos
  descriptivos, así que corregir un título o una editorial no genera entrada de historial. Es
  una decisión, no un olvido — si se quiere auditar los renombres hace falta un RF nuevo.
- **Colisión de títulos**: el título normalizado es único en **todo** el catálogo (RF-17,
  RF-24). Tanto el alta como la edición se rechazan si el título choca con otro libro, esté
  activo o archivado; si el coincidente está archivado, el sistema lo informa y ofrece
  reactivarlo. Por construcción no puede existir un activo y un archivado con el mismo título
  normalizado, así que ninguna fila de Excel tiene dos candidatos.
- **La editorial no forma parte de la clave** *(decisión explícita, PRD §8)*: no pueden coexistir
  dos libros con el mismo título de editoriales distintas; el segundo se rechaza en el alta y se
  omite como duplicado en el alta masiva. Si el negocio necesita stockear la misma obra de dos
  editoriales, se diferencia en el título al cargarlo (p. ej. "Hamlet (Cátedra)"), lo que además
  lo vuelve distinguible en la búsqueda y en el matcheo de los Excel.

### Dependencies

- **Librería local de búsqueda por foto**: todavía sin definir (PRD §8). Bloquea únicamente a
  US8; el resto de las historias no la necesitan y US1 cubre la consulta por búsqueda de
  texto como alternativa completa.

## Fuera de Alcance

Explícitamente excluido (PRD §7). Ninguna de estas capacidades se implementa sin enmendar
primero el PRD (Principio V de la constitución):

- Tienda virtual para clientes y cualquier opción de compra.
- Facturación: comprobantes fiscales, integración con organismos impositivos, datos fiscales
  de clientes.
- Autenticación, login, roles y soporte multiusuario.
- Borrado físico de libros (la baja es siempre lógica).
- Creación de libros desde el Excel de actualización de precios.
- Resguardo de datos: backup automático, exportación de la base y restauración desde una copia.
  Resguardar el archivo es responsabilidad de la usuaria, por fuera del sistema. **Riesgo
  asumido**: una falla de disco o una corrupción del archivo implica perder el inventario y los
  historiales, sin recuperación desde la aplicación.

## Clarificaciones Resueltas

Ambas se resolvieron enmendando el PRD-001 antes de especificar, según el Principio V de la
constitución (primero se enmienda el PRD, después se implementa):

- **Q1 — historial en el alta manual → resuelto: sí, con origen "alta manual"**. RF-13 y
  RF-14 del PRD ahora incluyen "alta manual" entre los orígenes válidos, y el nuevo AC-22
  exige las dos entradas iniciales. Deja el alta manual simétrica con el alta por Excel
  (AC-19) y cierra el hueco frente al Principio III. Recogido en FR-031, FR-022 y FR-023.
- **Q2 — edición de título y editorial → resuelto: sí, en alcance**. Nuevos RF-23 y RF-24 en
  el PRD, con AC-23 y AC-24. La colisión de títulos al editar se rechaza contra **cualquier** libro,
  activo o archivado (misma regla de unicidad global que RF-17, ver Q1 arriba). Recogido en FR-032 y
  FR-033, y en los escenarios 4 a 6 de US4.
