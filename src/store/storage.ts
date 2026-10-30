import { CART_STORAGE_KEY, parseStoredCart, serializeCart } from '../domain/cart'
import {
  isSentOrderExpired,
  parseSentOrder,
  SENT_ORDER_STORAGE_KEY,
  serializeSentOrder,
  type SentOrder,
} from '../domain/sent-order'
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

function loadSentOrder(): SentOrder | null {
  try {
    return parseSentOrder(window.localStorage.getItem(SENT_ORDER_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Guarda la marca de pedido enviado, o la borra con null. Si no se puede, vale mientras la página esté abierta. */
export function saveSentOrder(sent: SentOrder | null): void {
  try {
    if (sent) window.localStorage.setItem(SENT_ORDER_STORAGE_KEY, serializeSentOrder(sent))
    else window.localStorage.removeItem(SENT_ORDER_STORAGE_KEY)
  } catch {
    // Igual que con el pedido: se sigue sin guardar.
  }
}

/** Estado inicial. Si el pedido enviado ya venció, parte de cero; el provider borra lo guardado al persistirlo. */
export function loadSession(catalog: Catalog, now: number): { lines: CartLine[]; sentOrder: SentOrder | null } {
  const sentOrder = loadSentOrder()
  if (sentOrder && isSentOrderExpired(sentOrder, now)) return { lines: [], sentOrder: null }
  return { lines: loadCart(catalog), sentOrder }
}
