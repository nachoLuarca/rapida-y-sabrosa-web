import { CART_STORAGE_KEY, parseStoredCart, serializeCart } from '../domain/cart'
import type { CartLine, Catalog } from '../domain/types'

/** Lee el pedido guardado. Si localStorage no está disponible o falla, parte vacío. */
export function loadCart(catalog: Catalog): CartLine[] {
  try {
    return parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY), catalog)
  } catch {
    return []
  }
}

/** Guarda el pedido; si no se puede (modo privado, cuota llena), se sigue sin guardar. */
export function saveCart(lines: CartLine[]): void {
  try {
    if (lines.length === 0) window.localStorage.removeItem(CART_STORAGE_KEY)
    else window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(lines))
  } catch {
    // Sin persistencia el pedido igual funciona mientras la página esté abierta.
  }
}
