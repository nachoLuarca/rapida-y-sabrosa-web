import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import {
  cartReducer,
  cartTotals,
  createLine,
  unavailableLineKeys,
  type CartAction,
  type CartLine,
  type Catalog,
} from '@rys/domain'
import { catalog as defaultCatalog } from '../data/catalog'
import { cartFingerprint } from '../domain/sent-order'
import { CartContext, type CartContextValue } from './cart-context'
import { loadSession, saveCart, saveSentMark } from './storage'

interface CartProviderProps {
  children: ReactNode
  /** La carta con la que se arma y se valida el pedido. null mientras se carga desde la API. */
  catalog?: Catalog | null
}

type Action = CartAction | { type: 'reprice'; catalog: Catalog }

/** Nombres y precios de la carta nueva; una línea que ya no está en la carta se deja igual (y se marca agotada). */
function reprice(lines: CartLine[], catalog: Catalog): CartLine[] {
  let changed = false
  const next = lines.map((line) => {
    const fresh = createLine(catalog, line, line.quantity)
    if (!fresh || (fresh.unitPrice === line.unitPrice && fresh.name === line.name && fresh.variantLabel === line.variantLabel)) {
      return line
    }
    changed = true
    return fresh
  })
  return changed ? next : lines
}

function reducer(lines: CartLine[], action: Action): CartLine[] {
  if (action.type === 'reprice') return reprice(lines, action.catalog)
  return cartReducer(lines, action)
}

export function CartProvider({ children, catalog = defaultCatalog }: CartProviderProps) {
  // El pedido guardado se lee cuando hay carta: antes no se sabe qué sigue existiendo ni a qué precio. Mientras
  // tanto (la API todavía no responde) el carrito está vacío y no se guarda nada; al llegar la carta, quien usa
  // este provider lo vuelve a montar con ella.
  const [boot] = useState(() => (catalog ? loadSession(catalog, Date.now()) : null))
  const hydrated = boot !== null
  const [lines, dispatch] = useReducer(reducer, boot?.lines ?? [])
  const [sentOrder, setSentOrder] = useState(boot?.sentOrder ?? null)
  const [pricedWith, setPricedWith] = useState(catalog)

  // La carta cambió (al volver a la pestaña, o tras un PRICE_CHANGED): nombres y precios nuevos.
  if (catalog && catalog !== pricedWith) {
    setPricedWith(catalog)
    dispatch({ type: 'reprice', catalog })
  }

  useEffect(() => {
    if (hydrated) saveCart(lines)
  }, [lines, hydrated])

  useEffect(() => {
    if (hydrated) saveSentMark(sentOrder)
  }, [sentOrder, hydrated])

  const value = useMemo<CartContextValue>(() => {
    // Cualquier cambio después de enviar cuenta como pedido nuevo.
    const change = (action: CartAction) => {
      dispatch(action)
      setSentOrder(null)
    }

    return {
      lines,
      totals: cartTotals(lines),
      unavailableKeys: catalog ? unavailableLineKeys(catalog, lines) : [],
      sentOrder,
      addItem: (selection, quantity = 1) => {
        const line = catalog && createLine(catalog, selection, quantity)
        if (line) change({ type: 'add', line })
      },
      setQuantity: (key, quantity) => change({ type: 'setQuantity', key, quantity }),
      removeLine: (key) => change({ type: 'remove', key }),
      clear: () => change({ type: 'clear' }),
      markSent: (details) =>
        setSentOrder({
          sentAt: Date.now(),
          cart: cartFingerprint(lines),
          ...(details.code ? { code: details.code } : {}),
          details,
        }),
      reopenOrder: () => setSentOrder(null),
    }
  }, [lines, sentOrder, catalog])

  return <CartContext value={value}>{children}</CartContext>
}
