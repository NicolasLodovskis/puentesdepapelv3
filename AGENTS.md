# AGENTS.md — Manejo de Stock "Puentes de Papel"

> **Constitución del proyecto**: `.specify/memory/constitution.md` (v1.0.0). Tiene
> precedencia sobre este archivo. Principios no negociables: test-first (rojo-verde-refactor),
> el sistema nunca inventa datos, trazabilidad total de stock y precio desde el alta, cero
> secretos en el código, y nada fuera del PRD vigente.

## Propósito
Software de gestión de stock y precios para una librería (un solo usuario).
ABM de libros, manejo de stock, alta masiva y actualización de precios individual y masiva por Excel, y búsqueda por nombre/editorial o por foto.

## Stack
- Next.js (App Router) — aplicación full-stack: UI + API Routes / Server Actions
- TypeScript
- React
- SQLite (base embebida, un único archivo `.db`, sin servidor) — vía `better-sqlite3`
- Excel (librería `xlsx` o similar), dos flujos separados:
  - Actualización de precios: columnas *libro* y *precio*
  - Alta masiva de libros: columnas *libro*, *editorial*, *stock* y *precio*
- Búsqueda por foto: librería local (aún sin definir cuál)
- Tests: Vitest

## Cómo correr
Instalar:
```bash
npm install
```
Levantar (desarrollo):
```bash
npm run dev
```
Build y producción:
```bash
npm run build
npm start
```
Tests:
```bash
npm test
```

## Qué NO hacer
- No construir una tienda virtual ni opción de compra para clientes: está explícitamente fuera de alcance.
- No reemplazar SQLite por otra base ni por un motor con servidor: la persistencia es un único archivo local (PRD sección 8 — Restricciones).
- No agregar login, roles ni soporte multiusuario: el sistema es de un único usuario y un único acceso.
- No escribir implementación antes de su test en rojo (Constitución, Principio I).
- No completar, adivinar ni estimar datos ausentes o ambiguos: se reportan (Principio II).
- No escribir stock ni precio sin su entrada de historial en la misma transacción; no borrar
  ni editar entradas de historial; no borrar libros físicamente (Principio III).
- No commitear secretos, archivos `*.db` ni Excel reales del negocio (Principio IV).
- No agregar features que no estén en el PRD vigente: primero se enmienda el PRD (Principio V).
