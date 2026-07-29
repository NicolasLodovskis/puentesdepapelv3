# PRD-001: Manejo de Stock — Puentes de Papel

> Software local para que la dueña de la librería "Puentes de Papel" gestione stock y precios de sus libros: ABM, ventas, alta masiva y actualización de precios individual y masiva por Excel, y consulta por nombre/editorial o por foto.

| Campo | Detalle |
|---|---|
| **ID** | PRD-001 |
| **Producto** | Manejo de Stock "Puentes de Papel" |
| **Tipo** | Software de gestión de stock y precios para tienda de libros |
| **Usuarios** | Un único usuario / un único acceso |
| **Estado** | Borrador (endurecido) |

---

## 1. Contexto y Problema

La librería "Puentes de Papel" no tiene un sistema para llevar su inventario: hoy el stock y los precios se manejan de forma manual, lo que hace lento y propenso a errores mantenerlos al día y consultarlos.

**Persona única — la dueña/librera.** Es la única usuaria y tiene un único acceso al sistema. Necesita:

- Dar de alta los libros y darlos de baja cuando dejan de venderse.
- Subir y bajar el stock de manera rápida.
- Consultar el precio de un libro de manera rápida, por búsqueda (nombre/editorial) o por foto (cuando lo tiene en la mano y no recuerda el título exacto).
- Actualizar precios de forma ágil, tanto individualmente como en masa mediante un archivo Excel que le envía la distribuidora.

No hay otros roles ni otros usuarios: es un sistema mono-usuario, de escritorio/local.

---

## 2. Objetivos

- Mantener el **stock actualizado** en todo momento.
- Mantener los **precios actualizados**, incluyendo actualizaciones masivas.
- Permitir **consultar rápidamente** stock y precio (por búsqueda y por foto).
- Conservar **trazabilidad** (historial) de ventas, precios y stock, incluyendo el valor anterior y el origen de cada cambio.
- Permitir el **alta masiva de libros por Excel** (columnas *libro*, *editorial*, *stock* y *precio*), para simplificar principalmente la carga inicial de todo el stock.

---

## 3. Requerimientos Funcionales

| ID | Requerimiento |
|---|---|
| **RF-01** | El sistema debe permitir dar de alta un libro con título, editorial, foto (opcional), cantidad en stock y precio. |
| **RF-02** | El sistema debe permitir modificar el precio de un libro. |
| **RF-03** | El sistema debe permitir modificar manualmente la cantidad en stock de un libro. |
| **RF-04** | El sistema debe permitir dar de baja un libro mediante **baja lógica** (marcarlo como archivado/inactivo, conservando su historial). |
| **RF-05** | El sistema debe permitir marcar un libro como vendido. |
| **RF-06** | El sistema debe permitir subir un archivo Excel **de actualización de precios** con las columnas *libro* y *precio*. |
| **RF-07** | El sistema debe actualizar el precio de los libros del Excel de actualización de precios cuyo título, tras normalizarlo (minúsculas, sin acentos, sin puntuación e ignorando el orden del artículo), coincida con un libro **activo** existente. Los libros archivados no se actualizan. |
| **RF-08** | El sistema debe informar, sin modificar datos, las filas del Excel de actualización de precios sin coincidencia y, en un apartado separado rotulado *"coincide con un libro archivado — no actualizado"*, las filas cuyo título normalizado (RF-07) coincide con un libro **archivado** (cantidad y detalle en ambos casos). |
| **RF-09** | El sistema debe destacar visualmente (otro color) las filas del Excel de actualización de precios que no coinciden exactamente pero son **casi-coincidencias** de un libro activo existente, para revisión manual (sin actualizarlas automáticamente). |
| **RF-10** | El sistema debe permitir buscar libros por nombre o por editorial, devolviendo los libros coincidentes con su precio. |
| **RF-11** | El sistema debe permitir consultar un libro por foto, devolviendo una **lista de candidatos** ordenada por similitud para que el usuario elija. |
| **RF-12** | El sistema debe guardar un historial de las ventas (fecha y precio de venta). |
| **RF-13** | El sistema debe guardar un historial de los cambios de stock (fecha, **cantidad anterior**, cantidad resultante y **origen** del cambio: venta, edición manual o alta por Excel). |
| **RF-14** | El sistema debe guardar un historial de los cambios de precio (fecha, **precio anterior**, nuevo precio y **origen** del cambio: edición manual, actualización masiva por Excel o alta por Excel). |
| **RF-15** | El sistema debe permitir revisar los historiales de precio, ventas **y stock**. |
| **RF-16** | El sistema debe permitir filtrar los historiales por fecha, título y editorial. |
| **RF-17** | El sistema debe impedir dar de alta un libro cuyo título, una vez normalizado (RF-07), coincida con el de otro libro **activo**. |
| **RF-18** | El sistema debe permitir subir un archivo Excel de **alta masiva** con las columnas *libro*, *editorial*, *stock* y *precio*, mediante un flujo separado del de actualización de precios (RF-06). |
| **RF-19** | El sistema debe crear un libro por cada fila **válida** del Excel de alta masiva cuyo título, tras normalizarlo (RF-07), **no** coincida con ningún libro existente (ni activo ni archivado). |
| **RF-20** | El sistema debe **reactivar** (marcar como activo) el libro **archivado** cuyo título normalizado (RF-07) coincida con una fila válida del Excel de alta masiva, actualizando su stock y su precio con los valores de la fila. |
| **RF-21** | El sistema debe reportar, **sin crear ni modificar libros**, las filas del Excel de alta masiva que se omiten —duplicadas (coinciden con un libro **activo**, RF-17) o inválidas (falta *libro*, *editorial*, *stock* o *precio*; o *stock* no es un entero ≥ 0; o *precio* no es un número > 0)— indicando la cantidad y el motivo de cada una. |
| **RF-22** | En cualquiera de los dos flujos de Excel (actualización de precios y alta masiva), cuando dos o más filas tienen títulos que normalizan (RF-07) al mismo valor, el sistema debe procesar únicamente la primera ocurrencia y reportar las restantes como omitidas por *"duplicada dentro del archivo"*. |

---

## 4. Requerimientos No Funcionales

| ID | Requerimiento |
|---|---|
| **RNF-01** | La consulta de precio por búsqueda por nombre o editorial debe responder en **< 1 s (p95)**. |
| **RNF-02** | La consulta de precio por búsqueda por foto debe responder en **< 3 s (p95)**. |

> La persistencia en SQLite (un único archivo, sin servidor) se documenta como **Restricción** en la sección 8, no como RNF, por ser una decisión de arquitectura sin métrica asociada.

---

## 5. Criterios de Aceptación

Formato: **Dado** (precondición) → **Cuando** (acción) → **Entonces** (resultado medible). Cada criterio es binario (pasa / no pasa).

| ID | RF | Criterio |
|---|---|---|
| **AC-01** | RF-01 | Dado un formulario con título y editorial no vacíos, stock entero ≥ 0 y precio > 0, cuando el usuario confirma el alta, entonces el libro queda persistido en la base de datos y es recuperable en una consulta posterior; y dado un formulario donde el título o la editorial están vacíos, el stock no es un entero ≥ 0, o el precio no es > 0, cuando el usuario confirma el alta, entonces el sistema la rechaza con un mensaje y no persiste el libro. |
| **AC-02** | RF-02, RF-14 | Dado un libro existente con precio P, cuando el usuario cambia su precio a P', entonces el nuevo precio P' queda guardado en la base de datos **y** se agrega una entrada en el historial de precio con fecha, precio anterior (P), nuevo precio (P') y origen ("edición manual"). |
| **AC-03** | RF-03, RF-13 | Dado un libro existente con stock S, cuando el usuario modifica manualmente su stock a S', entonces el nuevo stock S' queda guardado **y** se agrega una entrada en el historial de stock con fecha, cantidad anterior (S), cantidad resultante (S') y origen ("edición manual"). |
| **AC-04** | RF-04 | Dado un libro activo, cuando el usuario lo da de baja, entonces queda marcado como archivado, deja de aparecer en las búsquedas (RF-10 y RF-11) y su historial se conserva accesible. |
| **AC-05** | RF-05, RF-12, RF-13 | Dado un libro con stock S ≥ 1, cuando el usuario lo marca como vendido, entonces el stock se descuenta en 1, se registra la venta en el historial de ventas (fecha y precio de venta, igual al precio vigente del libro en ese momento) y se registra el cambio en el historial de stock con fecha, cantidad anterior (S), cantidad resultante (S − 1) y origen ("venta"). |
| **AC-06** | RF-05 | Dado un libro con stock = 0, cuando el usuario intenta marcarlo como vendido, entonces el sistema lo impide, el stock no cambia y no se registra venta. |
| **AC-07** | RF-06 | Dado un archivo Excel de actualización de precios, cuando se sube: si contiene las columnas *libro* y *precio* el sistema lo acepta y lee su contenido; si le falta alguna de esas columnas, el sistema lo rechaza con un mensaje. |
| **AC-08** | RF-07, RF-14 | Dado un Excel de actualización de precios aceptado, cuando se procesa, entonces por cada fila cuyo título normalizado (según RF-07) coincide con un libro **activo** se actualiza su precio en la base de datos **y** se agrega una entrada en el historial de precio con fecha, precio anterior, nuevo precio y origen ("actualización masiva por Excel"); los libros archivados que coincidan no se modifican. |
| **AC-09** | RF-08 | Dado un Excel de actualización de precios procesado, cuando hay filas sin coincidencia y/o filas cuyo título normalizado coincide con un libro archivado, entonces ninguna de esas filas modifica datos y se listan en el reporte: las sin coincidencia como tales, y las que coinciden con un libro archivado en un apartado separado rotulado "coincide con un libro archivado — no actualizado", cada una con su cantidad y detalle. |
| **AC-10** | RF-09 | Dado un Excel de actualización de precios procesado, cuando una fila no coincide exactamente pero, tras la normalización (RF-07), comparte el núcleo del título con un libro activo existente difiriendo sólo en variantes de edición entre paréntesis (p. ej. "tapa blanda" / "rústica" / "versión rústica"), entonces esa fila se muestra destacada en otro color como casi-coincidencia y no se actualiza automáticamente. *(Verificable con un set de ejemplos conocidos.)* |
| **AC-11** | RF-10 | Dado uno o más libros activos cargados, cuando el usuario busca por nombre o por editorial, entonces el sistema devuelve los libros coincidentes con su precio en < 1 s (p95). |
| **AC-12** | RF-11 | Dado un libro activo con foto, cuando el usuario busca a partir de una foto de ese libro, entonces el sistema devuelve una lista de candidatos ordenada por similitud en la que el libro correcto aparece entre los primeros 5, en < 3 s (p95). |
| **AC-13** | RF-12, RF-13, RF-14, RF-15 | Dado un historial con registros (ventas, stock o precio), cuando el usuario lo abre, entonces el sistema muestra cada registro con su fecha y sus valores: en ventas, el precio de venta; en precio, el precio anterior, el nuevo precio y el origen; en stock, la cantidad anterior, la cantidad resultante y el origen. |
| **AC-14** | RF-16 | Dado un historial con registros, cuando el usuario aplica un filtro por fecha y/o título y/o editorial, entonces el sistema muestra únicamente los registros que cumplen el filtro. |
| **AC-15** | RF-17 | Dado un libro activo cuyo título normalizado es T, cuando el usuario intenta dar de alta otro libro cuyo título también normaliza a T, entonces el sistema lo impide y no crea el segundo libro. |
| **AC-16** | RF-18 | Dado un archivo Excel de alta masiva, cuando se sube: si contiene las columnas *libro*, *editorial*, *stock* y *precio* el sistema lo acepta y lee su contenido; si le falta alguna de esas columnas, el sistema lo rechaza con un mensaje. Este flujo es independiente del de actualización de precios (RF-06). |
| **AC-17** | RF-19 | Dado un Excel de alta masiva aceptado, cuando se procesa, entonces por cada fila válida cuyo título normalizado (RF-07) no coincide con ningún libro existente (ni activo ni archivado) se crea un libro con su título, editorial, stock y precio, quedando persistido y recuperable en una consulta posterior. |
| **AC-18** | RF-21 | Dado un Excel de alta masiva procesado, cuando hay filas duplicadas (título normalizado coincide con un libro **activo**, RF-17) o inválidas (falta *libro*, *editorial*, *stock* o *precio*; o *stock* no es un entero ≥ 0; o *precio* no es un número > 0), entonces esas filas no crean ni modifican ningún libro y se listan en un reporte con su cantidad y el motivo de cada omisión. |
| **AC-19** | RF-19, RF-13, RF-14 | Dada una fila válida del Excel de alta masiva que crea un libro nuevo con stock S y precio P, cuando se crea el libro, entonces se agrega una entrada en el historial de stock (fecha, cantidad anterior 0, cantidad resultante S, origen "alta por Excel") **y** una entrada en el historial de precio (fecha, precio anterior 0, nuevo precio P, origen "alta por Excel"). |
| **AC-20** | RF-20, RF-13, RF-14 | Dado un libro **archivado** con stock S y precio P cuyo título normalizado (RF-07) coincide con una fila válida del Excel de alta masiva que trae stock S' y precio P', cuando se procesa el Excel, entonces el libro queda marcado como activo, su stock pasa a S' y su precio a P', y se agregan una entrada en el historial de stock (fecha, cantidad anterior S, cantidad resultante S', origen "alta por Excel") **y** una entrada en el historial de precio (fecha, precio anterior P, nuevo precio P', origen "alta por Excel"). |
| **AC-21** | RF-22 | Dado un Excel (de actualización de precios o de alta masiva) con dos o más filas cuyos títulos normalizan (RF-07) al mismo valor, cuando se procesa, entonces solo la primera ocurrencia se procesa según su flujo y cada fila duplicada posterior no se procesa y se lista en el reporte con el motivo "duplicada dentro del archivo". |

---

## 6. Control de Acceso

El sistema es **mono-usuario con un único acceso local y sin autenticación** (sin login, sin roles, sin multiusuario). Por lo tanto **no aplica** un criterio de aislamiento de datos entre usuarios: no existe un segundo usuario del cual proteger los datos. Esta ausencia es una decisión explícita, no una omisión.

---

## 7. Fuera de Alcance

- Tienda virtual para clientes, con opción de compra.
- Módulo de facturación (emisión de facturas, comprobantes fiscales, integración con AFIP/organismos impositivos y gestión de datos fiscales de clientes).
- Autenticación, login, roles o soporte multiusuario.
- Borrado físico de libros (la baja es siempre lógica — RF-04).
- Creación de libros a partir del Excel de **actualización de precios** (RF-06): en ese flujo las filas sin coincidencia sólo se reportan (RF-07/RF-08). El alta de libros por Excel se hace únicamente por el flujo dedicado de **alta masiva** (RF-18/RF-19/RF-20/RF-21).

---

## 8. Riesgos, Restricciones y Dependencias

| Tipo | Descripción | Mitigación |
|---|---|---|
| **Restricción** | La persistencia se implementa con **SQLite**: base embebida en un único archivo `.db`, sin servidor. No se reemplaza por otro motor. | — |
| **Riesgo** | La búsqueda por foto puede devolver el libro incorrecto en la primera posición. | Se devuelve una lista de candidatos (RF-11) para que el usuario elija; puede descartar el resultado incorrecto y repetir. |
| **Riesgo** | Filas del Excel que parecen coincidir pero corresponden a otra edición (variantes de tapa/versión) podrían actualizar el precio equivocado. | Se detectan como casi-coincidencias y se destacan para revisión manual, sin actualizar automáticamente (RF-09). |
| **Dependencia** | Base de datos SQLite (archivo local). | Backup periódico del archivo `.db`. |
| **Dependencia** | Librería local de búsqueda por foto (aún sin definir). | Evaluar y fijar la librería antes de implementar RF-11. |
