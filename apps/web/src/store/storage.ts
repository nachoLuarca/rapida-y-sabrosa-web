import type { CartLine, Catalog } from '@rys/domain'
import { CART_STORAGE_KEY, parseStoredCart, serializeCart } from '../domain/cart-storage'
import {
  cartFingerprint,
  isSentMarkExpired,
  parseSentMark,
  SENT_ORDER_STORAGE_KEY,
  serializeSentMark,
  type SentMark,
  type SentOrder,
} from '../domain/sent-order'

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

function loadSentMark(): SentMark | null {
  try {
    return parseSentMark(window.localStorage.getItem(SENT_ORDER_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Guarda la marca de pedido enviado, o la borra con null. Si no se puede, vale mientras la página esté abierta. */
export function saveSentMark(mark: SentMark | null): void {
  try {
    if (mark) window.localStorage.setItem(SENT_ORDER_STORAGE_KEY, serializeSentMark(mark))
    else window.localStorage.removeItem(SENT_ORDER_STORAGE_KEY)
  } catch {
    // Igual que con el pedido: se sigue sin guardar.
  }
}

/**
 * Estado inicial. Una marca vencida parte de cero; una que no calza con el carrito, o que no es válida,
 * se ignora. En todos esos casos el provider borra lo que quedó guardado al persistir este estado.
 */
export function loadSession(catalog: Catalog, now: number): { lines: CartLine[]; sentOrder: SentOrder | null } {
  const mark = loadSentMark()
  if (mark && isSentMarkExpired(mark, now)) return { lines: [], sentOrder: null }
  const lines = loadCart(catalog)
  if (!mark || mark.cart !== cartFingerprint(lines)) return { lines, sentOrder: null }
  return { lines, sentOrder: { ...mark, details: null } }
}
