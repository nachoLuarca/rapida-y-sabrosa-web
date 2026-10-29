# Especificación

## Contexto

Rápida y Sabrosa (Instagram `@espacio_308`, ~12 mil seguidores) es una de las pizzerías que más vende en
Isla de Maipo. Hoy su "link en la bio" lleva a una carta de LaCarte (`lacarte.cl/menu/pedido/115/rapida-y-sabrosa/`)
que hace esto:

1. Lista productos por categoría con botones + / − para elegir cantidad.
2. "Realizar pedido" abre un formulario: nombre, teléfono, mensaje opcional, medio de pago, despacho o retiro.
3. En despacho se elige una de 13 zonas, cada una con su costo, y se calcula el total.
4. El pedido se envía como texto al WhatsApp del local (`+56 9 7431 4602`). No hay pago online.

Problemas de esa carta que esta web corrige:
- No tiene fotos ni identidad de marca (se ve el logo de LaCarte).
- Las categorías de pizzas no dicen que son pizzas ("Mechadas y charcuterías", "Pollo y filete").
- Hay un producto duplicado (Chorrillana mixta).
- "Arma tu pizza" es solo un precio: no deja elegir ingredientes.

## Objetivo de esta versión

Una web propia del local que haga **todo lo que hace la carta actual, mejor**, con su marca. Sin backend.

Fuera de alcance (para versiones futuras, no construir): pago online, panel de administración, cuentas de
cliente, seguimiento de pedidos, fidelización.

## Páginas y secciones

Es una sola página (sin router), en este orden:

1. **Header fijo**: nombre de la marca (enlace al inicio), enlaces a Carta / Arma tu pizza / Despacho
   (ocultos en celular) y botón del pedido con cantidad y subtotal.
2. **Hero**: titular "Rápida y sabrosa" como pieza tipográfica principal, una línea de valor
   ("Pizzas de élite en Isla de Maipo…", despacho desde el costo mínimo de zona o retiro), botones
   "Ver la carta" y "Arma tu pizza", y una imagen de pizza (ilustración SVG propia mientras no haya fotos).
3. **La carta**:
   - Barra fija bajo el header con buscador y chips de categorías con scroll horizontal; el chip de la
     sección visible queda marcado.
   - Una sección por categoría: título + descripción opcional + cantidad de opciones, y la lista de productos.
   - Cada producto: nombre, etiquetas opcionales ("Para 2"), línea de puntos, precio, descripción y botón
     "Agregar". Si ya está en el pedido, el botón pasa a ser un control − cantidad +.
   - Productos con variantes (jugos 500 cc / 1 litro): un botón por variante con su precio.
   - Soporte para foto opcional por producto (`image`); sin foto, la fila se ve completa igual.
   - La categoría "Arma tu pizza" es un bloque destacado con botón "Elegir ingredientes" que abre el modal.
   - Buscador: filtra por nombre y descripción del producto y por nombre de su categoría, sin distinguir
     tildes ni mayúsculas; cada palabra buscada debe aparecer en alguno de esos textos ("jugo mango" encuentra
     el jugo de mango). Muestra cuántos resultados hay o un mensaje útil si no hay ninguno.
4. **Despacho**: zonas agrupadas por costo, formas de pago, retiro en local y horario (solo si está definido).
5. **Footer**: marca, ubicación, Instagram.
6. **Barra flotante en celular**: con productos en el pedido, botón fijo abajo "Ver pedido" con cantidad y subtotal.

## Carrito

- Panel lateral (`<dialog>`) que entra desde la derecha; en celular ocupa todo el ancho.
- Lista de líneas con nombre, variante, ingredientes (si es Arma tu pizza), precio unitario, total de línea y
  control de cantidad. Cantidad 0 elimina la línea. Máximo 50 por línea.
- Dos productos iguales (mismo producto + variante + mismos ingredientes en cualquier orden) son una sola línea.
- Estado vacío con texto que invita a elegir de la carta y botón "Ver la carta".
- Subtotal y botón "Continuar con mis datos".
- El pedido se guarda en `localStorage` (clave versionada, p. ej. `rys.cart.v1`) y se valida al cargar.

## Arma tu pizza

Datos en `docs/data/menu.json → buildPizza` e `ingredients.json`.

Reglas de precio (función pura `quoteBuildPizza`):
- Sin ingredientes: base **$10.900**.
- Base + ingredientes: $10.900 + el valor de cada ingrediente.
- Promoción: **$13.000 con 3 ingredientes incluidos**; desde el cuarto se cobra cada uno a su valor.
- Siempre se aplica la opción más barata para el cliente. En la promoción, los incluidos son los 3 más caros.

Casos que deben tener test:

| Ingredientes                         | Total    |
|--------------------------------------|----------|
| ninguno                              | $10.900  |
| 1 de $1.500                          | $12.400  |
| 2 de $2.500                          | $13.000 (promo) |
| 3 de $1.500                          | $13.000  |
| 2 de $2.500 + 2 de $1.500            | $14.500 (se cobra 1 extra de $1.500) |

UI: modal con la explicación de la regla, ingredientes como casillas en grilla (1 columna en celular, 2 en
escritorio) con su precio, contador de "te quedan N incluidos", total en vivo con el detalle
("Promoción + 1 extra", "Base + ingredientes"…) y botón "Agregar al pedido", que agrega, cierra y abre el carrito.

## Checkout

Campos y validaciones (errores en español, junto al campo, y el foco va al primer error):

| Campo       | Regla |
|-------------|-------|
| Nombre      | obligatorio, mínimo 2 caracteres |
| Celular     | celular chileno: acepta `912345678`, `9 1234 5678`, `+56 9 1234-5678`; se normaliza a `569XXXXXXXX` |
| Despacho / Retiro | obligatorio, por defecto Despacho |
| Sector      | obligatorio si es despacho; lista de `zones.json` con el costo visible |
| Dirección   | obligatoria si es despacho, mínimo 5 caracteres |
| Pago        | Efectivo, Transferencia o Tarjeta (se paga al recibir o al retirar) |
| Comentario  | opcional, máximo 300 caracteres |

Resumen fijo abajo: subtotal, despacho (si corresponde) y total. Botón "Enviar pedido por WhatsApp".

### Mensaje de WhatsApp

Función pura `buildOrderMessage(lines, order)`. Formato (con negritas de WhatsApp):

```
*Nuevo pedido — Rápida y Sabrosa*

• 2 x Suprema — $26.000
• 1 x Mango (1 litro) — $7.000
• 1 x Arma tu pizza — $13.000
   Ingredientes: Tocino, Choclo

Subtotal: $46.000
Despacho: $2.000
*Total: $48.000*

*Despacho* a Islita
Dirección: Los Aromos 123
Pago: Transferencia

Cliente: Ana Pérez
Teléfono: +56 9 1234 5678

Comentario: sin cebolla
```

En retiro: sin línea de despacho ni dirección, y `*Retiro en local*`. Sin comentario: se omite ese bloque.

Envío: `https://wa.me/<número>?text=<mensaje codificado>` en pestaña nueva. Luego se muestra una pantalla de
confirmación con el mensaje, botón "Abrir WhatsApp otra vez" y "Empezar un pedido nuevo" (vacía el carrito).

**Modo demo** (`VITE_DEMO=true`): no abre WhatsApp; copia el mensaje al portapapeles y lo muestra, con un aviso
visible "Modo demo: el pedido no llega al local". Esto es para mostrar la web sin mandarle pedidos falsos al local.

## Datos

- `docs/data/menu.json`: 9 categorías y 87 productos con nombres, descripciones y precios de la carta actual
  (octubre 2026), ya corregidos (categorías de pizzas renombradas, duplicado eliminado, textos normalizados).
- `docs/data/zones.json`: 13 zonas de despacho con su costo.
- `docs/data/ingredients.json`: 27 ingredientes para Arma tu pizza.

En el código se copian a `src/data/*.ts` tipados (no se importa JSON en runtime desde `docs/`).

## SEO y metadatos

`lang="es-CL"`, título "Rápida y Sabrosa | Pizzería en Isla de Maipo", meta description, Open Graph básico,
`theme-color` rojo de marca, favicon SVG propio.

## Calidad mínima

- Lighthouse en celular: Accesibilidad ≥ 95, Buenas prácticas ≥ 95, SEO ≥ 95.
- Sin scroll horizontal a 390 px.
- Todo usable solo con teclado (incluido cerrar modales con Esc).
- Tests de dominio cubriendo carrito, precios de Arma tu pizza, normalización de celular, totales y mensaje;
  más tests de integración de la App (agregar producto, buscar, flujo de checkout con errores y envío).

## Pendiente de confirmar con el local

Estos datos no se inventan: quedan en `null` o marcados en el código hasta confirmarlos.

- [ ] Precio real de cada ingrediente extra (hoy provisorios: $1.500 normales, $2.500 premium).
- [ ] Horario de atención.
- [ ] Dirección para retiro.
- [ ] Tamaños de pizza (la carta actual no los muestra).
- [ ] "Mechada palta": la descripción original no menciona palta.
- [ ] "Alitas BBQ" ($10.000) y "Alitas BBQ con papas fritas" ($12.000): ¿ambos siguen vigentes?
- [ ] Logo en alta resolución y fotos de productos (tienen muchas en Instagram; pedir permiso y originales).
- [ ] Dominio y hosting.
