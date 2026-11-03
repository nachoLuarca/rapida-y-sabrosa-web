# Rápida y Sabrosa — web de pedidos

[![CI](https://github.com/nachoLuarca/rapida-y-sabrosa-web/actions/workflows/ci.yml/badge.svg)](https://github.com/nachoLuarca/rapida-y-sabrosa-web/actions/workflows/ci.yml)

Web de la pizzería **Rápida y Sabrosa (Espacio 308)** de Isla de Maipo. Muestra la carta, deja armar el pedido y lo
envía por WhatsApp al local. No tiene pago online.

La web publicada sigue siendo un sitio estático. En paralelo se construye una API con PostgreSQL y un panel para el
local (`docs/BACKEND-SPEC.md`, por fases en `docs/PLAN-BACKEND.md`): hoy la API ya sirve la carta desde la base,
pero la web todavía no la usa.

## Estructura del repositorio

Es un monorepo con npm workspaces:

```
apps/
  web/                la web de pedidos (Vite + React): carta, carrito, Arma tu pizza y checkout
  api/                @rys/api: API en Express 5 sobre PostgreSQL con Drizzle (GET /health, GET /api/menu)
packages/
  domain/             @rys/domain: reglas de negocio puras y sus tipos, compartidas entre apps
  contracts/          @rys/contracts: esquemas Zod de requests y responses de la API
docker-compose.yml    PostgreSQL 17 para desarrollo y tests
docs/                 especificación, diseño, planes, arquitectura y datos de la carta
```

Más adelante se suma `apps/admin` (panel del local). El detalle y el porqué están en `docs/ARCHITECTURE.md`.

## Cómo correr el proyecto

Necesitas Node 24 y Docker (para PostgreSQL). Todos los comandos se corren desde la raíz del repositorio.

La primera vez:

```
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up
npm run db:migrate
npm run db:seed
```

Y para trabajar:

```
npm run db:up        # si la base no está arriba
npm run dev
```

`npm run dev` levanta la API en `http://localhost:3000` y la web en `http://localhost:5173`, con el prefijo `[api]` o
`[web]` en cada línea. Ctrl+C cierra las dos. En la web, `/api` va a la API por el proxy de Vite (mismo origen, sin
CORS). Si la base no está arriba, la API lo dice y se detiene; la web sigue funcionando igual, porque todavía usa la
carta del bundle.

Para ver la carta que sirve la API:

```
curl -i http://localhost:3000/api/menu
```

| Comando              | Qué hace |
|----------------------|----------|
| `npm run dev`        | API (tsx en modo watch) y web (Vite) a la vez |
| `npm run build`      | Build de producción de la web en `apps/web/dist/` (la API no tiene build: corre con tsx) |
| `npm run build:demo` | Un solo `index.html` autocontenido en modo demo, en `apps/web/dist-demo/` |
| `npm test`           | Corre una vez los tests de todos los workspaces. Los de la API necesitan la base arriba |
| `npm run lint`       | Revisa el código de todos los workspaces |
| `npm run typecheck`  | Revisa los tipos de todos los workspaces |
| `npm run db:up`      | Levanta PostgreSQL en Docker y espera a que esté listo |
| `npm run db:down`    | Baja el contenedor. Los datos quedan en el volumen `rapida-y-sabrosa_postgres-data` |
| `npm run db:migrate` | Aplica las migraciones pendientes a la base de `DATABASE_URL` |
| `npm run db:seed`    | Carga la carta de `docs/data` y los datos del local (ver abajo) |

Para correr un script en un solo workspace, agrega `--workspace`:

```
npm test --workspace packages/domain
npm run test:watch --workspace apps/web
npm run dev --workspace apps/api
```

### Base de datos

`docker-compose.yml` crea dos bases en el mismo PostgreSQL: `rys` para desarrollo y `rys_test` para los tests de la
API. Solo escucha en `127.0.0.1:5432`, no en la red local.

- **Migraciones:** el esquema está en `apps/api/src/db/schema/`. Si lo cambias, genera la migración con
  `npm run db:generate --workspace apps/api` y commitéala (queda en `apps/api/src/db/migrations/`).
- **Seed:** `npm run db:seed` inserta lo que falte de la carta, las zonas, los ingredientes y los ajustes de
  `docs/data` y `apps/api/src/db/seed-business.ts`. **Nunca pisa lo que ya está en la base** (precios, agotados,
  ajustes): se puede correr las veces que quieras. Si cambias un precio en `docs/data`, el seed no lo actualiza en
  una base que ya tiene ese producto; volver todo a `docs/data` será `npm run demo:reset` (Fase 10).
- **Tests:** cada archivo de tests de la API vacía `rys_test` y vuelve a cargar el seed. Nunca apuntes
  `DATABASE_URL_TEST` a una base con datos que importen (los tests se niegan si el nombre no termina en `_test`).
- Para empezar de cero: `docker compose down -v` borra el contenedor y el volumen con los datos.

Las dependencias se instalan siempre desde la raíz, donde está el único `package-lock.json`. Para agregar una a un
workspace: `npm install <paquete> --workspace apps/web`.

Cada push a cualquier rama corre todo esto en GitHub Actions (`.github/workflows/ci.yml`).

Si `npm test` tarda minutos y falla con `Test timed out`, revisa si el notebook se suspendió mientras corría: el
modo de espera congela los procesos y los tests fallan al despertar. Vuelve a correrlos con el equipo activo.

Los tests de la web no dependen de tus `.env` locales: `apps/web/vite.config.ts` fija `VITE_DEMO=false` y el número
del local mientras corren.

## Cómo cambiar los datos del local

Los datos nunca van dentro de un componente. Después de cambiarlos, corre `npm test` y publica de nuevo. Mientras la
web no use la API, la carta vive en dos lugares: el bundle de la web y la base (que se carga desde `docs/data` con
`npm run db:seed`). Después de cambiar `docs/data`, vuelve a correr `npm run db:seed`.

### Precios y productos

Están en `apps/web/src/data/menu.ts`. Los precios son enteros en pesos, sin puntos: `13000` se muestra como
`$13.000`.

La misma carta está en `docs/data/menu.json`. **Cambia los dos archivos**: un test falla si quedan distintos.

### Zonas de despacho

En `apps/web/src/data/zones.ts` y `docs/data/zones.json`: cada zona tiene `id`, `name` y `fee` (costo de despacho).
El sector del checkout y la sección Despacho se actualizan solos.

### Ingredientes de Arma tu pizza

En `apps/web/src/data/ingredients.ts` y `docs/data/ingredients.json`. Los precios de hoy son provisorios: falta
confirmarlos con el local.

### Horario y dirección de retiro

En `apps/web/src/config/business.ts`. Hoy están en `null` porque falta confirmarlos, y la web los omite. Para
mostrarlos:

```ts
openingHours: [{ days: 'Lunes a domingo', hours: '18:00 a 23:30' }],
pickupAddress: 'Calle y número',
```

Esos valores son solo un ejemplo del formato.

### Número de WhatsApp

El número real del local está en `DEFAULT_WHATSAPP_NUMBER`, en `apps/web/src/config/business.ts`. Se escribe solo
con dígitos y código país: `56` más 9 dígitos. Si cambia el número del local, se cambia ahí.

La API toma el nombre, el número, la dirección de retiro y el horario de `apps/api/src/db/seed-business.ts`, que es
una copia de `business.ts` (una app no puede importar otra). **Si cambias uno, cambia el otro** y corre
`npm run db:seed`.

## Archivos de entorno

### API

Van en `apps/api/`. La API los lee al arrancar y valida cada variable: si falta algo o es inválido, no arranca y dice
qué corregir.

| Archivo                 | En git | Para qué sirve |
|-------------------------|--------|----------------|
| `apps/api/.env.example` | Sí     | Plantilla con todas las variables explicadas. Copiada tal cual sirve con `npm run db:up`. |
| `apps/api/.env`         | No     | Tu configuración local. Las variables que ya vengan del entorno (por ejemplo en CI) mandan sobre el archivo. |

### Web

Van en `apps/web/`, que es donde Vite los busca. En la raíz del repositorio no se leen.

| Archivo                           | En git | Para qué sirve |
|-----------------------------------|--------|----------------|
| `apps/web/.env.example`           | Sí     | Plantilla que documenta las variables. La web no la lee. |
| `apps/web/.env.demo`              | Sí     | Activa el modo demo en `npm run build:demo`. |
| `apps/web/.env.local`             | No     | Para probar en tu computador con tu número, o en modo demo, sin mandarle pedidos al local. |
| `apps/web/src/config/business.ts` | Sí     | No es de entorno, pero tiene el número real, que se usa si no hay otro configurado. |

Las variables son:

- `VITE_WHATSAPP_NUMBER`: número que recibe los pedidos. Si falta o no es válido, se usa el de `business.ts`.
- `VITE_DEMO`: `true` para que el pedido no se envíe. Solo se muestra y se copia al portapapeles.

Para probar sin molestar al local, crea `apps/web/.env.local` copiando `apps/web/.env.example` y deja una de estas
dos opciones:

```
VITE_WHATSAPP_NUMBER=56912345678
```

```
VITE_DEMO=true
```

Si dejas `VITE_WHATSAPP_NUMBER=569XXXXXXXX` de la plantilla, ese valor no es válido y los pedidos llegan al número
real del local.

**Cuidado:** `npm run build` también lee `apps/web/.env.local` y `apps/web/.env`. Si publicas desde tu computador,
revisa esos archivos antes, para no dejar tu número ni el modo demo en la web real. Nunca subas `.env` ni
`.env.local` a git.

## Cómo agregar fotos

Sin foto, cada producto se ve completo igual.

1. Pide las fotos originales al local. No uses fotos de Instagram sin su permiso.
2. Guárdalas en `apps/web/public/img/`, en formato WebP y de unos 800 px de ancho.
3. Agrega `image` al producto en `apps/web/src/data/menu.ts` y en `docs/data/menu.json`:

```ts
image: '/img/suprema.webp',
```

La demo de un solo archivo no incluye `public/`, así que estas fotos solo se ven en el sitio publicado.

## Cómo generar la demo

```
npm run build:demo
```

Queda en `apps/web/dist-demo/index.html`. Es un solo archivo: puedes abrirlo con doble clic, mandarlo o subirlo a
cualquier hosting. En esa versión el pedido no llega al local: el mensaje se copia y se muestra, con un aviso
visible.

## Cómo desplegar

Es un sitio estático, así que sirve cualquier hosting de ese tipo, como Vercel o Netlify. Falta decidir cuál usar y
qué dominio, junto con el local.

- Directorio raíz del proyecto en el hosting: la raíz del repositorio (ahí está el `package-lock.json`).
- Comando de build: `npm run build --workspace apps/web`
- Carpeta de salida: `apps/web/dist`
- Variables: ninguna es obligatoria. No definas `VITE_DEMO` en el sitio real.

## Documentación

- `docs/SPEC.md`: qué hace la web, sus reglas y lo que falta confirmar con el local.
- `docs/DESIGN.md`: marca, colores, tipografía y textos.
- `docs/ARCHITECTURE.md`: estructura del monorepo, apps previstas y decisiones de arquitectura (ADR).
- `docs/PLAN.md`: fases de la web (1 a 5).
- `docs/BACKEND-SPEC.md`: qué construir en la API, la base y el panel.
- `docs/PLAN-BACKEND.md`: fases del backend (6 a 10) y reglas de trabajo.
- `docs/data/`: carta, zonas e ingredientes en JSON.
