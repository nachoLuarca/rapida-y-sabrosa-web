import { quoteBuildPizza } from './build-pizza'
import type { CartLine, Catalog, Ingredient, LineSelection } from './types'

export const MAX_LINE_QUANTITY = 50

/** Clave versionada: si cambia el formato guardado, se sube la versión y lo anterior se ignora. */
export const CART_STORAGE_KEY = 'rys.cart.v1'

const unique = (ids: string[]) => [...new Set(ids)]

/** Misma clave para el mismo producto, variante e ingredientes, sin importar el orden de estos. */
export function lineKey(selection: LineSelection): string {
  const ingredients = unique(selection.ingredientIds ?? []).sort().join(',')
  return [selection.productId, selection.variantId ?? '', ingredients].join('|')
}

function clampQuantity(quantity: number): number {
  return Math.min(MAX_LINE_QUANTITY, Math.max(0, Math.trunc(quantity)))
}

/**
 * Arma una línea del pedido con nombre y precio tomados de la carta.
 * Devuelve null si la selección no corresponde a la carta (producto, variante o ingrediente inexistente).
 */
export function createLine(catalog: Catalog, selection: LineSelection, quantity = 1): CartLine | null {
  const amount = clampQuantity(quantity)
  if (amount < 1) return null

  const { buildPizza } = catalog
  if (selection.productId === buildPizza.productId) {
    if (selection.variantId !== undefined) return null
    const ingredientIds = unique(selection.ingredientIds ?? [])
    const chosen = ingredientIds.map((id) => catalog.ingredients.find((i) => i.id === id))
    if (chosen.some((ingredient) => ingredient === undefined)) return null
    const ingredients = chosen as Ingredient[]

    return {
      key: lineKey({ productId: buildPizza.productId, ingredientIds }),
      productId: buildPizza.productId,
      ingredientIds,
      name: buildPizza.name,
      ingredientNames: ingredients.map((i) => i.name),
      unitPrice: quoteBuildPizza(ingredients, buildPizza).total,
      quantity: amount,
    }
  }

  const product = catalog.products.find((p) => p.id === selection.productId)
  if (!product || (selection.ingredientIds?.length ?? 0) > 0) return null

  if (product.variants) {
    const variant = product.variants.find((v) => v.id === selection.variantId)
    if (!variant) return null
    return {
      key: lineKey({ productId: product.id, variantId: variant.id }),
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      variantLabel: variant.label,
      unitPrice: variant.price,
      quantity: amount,
    }
  }

  if (selection.variantId !== undefined) return null
  return {
    key: lineKey({ productId: product.id }),
    productId: product.id,
    name: product.name,
    unitPrice: product.price,
    quantity: amount,
  }
}

export type CartAction =
  | { type: 'add'; line: CartLine }
  | { type: 'setQuantity'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  | { type: 'clear' }

/** Si nada cambia, devuelve el mismo arreglo para no forzar renders. */
export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const added = clampQuantity(action.line.quantity)
      if (added < 1) return lines
      const existing = lines.find((line) => line.key === action.line.key)
      if (!existing) return [...lines, { ...action.line, quantity: added }]
      const quantity = clampQuantity(existing.quantity + added)
      if (quantity === existing.quantity) return lines
      return lines.map((line) => (line === existing ? { ...line, quantity } : line))
    }
    case 'setQuantity': {
      if (Number.isNaN(action.quantity)) return lines
      const existing = lines.find((line) => line.key === action.key)
      if (!existing) return lines
      const quantity = clampQuantity(action.quantity)
      if (quantity === 0) return lines.filter((line) => line !== existing)
      if (quantity === existing.quantity) return lines
      return lines.map((line) => (line === existing ? { ...line, quantity } : line))
    }
    case 'remove': {
      const next = lines.filter((line) => line.key !== action.key)
      return next.length === lines.length ? lines : next
    }
    case 'clear':
      return lines.length === 0 ? lines : []
  }
}

export interface CartTotals {
  /** Unidades en total (2 Supremas + 1 jugo = 3). */
  itemCount: number
  subtotal: number
}

export function cartTotals(lines: CartLine[]): CartTotals {
  return lines.reduce(
    (totals, line) => ({
      itemCount: totals.itemCount + line.quantity,
      subtotal: totals.subtotal + line.unitPrice * line.quantity,
    }),
    { itemCount: 0, subtotal: 0 },
  )
}

export function lineTotal(line: CartLine): number {
  return line.unitPrice * line.quantity
}

/** Unidades de un producto en el pedido; con variantId, solo de esa variante. */
export function quantityInCart(lines: CartLine[], productId: string, variantId?: string): number {
  return lines
    .filter((line) => line.productId === productId && (variantId === undefined || line.variantId === variantId))
    .reduce((total, line) => total + line.quantity, 0)
}

type StoredLine = LineSelection & { quantity: number }

/** Solo se guarda qué se eligió y cuánto; nombres y precios se vuelven a tomar de la carta al cargar. */
export function serializeCart(lines: CartLine[]): string {
  const stored: StoredLine[] = lines.map(({ productId, variantId, ingredientIds, quantity }) => ({
    productId,
    variantId,
    ingredientIds,
    quantity,
  }))
  return JSON.stringify(stored)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseStoredLine(value: unknown): StoredLine | null {
  if (!isRecord(value)) return null
  const { productId, variantId, ingredientIds, quantity } = value
  if (typeof productId !== 'string') return null
  if (variantId !== undefined && typeof variantId !== 'string') return null
  if (
    ingredientIds !== undefined &&
    !(Array.isArray(ingredientIds) && ingredientIds.every((id) => typeof id === 'string'))
  ) {
    return null
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return null
  return { productId, variantId, ingredientIds, quantity }
}

/**
 * Lee el pedido guardado. Descarta lo que no sea válido o ya no exista en la carta,
 * actualiza nombres y precios, y junta líneas repetidas. Nunca lanza errores.
 */
export function parseStoredCart(raw: string | null, catalog: Catalog): CartLine[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []

  let lines: CartLine[] = []
  for (const item of data) {
    const stored = parseStoredLine(item)
    const line = stored && createLine(catalog, stored, stored.quantity)
    if (line) lines = cartReducer(lines, { type: 'add', line })
  }
  return lines
}
