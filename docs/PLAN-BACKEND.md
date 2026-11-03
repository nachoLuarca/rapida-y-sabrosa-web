# Plan del backend — Fases 6 a 10

Cada fase tiene su prompt listo para pegar en Claude Code. Antes de cada fase: sesión limpia (`/clear`) en la
raíz del repo, modelo Opus 5.5 con esfuerzo High. Qué construir está en `docs/BACKEND-SPEC.md`; por qué, en
`docs/ARCHITECTURE.md`.

| Fase | Rama | Entrega | Tag |
|---|---|---|---|
| 6 | `feature/fase-6-api-base` | Pendientes de la web, contratos, PostgreSQL, API base y `GET /api/menu` | `v1.2.0` |
| 7 | `feature/fase-7-pedidos` | `POST /api/orders` y la web consumiendo la API | `v1.3.0` |
| 8 | `feature/fase-8-panel-pedidos` | Autenticación y panel de pedidos en vivo | `v1.4.0` |
| 9 | `feature/fase-9-panel-gestion` | Gestión de carta, zonas, horario y pausa | `v1.5.0` |
| 10 | `feature/fase-10-demo` | Demo full stack con un comando y guion | `v2.0.0` |

## Reglas de trabajo (aplican a todas las fases)

Cada prompt dice "con las reglas de trabajo de docs/PLAN-BACKEND.md". Son estas:

1. **Inicio:** `git switch main`, `git fetch` y `git status`. Si `main` local no está igual a `origin/main` o
   el árbol no está limpio, detenerse y avisar. Crear la rama de la fase desde `main`.
2. **Commits:** pequeños, Conventional Commits en español, autor `nachoLuarca
   <alejandrojesusluarca@gmail.com>`, sin `Co-Authored-By` ni ninguna mención a Claude. Cada commit deja lint,
   typecheck, tests y build en verde.
3. **Nunca:** push, merge, borrar ramas, `--force`, rebase ni reescribir historia.
4. `CLAUDE.md` y los `.env` locales (`.env`, `.env.*.local`, `apps/api/.env`) nunca entran a git.
5. **No inventar datos del local:** lo que está en `null` sigue en `null` y la interfaz lo omite.
6. **WhatsApp:** en las pruebas en el navegador nunca abrir `wa.me` de verdad: espiar `window.open` o usar el
   modo demo.
7. `set -o pipefail` en comandos con `|`.
8. Usar la última versión estable de cada dependencia nueva (verificar con `npm view`).
9. Mantener al día `docs/BACKEND-SPEC.md`, `docs/ARCHITECTURE.md`, el README y mi `CLAUDE.md` local cuando
   algo cambie o se decida.
10. Si algo es ambiguo, elegir lo razonable y avisarlo en el resumen.
11. **Al terminar:**
    - Desde la raíz: `npm ci`, lint, typecheck, tests (con PostgreSQL arriba), build y build:demo, sin
      errores ni warnings.
    - Revisión en el navegador a 1366 y 390 px de lo que cambió, sin scroll horizontal.
    - Cerrar todos los servidores levantados, incluidos los procesos node hijos, y las pestañas abiertas.
      Dejar el contenedor de PostgreSQL como estaba al empezar.
    - Resumen: qué se hizo, lo corregido tras revisar, lo que debo saber, cómo probarlo yo paso a paso y
      `git log --oneline main..<rama>`. Luego detenerse.

## Mi cierre de cada fase (lo hago yo)

```
git status
git --no-pager log main..<rama> --format="%h %an <%ae>%n%b"
git --no-pager diff --stat main..<rama>
git push -u origin <rama>
```

GitHub → Actions: esperar el verde. Si falla, no hacer merge.

```
git switch main
git pull
git merge --no-ff --no-edit <rama>
git --no-pager log --oneline --graph -15
```

```
git tag <tag>
git push
git push origin <tag>
git branch -d <rama>
git push origin --delete <rama>
```

---

## Fase 6 — API base y catálogo

```
Fase 6 de docs/PLAN-BACKEND.md, en la rama feature/fase-6-api-base, con las reglas de trabajo de ese
archivo. Qué construir: docs/BACKEND-SPEC.md.

1. Docs (primer commit)
- Dejé en docs/ los archivos BACKEND-SPEC.md, PLAN-BACKEND.md y ADR-BACKEND.md (sin commitear).
- Integra los ADR-002 a ADR-008 de ADR-BACKEND.md en docs/ARCHITECTURE.md después del ADR-001, actualiza la
  vista general (apps/api, apps/admin, packages/contracts, PostgreSQL) y borra ADR-BACKEND.md.
- Commit con BACKEND-SPEC.md, PLAN-BACKEND.md y ARCHITECTURE.md.

2. Pendientes de la web (commits fix separados)
- Los tests de la web dependen del .env local: con VITE_DEMO=true en un archivo local fallan 6. Haz que
  Vitest fije sus propias variables (modo normal por defecto; los tests del modo demo lo activan
  explícitamente) para que el resultado no dependa de ningún archivo local. Pruébalo creando un
  apps/web/.env.local temporal con VITE_DEMO=true y bórralo después.
- En celular, con productos en el pedido, el botón del header crece con el subtotal y tapa el nombre
  ("RÁPIDA Y SABRO"). En pantallas angostas muestra solo el ícono y la cantidad (la barra flotante ya muestra
  el subtotal), manteniendo el nombre accesible del botón con cantidad y subtotal. Comprueba también que al
  final de la carta el último producto no quede tapado por la barra flotante. Revisa a 360, 390 y 430 px.

3. packages/contracts (@rys/contracts)
- Esquemas Zod y tipos inferidos de: la respuesta de GET /api/menu, el body y la respuesta de
  POST /api/orders, el formato de error. Sin build, igual que @rys/domain. Tests de los esquemas.

4. Dominio
- Agrega a @rys/domain isOpenAt y nextOpening (horario en America/Santiago, rangos que cruzan medianoche,
  cambio de horario de Chile) y la tabla de transiciones de estado del pedido. Funciones puras con tests.

5. PostgreSQL
- docker-compose.yml en la raíz con postgres:17, volumen con nombre, healthcheck y las bases rys y rys_test.
- Scripts en la raíz: db:up, db:down, db:migrate, db:seed.

6. apps/api (@rys/api)
- Estructura y reglas de capas de BACKEND-SPEC.md → apps/api/src.
- config/env.ts con Zod; apps/api/.env.example; tu apps/api/.env local para probar (fuera de git).
- app.ts con createApp(deps), helmet, pino-http con requestId, límite de body, errorHandler con el formato
  de error de la spec, 404 en JSON.
- Esquema Drizzle de catálogo y ajustes: categories, products, product_variants, ingredients,
  delivery_zones y settings. (Pedidos en la Fase 7; usuarios y sesiones en la Fase 8.) Migración generada y
  commiteada.
- Seed idempotente desde docs/data/*.json y la configuración actual de apps/web/src/config/business.ts,
  respetando los null.
- GET /health y GET /api/menu con ETag, 304 y Cache-Control: no-cache, validando la respuesta con el
  esquema de @rys/contracts.
- Tests de integración con supertest contra rys_test (base limpia por archivo): health con y sin base,
  forma completa del menú, agotados incluidos con available false, zonas inactivas excluidas, ETag/304 y
  que el ETag cambie al cambiar un precio.

7. Desarrollo y CI
- npm run dev desde la raíz levanta la API (tsx en modo watch) y la web a la vez. Requiere db:up antes;
  si la base no está arriba, la API lo dice claro en vez de caerse con un stack trace.
- Proxy de /api en el vite.config de la web hacia la API (la web todavía no la usa; eso es la Fase 7).
- CI: servicio postgres:17, migraciones antes de los tests, y los mismos pasos de hoy para todos los
  workspaces.
- README: cómo levantar la base, migrar, sembrar y correr todo.

En el resumen, además: cómo probar yo GET /api/menu (comando exacto) y cuánto tardan los tests de la API.
```

## Fase 7 — Pedidos y web conectada

```
Fase 7 de docs/PLAN-BACKEND.md, en la rama feature/fase-7-pedidos, con las reglas de trabajo de ese archivo.
Qué construir: docs/BACKEND-SPEC.md, secciones "POST /api/orders", "Modo demo de la API" y "Cambios en la
web".

API
- Tablas orders, order_lines y order_status_history con su migración; secuencia para el código RYS-0001.
- Cotización completa del pedido en @rys/domain (líneas, Arma tu pizza, despacho, total) y
  buildOrderMessage con el código del pedido. Tests unitarios.
- POST /api/orders con las reglas en el orden exacto de la spec: validación, honeypot, idempotencia,
  pausa/horario, disponibilidad, recálculo, PRICE_CHANGED, transacción y evento order.created en el bus.
- Rate limit de 10 por IP cada 10 minutos. DEMO_MODE en la respuesta.
- Tests de integración para cada regla, incluidos: mismo Idempotency-Key con el mismo body (200, mismo
  pedido) y con otro body (422), dos requests simultáneos con la misma clave (un solo pedido), producto
  agotado, ingrediente en un producto que no es Arma tu pizza, total manipulado, local cerrado, pedidos
  pausados, snapshots que no cambian al cambiar la carta.
- OpenAPI generado desde @rys/contracts, servido en /api/docs solo en desarrollo.

Web
- CatalogSource/OrderGateway con implementaciones static y api; VITE_DATA_SOURCE; build:demo fuerza static
  y debe seguir funcionando por file:// sin red.
- Carga con esqueleto y error con "Reintentar"; recarga de la carta al volver a la pestaña.
- Agotados, local cerrado y pedidos pausados según la spec.
- Checkout con Idempotency-Key en sessionStorage, expectedTotal, manejo de PRICE_CHANGED,
  PRODUCT_UNAVAILABLE y errores por campo.
- Confirmación con el código y el botón "Abrir WhatsApp" (sin window.open automático); en demo, sin botón.
  La marca de pedido enviado guarda también el código.
- Aviso de privacidad bajo el botón de envío.
- Tests de integración de la web con la API simulada (MSW o un fake del gateway) para cada caso; los tests
  del modo static siguen pasando.

En el resumen, además: cómo hago yo un pedido de punta a punta en local y lo veo en la base (consulta SQL
exacta), y los puntajes de Lighthouse de la web en modo api.
```

## Fase 8 — Panel: autenticación y pedidos en vivo

```
Fase 8 de docs/PLAN-BACKEND.md, en la rama feature/fase-8-panel-pedidos, con las reglas de trabajo de ese
archivo. Qué construir: docs/BACKEND-SPEC.md, secciones "Autenticación y seguridad", "Tiempo real", la
parte de pedidos de "Panel (requieren sesión)" y "Panel (apps/admin)" (rutas /login, /pedidos y
/pedidos/:code).

API
- Tablas admin_users y sessions; argon2id; script user:create que pide la contraseña por consola; usuarios
  de demo en el seed cuando DEMO_MODE=true.
- Login, logout y me; cookie según la spec; rate limit del login; middleware requireSession y requireRole;
  checkOrigin en las mutaciones.
- GET /api/admin/orders (filtros y paginado), GET /api/admin/orders/:code, PATCH .../status con la tabla de
  transiciones del dominio e historial con el usuario.
- SSE en /api/admin/orders/stream con heartbeat; order.updated al cambiar de estado.
- Tests: login correcto e incorrecto con el mismo error, sesión vencida, logout que invalida, usuario
  desactivado, roles, Origin ajeno, transiciones válidas e inválidas, cancelación sin motivo, y que el
  stream reciba order.created y order.updated.

apps/admin (@rys/admin)
- Vite + React + TS + Tailwind con los tokens de docs/DESIGN.md, puerto 5174, proxy de /api.
- /login, /pedidos (tablero por estado, aviso sonoro activable, contador en el título, aria-live) y
  /pedidos/:code (detalle, historial, cancelar con motivo, enlace al WhatsApp del cliente).
- Reconexión del SSE con recarga de la lista; estado "sin conexión" visible.
- Tests de integración con la API simulada.
- npm run dev desde la raíz levanta también el panel.

En el resumen, además: los pasos para que yo vea un pedido hecho desde la web aparecer en el panel en vivo.
```

## Fase 9 — Panel: gestión de carta, zonas y horario

```
Fase 9 de docs/PLAN-BACKEND.md, en la rama feature/fase-9-panel-gestion, con las reglas de trabajo de ese
archivo. Qué construir: docs/BACKEND-SPEC.md, el resto de "Panel (requieren sesión)" y las rutas /carta,
/ingredientes, /zonas y /ajustes de "Panel (apps/admin)".

- Endpoints de productos, variantes, ingredientes, zonas y ajustes con los permisos por rol de la spec y
  sus validaciones. Cada cambio invalida el ETag del menú.
- Pantallas del panel: staff ve solo los interruptores de disponible y la pausa; admin edita todo. Edición
  en línea con guardado explícito, confirmación al pausar pedidos y editor de horario por día con varios
  rangos.
- En la web: el aviso de local cerrado o pausado y los agotados se reflejan al volver a la pestaña o al
  recargar.
- Tests de API por permiso y validación, y de las pantallas del panel.

En el resumen, además: los pasos para que yo marque un producto como agotado en el panel y lo vea en la web.
```

## Fase 10 — Demo lista

```
Fase 10 de docs/PLAN-BACKEND.md, en la rama feature/fase-10-demo, con las reglas de trabajo de ese archivo.
Objetivo: docs/BACKEND-SPEC.md → "Objetivo de esta versión".

- npm run demo desde la raíz: levanta PostgreSQL, migra, siembra con DEMO_MODE=true y arranca API, web y
  panel accesibles desde la red local (--host). Muestra al final las URL locales y de la red (IP del
  notebook) para el celular y el panel, y los usuarios de demo.
- npm run demo:reset: vacía pedidos y sesiones y vuelve a sembrar.
- ALLOWED_ORIGINS acepta la IP de la red local en modo demo.
- orders:anonymize según la spec, con tests.
- docs/DEMO.md: guion de la demo para el local paso a paso (qué mostrar en el celular, qué en el panel y
  en qué orden), cómo permitir el puerto en el Firewall de Windows y qué hacer si el celular no conecta.
- README final: estructura, requisitos, comandos, modos (static, api, demo) y archivos de entorno.
- Revisión final: Lighthouse de la web en modo api (metas de docs/SPEC.md), axe en el panel en sus
  pantallas principales, recorrido completo con teclado en ambas apps.

En el resumen, además: los puntajes finales y el guion resumido en 10 pasos.
```
