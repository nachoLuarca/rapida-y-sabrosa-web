import { cartReducer, createLine } from './cart'
import type { CartLine, Catalog, LineSelection } from './types'

/** Clave versionada: si cambia el formato guardado, se sube la versión y lo anterior se ignora. */
export const CART_STORAGE_KEY = 'rys.cart.v1'

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
