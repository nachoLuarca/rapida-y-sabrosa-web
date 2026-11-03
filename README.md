# Rápida y Sabrosa — web de pedidos

[![CI](https://github.com/nachoLuarca/rapida-y-sabrosa-web/actions/workflows/ci.yml/badge.svg)](https://github.com/nachoLuarca/rapida-y-sabrosa-web/actions/workflows/ci.yml)

Web de la pizzería **Rápida y Sabrosa (Espacio 308)** de Isla de Maipo. Muestra la carta, deja armar el pedido y lo
envía por WhatsApp al local. No tiene backend, base de datos ni pago online: es un sitio estático.

## Estructura del repositorio

Es un monorepo con npm workspaces:

```
apps/
  web/             la web de pedidos (Vite + React): carta, carrito, Arma tu pizza y checkout
packages/
  domain/          @rys/domain: reglas de negocio puras y sus tipos, compartidas entre apps
docs/              especificación, diseño, plan, arquitectura y datos de la carta
```

Más adelante se suman `apps/api` (Express + PostgreSQL) y `apps/admin` (panel del local). El detalle y el porqué
están en `docs/ARCHITECTURE.md`.

## Cómo correr el proyecto

Necesitas Node 22 o superior. Todos los comandos se corren desde la raíz del repositorio:

```
npm install
npm run dev
```

| Comando              | Qué hace |
|----------------------|----------|
| `npm run dev`        | Servidor local de la web para trabajar |
| `npm run build`      | Build de producción de la web en `apps/web/dist/` |
| `npm run build:demo` | Un solo `index.html` autocontenido en modo demo, en `apps/web/dist-demo/` |
| `npm test`           | Corre una vez los tests de todos los workspaces |
| `npm run lint`       | Revisa el código de todos los workspaces |
| `npm run typecheck`  | Revisa los tipos de todos los workspaces |

Para correr un script en un solo workspace, agrega `--workspace`:

```
npm test --workspace packages/domain
npm run test:watch --workspace apps/web
```

Las dependencias se instalan siempre desde la raíz, donde está el único `package-lock.json`. Para agregar una a un
workspace: `npm install <paquete> --workspace apps/web`.

Cada push a cualquier rama corre todo esto en GitHub Actions (`.github/workflows/ci.yml`).

Si `npm test` tarda minutos y falla con `Test timed out`, revisa si el notebook se suspendió mientras corría: el
modo de espera congela los procesos y los tests fallan al despertar. Vuelve a correrlos con el equipo activo.

## Cómo cambiar los datos del local

Los datos nunca van dentro de un componente. Después de cambiarlos, corre `npm test` y publica de nuevo.

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

## Archivos de entorno

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
- `docs/PLAN.md`: fases del proyecto.
- `docs/data/`: carta, zonas e ingredientes en JSON.
