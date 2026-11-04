import { quoteBuildPizza } from './build-pizza.ts'
import { createLine } from './cart.ts'
import { orderTotals } from './order-message.ts'
import type { CartLine, Catalog, Fulfillment, Ingredient, LineSelection } from './types.ts'

// Cotización del pedido completo (docs/BACKEND-SPEC.md → POST /api/orders, reglas 5 y 6). La API la usa para
// recalcular lo que pide el cliente y la web, para saber qué líneas del pedido se agotaron.

/** Ids que impiden armar una línea: el producto, la variante o los ingredientes. */
export interface UnavailableItems {
  productIds: string[]
  variantIds: string[]
  ingredientIds: string[]
}

const isAvailable = (item: { available?: boolean }) => item.available !== false

/**
 * ¿Se puede pedir esta línea con la carta de hoy? Devuelve null si sí, o los ids que fallan:
 * - el producto no existe, está agotado o recibe ingredientes sin ser Arma tu pizza → `productIds`;
 * - la variante no es de ese producto (o falta, o sobra) → `variantIds` (o `productIds` si falta);
 * - un ingrediente no existe o está agotado → `ingredientIds`.
 */
export function lineAvailability(catalog: Catalog, selection: LineSelection): UnavailableItems | null {
  const missing: UnavailableItems = { productIds: [], variantIds: [], ingredientIds: [] }
  const { buildPizza } = catalog

  if (selection.productId === buildPizza.productId) {
    if (!isAvailable(buildPizza)) missing.productIds.push(buildPizza.productId)
    if (selection.variantId !== undefined) missing.variantIds.push(selection.variantId)
    for (const id of new Set(selection.ingredientIds ?? [])) {
      const ingredient = catalog.ingredients.find((item) => item.id === id)
      if (!ingredient || !isAvailable(ingredient)) missing.ingredientIds.push(id)
    }
  } else {
    const product = catalog.products.find((item) => item.id === selection.productId)
    // Solo Arma tu pizza acepta ingredientes.
    if (!product || !isAvailable(product) || (selection.ingredientIds?.length ?? 0) > 0) {
      missing.productIds.push(selection.productId)
    } else if (product.variants) {
      if (selection.variantId === undefined) missing.productIds.push(product.id)
      else if (!product.variants.some((variant) => variant.id === selection.variantId)) {
        missing.variantIds.push(selection.variantId)
      }
    } else if (selection.variantId !== undefined) {
      missing.variantIds.push(selection.variantId)
    }
  }

  const failed = missing.productIds.length + missing.variantIds.length + missing.ingredientIds.length
  return failed === 0 ? null : missing
}

/** Claves de las líneas del pedido que ya no se pueden pedir (agotadas o que salieron de la carta). */
export function unavailableLineKeys(catalog: Catalog, lines: CartLine[]): string[] {
  return lines.filter((line) => lineAvailability(catalog, line) !== null).map((line) => line.key)
}

function mergeUnavailable(items: UnavailableItems[]): UnavailableItems {
  const unique = (ids: string[]) => [...new Set(ids)].sort()
  return {
    productIds: unique(items.flatMap((item) => item.productIds)),
    variantIds: unique(items.flatMap((item) => item.variantIds)),
    ingredientIds: unique(items.flatMap((item) => item.ingredientIds)),
  }
}

export interface QuotedIngredient {
  id: string
  name: string
  price: number
  /** true si lo cubre la promoción de Arma tu pizza. */
  included: boolean
}

/** Línea cotizada: lo mismo que una línea del carrito más el detalle que se guarda como snapshot. */
export interface QuotedLine extends CartLine {
  /** Solo en Arma tu pizza, en el orden en que se eligieron. */
  ingredients: QuotedIngredient[] | null
  lineTotal: number
}

export interface RequestedLine extends LineSelection {
  quantity: number
}

export type OrderQuote =
  | { ok: true; lines: QuotedLine[]; subtotal: number; deliveryFee: number; total: number }
  | { ok: false; unavailable: UnavailableItems }

/**
 * Cotiza el pedido con la carta y los precios de hoy: valida la disponibilidad de cada línea, calcula Arma tu
 * pizza (promoción o base), el subtotal, el despacho de la zona y el total. Si alguna línea no se puede pedir,
 * devuelve todos los ids que fallan, de todas las líneas.
 */
export function quoteOrder(catalog: Catalog, requested: RequestedLine[], fulfillment: Fulfillment): OrderQuote {
  const problems = requested.map((line) => lineAvailability(catalog, line)).filter((item) => item !== null)
  if (problems.length > 0) return { ok: false, unavailable: mergeUnavailable(problems) }

  const lines: QuotedLine[] = requested.map((request) => {
    const line = createLine(catalog, request, request.quantity)
    // lineAvailability ya revisó lo mismo que createLine; esto solo protege de una carta inconsistente.
    if (!line) throw new Error(`No se pudo cotizar la línea ${request.productId}.`)
    return { ...line, ingredients: buildPizzaSnapshot(catalog, line), lineTotal: line.unitPrice * line.quantity }
  })

  return { ok: true, lines, ...orderTotals(lines, fulfillment) }
}

function buildPizzaSnapshot(catalog: Catalog, line: CartLine): QuotedIngredient[] | null {
  if (line.productId !== catalog.buildPizza.productId) return null
  const chosen = (line.ingredientIds ?? [])
    .map((id) => catalog.ingredients.find((ingredient) => ingredient.id === id))
    .filter((ingredient): ingredient is Ingredient => ingredient !== undefined)
  const quote = quoteBuildPizza(chosen, catalog.buildPizza)
  return chosen.map(({ id, name, price }, index) => ({
    id,
    name,
    price,
    included: quote.included.includes(chosen[index]),
  }))
}
