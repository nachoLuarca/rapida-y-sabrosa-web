# Diseño

## Idea

La marca manda: rojo intenso, amarillo queso, blanco y negro, como su logo "Rápida y Sabrosa · Delivery".
La personalidad va en la **tipografía**: titulares en itálica muy pesada y condensada, que transmiten el "rápida".
La carta se lee como una carta impresa (filas con línea de puntos hasta el precio), **no** como una grilla de
tarjetas iguales. El único momento llamativo es el hero; todo lo demás es sobrio y ordenado.

## Tokens (`@theme` en `src/index.css`)

| Token             | Valor     | Uso |
|-------------------|-----------|-----|
| `--color-rojo`        | `#d9141b` | marca, header, botones principales, precios destacados |
| `--color-rojo-oscuro` | `#a00e13` | hover de botones rojos |
| `--color-queso`       | `#ffc72c` | acentos, foco visible, CTA sobre fondo oscuro |
| `--color-queso-claro` | `#fff3cc` | avisos y etiquetas suaves |
| `--color-carbon`      | `#1c1917` | texto principal, bloque "Arma tu pizza", estados seleccionados |
| `--color-tinta`       | `#57534e` | texto secundario |
| `--color-linea`       | `#e7e2de` | bordes y separadores |
| `--color-fondo`       | `#f7f5f4` | superficies suaves (buscador, sección despacho) |

Botón de WhatsApp: verde `#1f8f4e` (hover `#17703c`), solo en el botón de enviar.

Tipografía:
- Display: **Barlow Condensed 900 itálica**, en mayúsculas, `line-height: 0.88`. Clase utilitaria `.display`.
- Texto: **Figtree** 400 / 500 / 600 / 700.
- Precios con `tabular-nums`.

Bordes: botones y chips en píldora (`rounded-full`); campos `rounded-xl`; modales `rounded-3xl`;
bloque "Arma tu pizza" `rounded-[2rem]`. Sombras solo en el modal, la barra flotante y la pizza del hero.

## Layout

Contenedor `max-w-6xl` con `px-4`.

```
┌ header rojo fijo ─────────────────────────────────────────────┐
│ RÁPIDA Y SABROSA  Espacio 308     Carta  Arma  Despacho  [Pedido $] │
└───────────────────────────────────────────────────────────────┘
  RÁPIDA                          (  pizza SVG  )
     Y SABROSA                    ( sombra queso)
  texto de valor
  [Ver la carta] (Arma tu pizza)

  LA CARTA
┌ barra fija: [buscador]  (chip)(chip)(chip)… scroll →  ┐
  TÍTULO CATEGORÍA     │ Nombre ............... $13.000
  descripción          │ descripción              [+ Agregar]
  25 opciones          │ ───────────────────────────────
  (fijo al hacer scroll)│ Nombre ............... $13.000
```

- En escritorio, cada categoría usa 2 columnas: título fijo a la izquierda (16rem) y productos a la derecha.
  En celular, una columna.
- Hero: titular en `clamp(4rem, 19vw, 8.5rem)`, la segunda línea ("y sabrosa") con sangría y sin saltos.
  Nunca debe generar scroll horizontal.
- `scroll-padding-top` para que los anclajes no queden tapados por el header y la barra de categorías.

## Movimiento

- Solo una animación de entrada: la pizza del hero gira y se asienta al cargar.
- El panel del pedido entra desde la derecha. Nada más se anima solo.
- Todo se desactiva con `prefers-reduced-motion`.

## Textos

- Español de Chile, tuteo, frases cortas, sin relleno.
- Los botones dicen exactamente lo que pasa: "Agregar", "Agregar al pedido", "Continuar con mis datos",
  "Enviar pedido por WhatsApp", "Empezar un pedido nuevo".
- Los errores dicen qué falta y cómo arreglarlo ("Ingresa un celular chileno, por ejemplo 9 1234 5678."),
  sin disculpas.
- Evitar: etiquetas en mayúsculas espaciadas sobre los títulos, flechas "→" en botones, separadores "·",
  numeraciones decorativas (01 / 02).

## Fotos (cuando el local las entregue)

- Formato WebP, ~800 px de ancho, en `public/img/`, referenciadas con `image` en el producto.
- La pizza del hero se reemplaza por una foto real recortada en círculo, manteniendo la sombra amarilla.
- No usar fotos de Instagram sin permiso expreso del local.
