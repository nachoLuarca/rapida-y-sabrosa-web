# Backend — especificación

Qué construir para que Rápida y Sabrosa funcione con datos reales: una API en Express, una base PostgreSQL
y un panel para el local. Complementa a `docs/SPEC.md` (la web pública), `docs/DESIGN.md` (marca) y
`docs/ARCHITECTURE.md` (decisiones). El orden de trabajo está en `docs/PLAN-BACKEND.md`.

## Objetivo de esta versión

Una **demo full stack que corre completa en un notebook**, para mostrarle al local:

- El cliente pide desde su celular (conectado a la misma red Wi-Fi) y el pedido aparece al instante en el
  panel abierto en el notebook.
- El local cambia un precio, marca un producto como agotado o pausa los pedidos, y la carta se actualiza.

**Fuera de alcance** (no construir): despliegue en la nube, pago online, API oficial de WhatsApp Business,
cuentas de cliente, seguimiento del pedido para el cliente, fidelización, multi-local.

## Principios

1. **El servidor es la fuente de verdad del precio.** El cliente envía qué quiere, nunca cuánto cuesta. La
   API recalcula todo con `@rys/domain`, el mismo código que usa la web para mostrar precios.
2. **Un pedido se crea una sola vez.** Toda creación es idempotente.
3. **WhatsApp sigue siendo el canal de confirmación con el cliente.** El pedido llega con un código
   (`RYS-0042`) que también existe en el sistema.
4. **Los datos del local que no están confirmados no se inventan:** quedan en `null` y la interfaz los omite
   (igual que en la v1).
5. **La demo estática de la v1 no se rompe:** `build:demo` sigue generando un HTML único que funciona por
   `file://` sin API.

## Stack

Usar la última versión estable de cada paquete (verificar con `npm view`).

| Pieza | Elección |
|---|---|
| Runtime | Node 24 + TypeScript estricto |
| HTTP | Express 5 |
| Validación y contratos | Zod, en `packages/contracts` (compartido por api, web y admin) |
| Base de datos | PostgreSQL 17 en Docker Compose |
| Acceso a datos | Drizzle ORM + drizzle-kit (migraciones SQL versionadas en git) |
| Contraseñas | argon2id |
| Logs | pino + pino-http, con id de request |
| Seguridad HTTP | helmet, rate limit (express-rate-limit, en memoria: hay una sola instancia) |
| Ejecución | `tsx` en desarrollo y en la demo (el despliegue se define cuando exista) |
| Tests | Vitest + supertest contra un PostgreSQL real (base `rys_test`) |
| Panel | Vite + React + TypeScript + Tailwind, con los tokens de `docs/DESIGN.md` |

## Estructura del monorepo

```
apps/
  web/        → carta pública (ya existe)
  admin/      → panel del local (nuevo)
  api/        → API Express (nueva)
packages/
  domain/     → lógica pura: precios, carrito, checkout, mensaje, horario (ya existe)
  contracts/  → esquemas Zod de requests y responses + tipos inferidos (nuevo)
docker-compose.yml → PostgreSQL para desarrollo y tests
```

### apps/api/src

```
config/        env.ts: variables validadas con Zod al arrancar (si falta algo, no arranca)
db/            client.ts, schema/ (tablas Drizzle), migrations/, seed.ts
routes/        URLs y middlewares por módulo; sin lógica
controllers/   leen la request ya validada, llaman al servicio y arman la respuesta
services/      reglas de negocio; no conocen req/res ni SQL
repositories/  único lugar que habla con la base (Drizzle)
middlewares/   validate(schema), requireSession, requireRole, rate limits, checkOrigin, errorHandler
errors/        AppError con código, status y detalles
events/        bus de eventos en memoria para SSE (Fase 7)
http/          utilidades HTTP sin reglas de negocio (ETag)
scripts/       comandos de consola: migrate.ts y seed.ts (npm run db:migrate / db:seed)
logger.ts      pino y pino-http con el id de request
container.ts   arma repositorios y servicios (inyección por constructor, sin framework de DI)
app.ts         createApp(deps): monta todo; los tests lo usan sin levantar el puerto
server.ts      lee env, crea el container y escucha
```

Reglas de capas: un controlador nunca toca la base; un servicio nunca recibe `req`/`res`; un repositorio no
contiene reglas de negocio. Los módulos son: `catalog`, `orders`, `delivery`, `settings`, `auth`.

## Modelo de datos

Dinero siempre en **pesos enteros** (`integer`). Fechas en `timestamptz`. Ids de catálogo como **slug de
texto** (los mismos de `docs/data/*.json`), ids de pedidos y usuarios como `uuid`.

| Tabla | Campos principales |
|---|---|
| `categories` | `id` slug, `name`, `description` null, `kind` (`regular` \| `build_pizza`), `sort_order` |
| `products` | `id` slug, `category_id`, `name`, `description` null, `price` null (null si tiene variantes), `tags` text[], `image_url` null, `available` bool, `sort_order`. Arma tu pizza también es una fila (`arma-tu-pizza`, en la categoría `build_pizza`, `price` null): así se puede marcar agotada; su precio sale de `settings` |
| `product_variants` | `id`, `product_id`, `label` ("500 cc"), `price`, `sort_order` |
| `ingredients` | `id` slug, `name`, `price`, `available` bool, `sort_order` |
| `delivery_zones` | `id` slug, `name`, `fee`, `active` bool, `sort_order` |
| `settings` | una sola fila (`id = 1`): `business_name`, `whatsapp_number`, `pickup_address` null, `opening_hours` jsonb null, `timezone` (`America/Santiago`), `orders_paused` bool, `build_pizza_base_price`, `build_pizza_promo_price`, `build_pizza_promo_included`, `updated_at` |
| `orders` | `id` uuid, `code` único (`RYS-0001`, desde una secuencia), `status`, `fulfillment` (`delivery` \| `pickup`), `zone_id` null, `zone_name` snapshot, `delivery_fee`, `subtotal`, `total`, `payment` (`cash` \| `transfer` \| `card`), `customer_name`, `customer_phone` (normalizado), `address` null, `notes` null, `idempotency_key` único, `request_hash`, `created_at`, `updated_at` |
| `order_lines` | `id`, `order_id`, `product_id`, `product_name` snapshot, `variant_label` snapshot null, `ingredients` jsonb snapshot null (`[{id, name, price, included}]`), `unit_price`, `quantity`, `line_total` |
| `order_status_history` | `id`, `order_id`, `from_status` null, `to_status`, `changed_by` null (usuario), `reason` null, `created_at` |
| `admin_users` | `id` uuid, `email` único, `name`, `password_hash`, `role` (`admin` \| `staff`), `active`, `created_at` |
| `sessions` | `id`, `user_id`, `token_hash` único (SHA-256 del token), `expires_at`, `created_at`, `last_seen_at` |

Los **snapshots** del pedido (nombre, variante, ingredientes, precios, zona) se guardan tal como estaban al
pedir: si mañana cambia un precio, el pedido de ayer no cambia.

`opening_hours` tiene esta forma (rangos que cruzan medianoche permitidos, p. ej. `["19:00","01:00"]`):

```json
{ "mon": [], "tue": [["12:00","15:30"],["19:00","23:30"]], "...": [] }
```

`null` significa "sin horario definido": no hay restricción y la web no muestra horario (igual que hoy).

### Seed

`npm run db:seed` carga la carta desde `docs/data/*.json` y los datos del local desde
`docs/data/business.json`, la misma fuente que lee la web (`apps/web/src/config/business.ts`). Es idempotente y **solo inserta
lo que falta** (por id): nunca pisa precios, disponibilidad ni ajustes que ya estén en la base, así que se puede
correr sobre una base en uso. El reset completo a `docs/data` es el modo `'reset'` del mismo seed, que usará
`npm run demo:reset`: deja como en `docs/data` nombres, precios, orden, disponibilidad, zonas activas y la pausa, y
no toca lo que no viene de `docs/data` (p. ej. una zona creada en el panel). Lo
pendiente de confirmar sigue en `null` o con los precios provisorios marcados. La categoría `build_pizza` es la que
tiene el id de `buildPizza.productId`, la misma regla que usa la web. En modo demo crea además dos usuarios del
panel (ver Autenticación).

## Estados del pedido

| Estado | Etiqueta | Puede pasar a |
|---|---|---|
| `pending` | Pendiente | `confirmed`, `cancelled` |
| `confirmed` | Confirmado | `preparing`, `cancelled` |
| `preparing` | En preparación | `out_for_delivery` (despacho), `ready_for_pickup` (retiro), `cancelled` |
| `out_for_delivery` | En camino | `delivered` |
| `ready_for_pickup` | Listo para retiro | `delivered` |
| `delivered` | Entregado | — |
| `cancelled` | Cancelado | — (requiere `reason`) |

La tabla de transiciones vive en `@rys/domain` (función pura con tests) y la usan la API y el panel. Cada
cambio queda en `order_status_history` con el usuario que lo hizo.

## Horario

Función pura `isOpenAt(openingHours, date, timezone)` en `@rys/domain`, más `nextOpening(...)` para mostrar
"Abrimos hoy a las 19:00". Se calcula siempre en `America/Santiago`. Tests con fechas fijas, incluidos los
rangos que cruzan medianoche y el cambio de horario de Chile.

Se puede pedir solo si: `orders_paused = false` **y** (`opening_hours` es `null` **o** el local está abierto).

## API

Todas las respuestas son JSON. Errores con un formato único:

```json
{ "error": { "code": "PRODUCT_UNAVAILABLE", "message": "Texto en español para mostrar", "details": {}, "requestId": "..." } }
```

| Status | Códigos |
|---|---|
| 400 | `VALIDATION_ERROR` (con `details` por campo, mismos mensajes que el checkout de la web; también body que no es JSON o de más de 32 kB, con `details._`) |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN`, `INVALID_ORIGIN` |
| 404 | `NOT_FOUND` |
| 409 | `STORE_CLOSED`, `ORDERS_PAUSED`, `PRODUCT_UNAVAILABLE`, `PRICE_CHANGED`, `INVALID_TRANSITION` |
| 422 | `IDEMPOTENCY_KEY_REUSED` |
| 429 | `RATE_LIMITED` (con `Retry-After`) |
| 500 | `INTERNAL_ERROR` (sin detalles internos; el detalle va al log con el `requestId`) |

### Públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | `{ status: "ok", db: "ok" }`; 503 si la base no responde |
| `GET` | `/api/menu` | Carta completa para la web (ver abajo). `ETag` + `Cache-Control: no-cache`; responde 304 si no cambió |
| `POST` | `/api/orders` | Crea un pedido (ver abajo) |

**`GET /api/menu`** devuelve: categorías ordenadas con sus productos y variantes (los agotados vienen con
`available: false`, no se ocultan), ingredientes, zonas activas, configuración de Arma tu pizza y
`business: { name, whatsappNumber, pickupAddress, openingHours, isOpen, nextOpening, ordersPaused }`. El
`ETag` cambia cuando cambia cualquier dato del catálogo o de los ajustes.

Forma exacta (esquema `menuResponseSchema` de `@rys/contracts`; la respuesta se valida con él antes de salir):

```
{
  categories: [{ id, name, description|null, kind: "regular"|"build_pizza", products: [{ id, name, description|null,
                 price|null, variants: [{ id, label, price }], tags: [], imageUrl|null, available }] }],
  ingredients: [{ id, name, price, available }],
  zones: [{ id, name, fee }],
  buildPizza: { productId, name, description|null, basePrice, promoPrice, includedInPromo, available },
  business: { name, whatsappNumber, pickupAddress|null, openingHours|null, isOpen, nextOpening|null, ordersPaused }
}
```

- Un producto trae `price` o `variants`, nunca ambos. La categoría `build_pizza` viene con `products: []`: lo suyo
  va en `buildPizza`.
- `openingHours` trae los siete días (`mon` … `sun`), cada uno con sus rangos `["HH:MM","HH:MM"]`.
- `nextOpening` es un instante ISO 8601 en UTC (`2026-11-03T22:00:00.000Z`); la web lo muestra en hora de Santiago.
  Es `null` si el local está abierto o no tiene horario.
- El `ETag` es el SHA-256 del body: también cambia cuando el local abre o cierra, porque cambian `isOpen` y
  `nextOpening`.

**`POST /api/orders`**

- Header obligatorio `Idempotency-Key` (uuid generado por la web por cada intento de checkout).
- Body (esquema en `packages/contracts`):
  - `lines: [{ productId, variantId?, ingredientIds?, quantity }]` (1 a 50 por línea, máximo 30 líneas)
  - `customer: { name, phone }`, `fulfillment`, `zoneId?`, `address?`, `payment`, `notes?`
  - `expectedTotal`: el total que el cliente vio en pantalla
  - `website`: campo trampa (honeypot); la web lo deja vacío y oculto
- Reglas, en este orden:
  1. Validación del esquema (las mismas reglas de `docs/SPEC.md` → Checkout).
  2. Honeypot con contenido → 400 genérico, sin crear nada.
  3. Idempotencia: si la clave existe con el mismo `request_hash` → 200 con el mismo pedido; si existe con
     otro body → 422 `IDEMPOTENCY_KEY_REUSED`.
  4. `ORDERS_PAUSED` o `STORE_CLOSED` (409, con `nextOpening`).
  5. Cada línea: producto existe y está disponible; la variante pertenece al producto; los ingredientes
     existen y están disponibles; solo `build_pizza` acepta ingredientes. Si falla → 409
     `PRODUCT_UNAVAILABLE` con los ids afectados.
  6. Recalcula con `@rys/domain` (precio de Arma tu pizza, totales, despacho de la zona).
  7. Si el total calculado ≠ `expectedTotal` → 409 `PRICE_CHANGED` con la cotización nueva, sin crear nada.
  8. Transacción: inserta `orders`, `order_lines` y el primer registro de `order_status_history`.
  9. Emite `order.created` al bus de eventos.
- Respuesta 201: `{ code, status, lines, subtotal, deliveryFee, total, message, whatsappUrl, demo }`, donde
  `message` es el texto de `buildOrderMessage` con el código incluido (`*Nuevo pedido RYS-0042 — Rápida y
  Sabrosa*`) y `whatsappUrl` es `null` en modo demo.
- Rate limit: 10 pedidos por IP cada 10 minutos.

Detalles decididos en la Fase 7:

- `payment` va como código: `cash`, `transfer` o `card` (Efectivo, Transferencia y Tarjeta en el mensaje).
- Una zona que no existe o está desactivada es un `VALIDATION_ERROR` en `zoneId` (paso 6), con el mismo mensaje que
  el checkout de la web.
- `details` de cada error: `STORE_CLOSED` y `ORDERS_PAUSED` → `{ nextOpening }` (ISO o `null`);
  `PRODUCT_UNAVAILABLE` → `{ productIds, variantIds, ingredientIds }`; `PRICE_CHANGED` → `{ quote: { lines,
  subtotal, deliveryFee, total } }`; `RATE_LIMITED` → `{ retryAfterSeconds }`. Los esquemas están en
  `@rys/contracts`.
- `request_hash` es el SHA-256 del body ya validado (textos recortados, celular normalizado) con las claves en orden:
  el mismo pedido escrito con espacios de más o en otro orden es el mismo pedido.
- Como la idempotencia (paso 3) va antes que la pausa y la disponibilidad, un reintento con la misma clave recibe el
  mismo pedido aunque entretanto se haya pausado el local o cambiado la carta. La respuesta se arma desde los
  snapshots guardados, así que el mensaje es idéntico.
- Dos requests simultáneos con la misma clave: uno crea el pedido y el otro choca con la clave única y responde 200
  con ese pedido. Un pedido que no llega a crearse puede dejar un número de la secuencia sin usar.
- El rate limit cuenta todos los POST, también los inválidos. La API solo le cree el `X-Forwarded-For` a un proxy
  local (`trust proxy: loopback`); el proxy de Vite lo agrega (`xfwd`), así cada celular de la demo tiene su
  propio límite.
- El mensaje del pedido (`buildOrderMessage`) lleva el código en el título; el resto es igual al de la v1.

### Panel (requieren sesión)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/api/admin/session` | — | Login `{ email, password }`; setea la cookie. Rate limit 5 intentos por IP cada 15 min. Error siempre genérico |
| `DELETE` | `/api/admin/session` | ambos | Logout: borra la sesión en la base y la cookie |
| `GET` | `/api/admin/me` | ambos | Usuario actual |
| `GET` | `/api/admin/orders` | ambos | Filtros `status`, `from`, `to`, `q` (código o nombre); paginado |
| `GET` | `/api/admin/orders/:code` | ambos | Detalle con líneas e historial |
| `PATCH` | `/api/admin/orders/:code/status` | ambos | `{ status, reason? }`; valida la transición |
| `GET` | `/api/admin/orders/stream` | ambos | SSE: eventos `order.created` y `order.updated`, heartbeat cada 25 s |
| `PATCH` | `/api/admin/products/:id` | staff: solo `available`; admin: todo | `{ name?, description?, price?, available? }` |
| `PATCH` | `/api/admin/variants/:id` | admin | `{ label?, price? }` |
| `PATCH` | `/api/admin/ingredients/:id` | staff: solo `available`; admin: todo | `{ name?, price?, available? }` |
| `GET` / `POST` / `PATCH` | `/api/admin/zones[/:id]` | admin | Crear y editar zonas (no se borran: se desactivan) |
| `GET` / `PATCH` | `/api/admin/settings` | `ordersPaused`: ambos; el resto: admin | Horario, dirección de retiro, número, pausa, precios de Arma tu pizza |

Validaciones del panel: precios enteros entre 0 y 1.000.000; el número de WhatsApp con el mismo
normalizador del dominio; el horario con rangos `HH:MM` válidos.

Detalles decididos en la Fase 9:

- Los esquemas están en `@rys/contracts` (`management.ts`). Todos los `PATCH` son parciales y estrictos: un campo
  que no existe o un body sin cambios es `VALIDATION_ERROR` (`details._`). Los textos se recortan; una descripción o
  una dirección de retiro vacía queda en `null` (la web la omite). Nombres hasta 80 caracteres, descripción hasta
  300, dirección hasta 200.
- **Permisos por campo:** caja (`staff`) puede cambiar solo `available` en productos e ingredientes y solo
  `ordersPaused` en los ajustes. Si el cambio trae cualquier otro campo, responde 403 `FORBIDDEN` y no aplica nada.
  Variantes y zonas (también el `GET`) son solo de administración. Ambos roles leen `GET /api/admin/settings`.
- El precio vive en un solo lugar: un producto con variantes no acepta `price` (se cambia en cada variante) y Arma
  tu pizza tampoco (sus precios están en los ajustes). Los dos casos son `VALIDATION_ERROR` en `details.price`.
- **Zonas:** `POST /api/admin/zones` `{ name, fee, active? }` (activa por defecto) arma el id desde el nombre
  (`slugify` de `@rys/domain`: "Villa Ñandú" → `villa-nandu`); si ya existe, le agrega `-2`, `-3`… No se aceptan
  dos zonas con el mismo nombre (sin distinguir tildes ni mayúsculas). La zona nueva queda al final. No hay
  `DELETE`.
- **Ajustes:** `PATCH /api/admin/settings` acepta `ordersPaused`, `whatsappNumber` (como lo escriba el local:
  `+56 9 1234 5678` → `56912345678`), `pickupAddress`, `openingHours` (los siete días, hasta 6 rangos por día, o
  `null` para "sin horario definido") y los tres valores de Arma tu pizza (ingredientes incluidos entre 0 y 30). El
  nombre del local y la zona horaria no se cambian desde el panel. Cada cambio actualiza `updated_at`.
- Los `PATCH` responden el recurso actualizado (esquemas `adminProductSchema`, `adminVariantSchema`,
  `adminIngredientSchema`, `adminZoneSchema` y `adminSettingsSchema`).
- **ETag:** no hay que invalidar nada a mano. El ETag del menú es el SHA-256 del body, así que cambia con cualquier
  cambio que la web vea (y no cambia, por ejemplo, al crear una zona inactiva).
- El log registra quién cambió qué (recurso, id, nombres de los campos y usuario), nunca los valores.

## Autenticación y seguridad

- **Sesión con cookie**, no JWT: cookie `rys_session`, `HttpOnly`, `SameSite=Lax`, `Secure` fuera de
  desarrollo, `Path=/api`. El token es aleatorio (32 bytes) y en la base se guarda solo su hash SHA-256.
  Duración 12 horas, renovada con el uso. Logout y desactivar un usuario invalidan sus sesiones.
- **CSRF:** las mutaciones del panel exigen que el header `Origin` esté en `ALLOWED_ORIGINS`
  (`INVALID_ORIGIN` si no). Junto con `SameSite=Lax` es suficiente para este caso.
- **Roles:** `admin` (todo) y `staff` (pedidos, disponibilidad y pausa).
- **Usuarios:** se crean con `npm run user:create -- --email ... --name ... --role ...` (pide la contraseña
  por consola). En modo demo, el seed crea `admin@demo.local` y `caja@demo.local` con la contraseña de
  `DEMO_PASSWORD`. Contraseñas con argon2id, mínimo 10 caracteres.
- **helmet**, `x-powered-by` desactivado, límite de body de 32 kB.
- **Logs:** nunca registran contraseñas, cookies ni el body de los pedidos (datos personales); sí el código
  del pedido y el `requestId`.

## Tiempo real

`order.created` y `order.updated` se publican en un bus de eventos en memoria (`EventEmitter`) y se envían
por SSE a los paneles conectados. Una sola instancia de la API, así que alcanza. El panel se reconecta solo
(`EventSource`) y, al reconectar, vuelve a pedir la lista para no perder eventos.

Detalles decididos en la Fase 8:

- Cada evento trae un resumen (`{ code, status, fulfillment, total, createdAt }`, esquema `orderStreamEventSchema`),
  sin datos del cliente: el panel vuelve a pedir la lista con cada evento y con cada (re)conexión.
- El stream manda `retry: 3000` al conectarse y un comentario `: ping` cada 25 s. Si el navegador cierra la
  conexión para siempre (por ejemplo, con un 401), el panel revisa la sesión y vuelve a conectarse a los 3 s.

## Modo demo de la API

`DEMO_MODE=true`:

- Los pedidos se crean, se guardan y llegan al panel en vivo.
- La respuesta trae `demo: true` y `whatsappUrl: null`: nada se envía al WhatsApp del local.
- El seed crea los usuarios de demo.
- `npm run demo:reset` vacía pedidos y sesiones y vuelve a cargar el seed.

Detalles decididos en la Fase 10 (guion de la demo en `docs/DEMO.md`):

- `npm run demo` (`scripts/demo.mjs`): revisa que exista `apps/api/.env` y que los puertos 3000, 5173 y 5174 estén
  libres; levanta PostgreSQL, migra y siembra con `DEMO_MODE=true`; compila la web con `vite build --mode api`
  (`apps/web/.env.api`, salida en `apps/web/dist-api/`, aparte de la web estática de `dist/`) y el panel; y los sirve
  con `vite preview --host` en 5173 y 5174 (el proxy de `/api` de Vite también funciona en preview), con la API en
  3000. Cuando los tres responden, muestra las URL locales y de la red y los usuarios de demo (sin la contraseña:
  "la de `DEMO_PASSWORD`"). Si uno se cae, cierra todo. La API corre con `LOG_LEVEL=warn` salvo que se pida otro.
- La IP para el celular sale de las interfaces de red: IPv4 de red privada, el Wi-Fi primero, luego cable; se
  descartan los adaptadores virtuales y de VPN (WSL, Hyper-V, VirtualBox, TUN/TAP…). Si hay más de una, se ofrecen
  las otras. Lógica pura en `scripts/lib/network.mjs`, con tests de `node --test` (`npm run test:scripts`, parte de
  `npm test`).
- **Orígenes:** con `DEMO_MODE=true`, `checkOrigin` acepta además un origen `http` con IP de red privada (10/8,
  172.16/12, 192.168/16) y el puerto de alguno de `ALLOWED_ORIGINS` (5173 o 5174 por defecto). Así no hay que tocar
  `ALLOWED_ORIGINS` cada vez que cambia la red. Fuera de demo no cambia nada.
- **`demo:reset`** (`apps/api/src/db/demo-reset.ts`): en una transacción borra `orders` (con sus líneas e historial)
  y `sessions` y reinicia la secuencia (el próximo pedido es `RYS-0001`); después aplica el modo `'reset'` del seed
  (carta, zonas, ajustes y pausa como en `docs/data`) y deja los usuarios de demo activos y con `DEMO_PASSWORD`. No
  toca zonas creadas en el panel ni otros usuarios. Se niega a correr sin `DEMO_MODE=true` en el entorno o en
  `apps/api/.env`, porque borra todos los pedidos.

## Configuración (apps/api/.env, fuera de git; plantilla en .env.example)

| Variable | Ejemplo | Notas |
|---|---|---|
| `DATABASE_URL` | `postgres://rys:rys@localhost:5432/rys` | |
| `DATABASE_URL_TEST` | `postgres://rys:rys@localhost:5432/rys_test` | solo tests |
| `PORT` | `3000` | |
| `NODE_ENV` | `development` | |
| `DEMO_MODE` | `true` | |
| `DEMO_PASSWORD` | — | obligatoria si `DEMO_MODE=true` |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:5174` | se agrega la IP de la red local para la demo |
| `SESSION_TTL_HOURS` | `12` | |
| `LOG_LEVEL` | `info` | |

## Cambios en la web (apps/web)

1. **Fuente de datos intercambiable:** una interfaz `CatalogSource`/`OrderGateway` con dos implementaciones:
   - `static`: la de hoy (datos en el bundle, pedido armado en el navegador). La usa `build:demo`.
   - `api`: `GET /api/menu` y `POST /api/orders`.
   Se elige con `VITE_DATA_SOURCE=static|api`. `build:demo` fuerza `static`.
2. **Carga de la carta:** esqueleto mientras carga; si la API no responde, mensaje claro con "Reintentar".
   Se vuelve a pedir la carta al volver a la pestaña (con `ETag` no cuesta nada).
3. **Agotados:** fila atenuada, etiqueta "Agotado" y sin botón "Agregar". Si algo del carrito se agota, se
   avisa en el panel del pedido y no se puede enviar hasta quitarlo.
4. **Local cerrado o pedidos pausados:** aviso visible arriba con el próximo horario; la carta se puede ver,
   pero "Continuar con mis datos" queda deshabilitado con la explicación.
5. **Checkout contra la API:**
   - Genera un `Idempotency-Key` por intento y lo guarda en `sessionStorage` hasta que el pedido se crea
     (si se cae la red y reintenta, no se duplica).
   - Envía `expectedTotal`. Ante `PRICE_CHANGED`, muestra los precios nuevos y pide confirmar de nuevo.
   - Ante `PRODUCT_UNAVAILABLE`, marca las líneas afectadas.
   - Los errores de validación del servidor se muestran junto a cada campo, como los del cliente.
6. **Confirmación:** "Pedido RYS-0042 creado" con el botón **"Abrir WhatsApp"** (el clic del usuario abre
   `whatsappUrl`, así el navegador no lo bloquea como popup). En modo demo: "Pedido RYS-0042 recibido (demo)"
   sin botón de WhatsApp. La marca de pedido enviado guarda también el código (no es dato personal).
7. **Aviso de privacidad** breve bajo el botón de envío: para qué se usan los datos y que el local los
   guarda solo para gestionar el pedido.
8. En desarrollo, Vite hace proxy de `/api` hacia la API: la web y la API comparten origen y no hace falta
   CORS.

Detalles decididos en la Fase 7:

- `VITE_DATA_SOURCE` vale `static` por defecto (la web publicada no tiene API todavía); `npm run dev` usa `api`
  con `apps/web/.env.development`. La elección se resuelve al compilar: en `static` el código de la API no entra al
  bundle.
- El `Idempotency-Key` se reusa mientras el body sea el mismo (se guarda en `sessionStorage` junto con una huella
  del body, nunca los datos) y cambia si cambian los datos. Se genera con `crypto.getRandomValues`, porque
  `crypto.randomUUID` no existe en HTTP por IP (la demo en el celular).
- Ante `PRICE_CHANGED`, la web vuelve a pedir la carta (el carrito toma los precios nuevos) y lista lo que cambió
  ("Suprema: $13.000 → $13.500 c/u", "Total nuevo"). Ante `PRODUCT_UNAVAILABLE` vuelve al paso del pedido, donde
  las líneas agotadas tienen "Quitar". Ante `ORDERS_PAUSED`/`STORE_CLOSED` vuelve a pedir la carta y aparece el aviso.
- La confirmación con la API no ofrece "Volver a mi pedido": reenviarlo crearía otro pedido. Al recargar se ve
  "Tu pedido RYS-0042 ya quedó registrado en el local".
- El aviso de local cerrado o pausado va bajo el header en toda la página; la carta se vuelve a pedir al volver a la
  pestaña y cuando llega la hora de abrir.
- Aviso de privacidad (modo api): "Usamos tu nombre, celular y dirección solo para preparar y entregar este pedido.
  El local los guarda únicamente para gestionarlo." En modo static dice que los datos van solo en el mensaje de
  WhatsApp.

### Autenticación: detalles decididos en la Fase 8

- La cookie es `Secure` solo con `NODE_ENV=production`: en desarrollo y en la demo la web va por HTTP.
- El login también exige un `Origin` permitido (como toda mutación del panel).
- Contraseña mala, email que no existe y usuario desactivado reciben el mismo 401 `INVALID_CREDENTIALS`; con un
  email inexistente igual se verifica un hash, para que tarde lo mismo.
- El rate limit del login cuenta solo los intentos fallidos (5 por IP cada 15 minutos).
- La sesión se renueva con el uso, escribiendo en la base a lo más una vez por minuto, y la cookie se vuelve a mandar
  con el vencimiento nuevo.
- Un cambio de estado se aplica solo si el pedido sigue en el estado que se leyó: si otra persona lo cambió justo
  antes, responde 409 `INVALID_TRANSITION`. Cancelar sin motivo responde 400 `VALIDATION_ERROR` con
  `details.reason`.
- `GET /api/admin/orders`: `status` acepta varios separados por coma; `from` (incluido) y `to` (excluido) filtran
  por la fecha de creación; `q` busca en el código o en el nombre; `pageSize` hasta 100; el más nuevo primero.
- `order_status_history.changed_by` apunta a `admin_users` (si el usuario se borra, queda en null).
- `db:seed` crea los usuarios de demo solo si faltan (no les cambia la contraseña); el modo `reset` del seed, para
  `demo:reset`, los deja con `DEMO_PASSWORD` y activos.

## Panel (apps/admin)

Vite + React + TypeScript + Tailwind con los tokens de la marca. Pensado para notebook y tablet; usable en
celular.

| Ruta | Contenido |
|---|---|
| `/login` | Email y contraseña; errores genéricos |
| `/pedidos` | Tablero por estado (Pendiente, Confirmado, En preparación, En camino o Listo, Entregados de hoy). Pedido nuevo: entra arriba, se destaca, suena un aviso (activable) y el título de la pestaña muestra cuántos pendientes hay. Botón de la siguiente acción en cada tarjeta ("Confirmar", "A preparar"…) |
| `/pedidos/:code` | Detalle: líneas con ingredientes, totales, cliente, dirección, comentario, historial de estados, cancelar con motivo, enlace a WhatsApp del cliente |
| `/carta` | Lista por categoría: interruptor de disponible, edición de precio (staff solo ve el interruptor) |
| `/ingredientes` | Igual que la carta |
| `/zonas` | Nombre, costo y activa (admin) |
| `/ajustes` | Pausar pedidos (ambos); horario por día, dirección de retiro, número de WhatsApp y precios de Arma tu pizza (admin) |

Con proxy de `/api` en desarrollo (mismo origen, la cookie funciona sin configuración extra). Accesible:
foco visible, todo usable con teclado, estados anunciados a lectores de pantalla (`aria-live` para pedidos
nuevos).

Detalles decididos en la Fase 8:

- Sin librería de rutas (CLAUDE.md): un router mínimo con la History API para `/login`, `/pedidos` y
  `/pedidos/:code`. Sin sesión, cualquier ruta muestra el login y, al entrar, se queda en esa ruta.
- El tablero no muestra los cancelados (se ven en el detalle). "Entregados de hoy" son los entregados creados desde
  las 00:00 de Santiago.
- Un pedido nuevo entra arriba de "Pendientes" con la etiqueta "Nuevo" hasta que alguien lo mueve. El aviso sonoro
  son dos notas con Web Audio (sin archivos); se activa con el botón del header y se recuerda en `localStorage`.
- El estado de la conexión en vivo se ve siempre en el header: "En vivo", "Conectando…" o "Sin conexión:
  reintentando…".
- Los colores, tipografías y el foco salen de `packages/tokens`, el mismo CSS que usa la web.

Detalles decididos en la Fase 9:

- El header tiene un menú de secciones (Pedidos, Carta, Ingredientes, Zonas, Ajustes) con `aria-current` en la
  actual. Caja no ve Zonas; si entra a `/zonas` por la URL, ve "Esta sección es solo para administración.". En
  celular el nombre del usuario queda solo para lectores de pantalla, para que el header no ocupe media pantalla.
- `/carta` e `/ingredientes` leen la carta de `GET /api/menu` (no hay un `GET` de productos propio). Arma tu pizza
  aparece como producto de su categoría: se puede agotar, y su precio remite a Ajustes.
- Los interruptores de disponible (y de zona activa) aplican el cambio al tiro: son `role="switch"` y, si falla,
  quedan como estaban y el error se ve en la fila. Lo demás se edita en línea con "Editar" y no cambia nada hasta
  "Guardar"; "Cancelar" descarta lo escrito, solo se manda lo que cambió y el foco vuelve al botón "Editar".
- Los precios se pueden escribir con puntos o signo peso (`$13.500`). Los errores del panel y los de la API salen
  junto a su campo (`aria-describedby`); los de una variante, en esa variante.
- Pausar pide confirmación en un `<dialog>` nativo con el foco en "No pausar"; reanudar no la pide.
- Horario: una casilla "El local tiene un horario definido" (desmarcada = `null`) y, por día, rangos con
  "Agregar rango" y "Quitar" (hasta 6). No se guarda con un rango a medio llenar ni con todos los días cerrados.
- En la web no cambió el código: ya volvía a pedir la carta al volver a la pestaña y al recargar, así que los
  agotados, la pausa y el horario se ven ahí. Se agregaron tests que lo cubren.

Detalles decididos en la Fase 10 (revisión con axe y con teclado):

- Los botones ocupados mientras se guarda llevan `aria-disabled`, no `disabled`: un botón deshabilitado pierde el
  foco y el teclado vuelve al inicio de la página. Cada acción ignora un segundo clic mientras guarda.
- El texto visible de un interruptor no cambia con su estado ("Disponible", "Activa") y está en su nombre accesible
  (WCAG 2.5.3); el estado apagado se muestra como una etiqueta ("Agotado", "Desactivada") junto al nombre.
- Al cambiar de sección, el foco va al título de la página nueva. Al avanzar un pedido en el tablero, el foco lo sigue
  hasta su tarjeta en la columna nueva. En el horario, "Agregar rango" lleva el foco a la hora de apertura del rango
  nuevo y "Quitar" lo deja en "Agregar rango" del mismo día.

## Calidad

- Lint, typecheck, tests y builds sin errores ni warnings en todos los workspaces.
- Tests de la API de integración contra PostgreSQL real: cada archivo trabaja sobre una base limpia
  (migraciones + seed mínimo). Cubren cada regla de `POST /api/orders`, las transiciones de estado, roles,
  Origin, rate limits, ETag, SSE y el modo demo.
- La lógica nueva pura (`isOpenAt`, transiciones, cotización del pedido completo) va en `@rys/domain` con
  tests unitarios.
- CI de GitHub Actions con un servicio `postgres:17`.
- La web mantiene las metas de `docs/SPEC.md` (Lighthouse ≥ 95 en Accesibilidad, Buenas prácticas y SEO).
- Documentación de la API en OpenAPI generada desde los esquemas de `packages/contracts`, servida en
  `/api/docs` solo en desarrollo.

## Datos personales

Los pedidos guardan nombre, teléfono y dirección del cliente.

- Aviso de privacidad en el checkout (ver Cambios en la web).
- `npm run orders:anonymize -- --older-than 90d` reemplaza nombre, teléfono, dirección y comentario de los
  pedidos antiguos y conserva montos y productos para estadísticas.
- Nunca se registran en logs.

Detalles decididos en la Fase 10:

- `--older-than` va en días (`90d`, entre 1 y 3650) y se cuenta desde la fecha de creación del pedido. `--dry-run`
  solo dice cuántos pedidos cambiaría.
- Nombre → "Cliente anonimizado"; celular → vacío; dirección → "Dirección anonimizada" en los despachos (la tabla
  exige dirección en un despacho) y `null` en los retiros; comentario → `null`. También se reemplaza `request_hash`,
  porque es la huella de un body con esos datos. Montos, líneas, zona, pago, estados e historial se conservan.
- La columna `orders.anonymized_at` (migración `0003`) marca cuándo se hizo: cada pedido se anonimiza una sola vez y
  correrlo de nuevo no cambia nada. `GET /api/admin/orders/:code` la trae como `anonymizedAt`, y el panel muestra
  que los datos se anonimizaron en vez del celular y el enlace a WhatsApp.
- No se puede deshacer. Los motivos de cancelación del historial no se tocan (los escribe el local).

## Pendiente de confirmar con el local

Lo mismo de `docs/SPEC.md` (precios de ingredientes, horario, dirección de retiro, tamaños, fotos, logo),
más: quiénes usarán el panel y con qué rol, y si quieren pausar pedidos manualmente además del horario.
