# Plan de trabajo para Claude Code

Cada fase termina con: lint + typecheck + tests + build sin errores, revisión en el navegador (escritorio y 390 px)
y un resumen de lo hecho. **Después de cada fase, detente y espera mi revisión antes de seguir.**

Flujo de git:
- Cada fase va en su propia rama `feature/fase-N-<nombre>`, creada desde lo último de `main`
  (`git switch main` y luego `git switch -c <rama>`). Nunca hay commits directos en `main`.
- Commits pequeños con Conventional Commits en español, autor `nachoLuarca`.
- El resumen final incluye qué se hizo, el nombre de la rama y `git log --oneline main..<rama>`.
- Claude Code nunca hace push, merge, tags ni borra ramas: eso lo hago yo a mano.
- Nada de `--force`, `reset`, `rebase` ni reescribir historia.

Copia el prompt de cada fase tal cual en Claude Code.

---

## Fase 0 — Base del proyecto (rama `feature/fase-0-base`)

```
Lee CLAUDE.md y docs/ completo. Ejecuta la Fase 0 de docs/PLAN.md:
- Crea el proyecto con Vite (plantilla react-ts) en este directorio, verificando antes las últimas versiones
  estables con npm view.
- Configura Tailwind v4 con @tailwindcss/vite, los tokens de docs/DESIGN.md en src/index.css, las fuentes con
  @fontsource (Barlow Condensed 900 itálica y Figtree 400-700), Vitest + Testing Library + jsdom,
  y los scripts de CLAUDE.md (incluido build:demo con vite-plugin-singlefile y --mode demo → dist-demo/).
- Crea la estructura de carpetas de CLAUDE.md, src/config/business.ts, src/vite-env.d.ts con las variables
  VITE_*, .env.example y .env.demo (VITE_DEMO=true). Agrega dist-demo a .gitignore.
- index.html con los metadatos de docs/SPEC.md y un favicon SVG propio.
- App mínima que muestre el header rojo con el nombre en la tipografía display, para comprobar tokens y fuentes.
- Si la carpeta no es repo, haz git init -b main. Configura y verifica git config (nachoLuarca) y haz commits
  pequeños en la rama feature/fase-0-base, partiendo por los docs existentes.
```

## Fase 1 — Dominio y datos (rama `feature/fase-1-dominio`)

```
Fase 1 de docs/PLAN.md, en la rama feature/fase-1-dominio:
- src/domain/types.ts con los tipos de la especificación.
- src/data/menu.ts, zones.ts e ingredients.ts tipados, copiando exactamente docs/data/*.json.
- src/domain/format.ts: formatClp, normalizeChileanMobile, formatChileanMobile.
- src/domain/cart.ts: reducer (add, setQuantity, remove, clear), lineKey, totales, cantidad por producto
  y parseStoredCart.
- src/domain/build-pizza.ts: quoteBuildPizza según las reglas de docs/SPEC.md.
- src/domain/order-message.ts: orderTotals, buildOrderMessage con el formato exacto de la spec y whatsappUrl.
- Tests para todo lo anterior, incluidos todos los casos de la tabla de Arma tu pizza y el mensaje de ejemplo.
Sin UI en esta fase.
```

## Fase 2 — Landing y carta (rama `feature/fase-2-carta`)

```
Fase 2 de docs/PLAN.md, en la rama feature/fase-2-carta:
- Store del carrito (contexto + useReducer + persistencia en localStorage con try/catch). Separa el contexto
  y el hook useCart del componente Provider para que el lint de fast refresh no reclame.
- Header, Hero (con ilustración SVG propia de pizza), sección La carta (barra fija con buscador y chips con la
  categoría activa vía IntersectionObserver, filas de producto con línea de puntos, variantes, etiquetas, foto
  opcional y control de cantidad), bloque destacado de Arma tu pizza (el botón todavía puede no abrir nada),
  sección Despacho y Footer.
- Sigue docs/DESIGN.md al pie de la letra. Sin scroll horizontal a 390 px.
- Tests de integración: la carta se renderiza, agregar un producto actualiza el header, el buscador filtra
  sin distinguir tildes.
```

## Fase 3 — Pedido, Arma tu pizza y checkout (rama `feature/fase-3-pedido`)

```
Fase 3 de docs/PLAN.md, en la rama feature/fase-3-pedido:
- Panel del pedido con <dialog> desde la derecha, estado vacío, líneas con control de cantidad y subtotal.
- Barra flotante del pedido en celular.
- Modal Arma tu pizza con la regla de precio en vivo, que agrega al pedido y abre el carrito.
- Checkout con las validaciones de docs/SPEC.md, foco al primer error, resumen de totales, envío por
  WhatsApp, pantalla de confirmación y modo demo.
- Tests de integración del flujo completo: errores al enviar vacío, pedido válido con despacho, pedido con
  retiro, y que en modo demo no se llame a window.open.
```

## Fase 4 — Pulido y entrega (rama `feature/fase-4-pulido`)

```
Fase 4 de docs/PLAN.md, en la rama feature/fase-4-pulido:
- Revisión de accesibilidad: teclado completo, Esc cierra modales, foco visible, contraste AA, aria correctos.
- Lighthouse en celular con las metas de docs/SPEC.md; corrige lo que falte.
- README.md para el cliente y para mí: cómo correr, cómo cambiar precios/zonas/horario/número, cómo agregar
  fotos, cómo generar la demo y cómo desplegar.
- Genera build:demo y verifica que el index.html autocontenido funcione abierto directo en el navegador.
```

## Después (no construir todavía)

- Despliegue en Vercel o Netlify con dominio propio.
- Fotos reales y logo cuando el local los entregue.
- Panel simple para que el local edite precios y zonas (requiere backend).
- Pago online (Webpay / Mercado Pago / Flow).
