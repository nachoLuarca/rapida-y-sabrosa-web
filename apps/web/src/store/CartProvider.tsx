import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { catalog as defaultCatalog } from '../data/catalog'
import { cartReducer, cartTotals, createLine, type CartAction } from '../domain/cart'
import { cartFingerprint } from '../domain/sent-order'
import type { Catalog } from '../domain/types'
import { CartContext, type CartContextValue } from './cart-context'
import { loadSession, saveCart, saveSentMark } from './storage'

interface CartProviderProps {
  children: ReactNode
  catalog?: Catalog
}

export function CartProvider({ children, catalog = defaultCatalog }: CartProviderProps) {
  const [session] = useState(() => loadSession(catalog, Date.now()))
  const [lines, dispatch] = useReducer(cartReducer, session.lines)
  const [sentOrder, setSentOrder] = useState(session.sentOrder)

  useEffect(() => {
    saveCart(lines)
  }, [lines])

  useEffect(() => {
    saveSentMark(sentOrder)
  }, [sentOrder])

  const value = useMemo<CartContextValue>(() => {
    // Cualquier cambio después de enviar cuenta como pedido nuevo.
    const change = (action: CartAction) => {
      dispatch(action)
      setSentOrder(null)
    }

    return {
      lines,
      totals: cartTotals(lines),
      sentOrder,
      addItem: (selection, quantity = 1) => {
        const line = createLine(catalog, selection, quantity)
        if (line) change({ type: 'add', line })
      },
      setQuantity: (key, quantity) => change({ type: 'setQuantity', key, quantity }),
      removeLine: (key) => change({ type: 'remove', key }),
      clear: () => change({ type: 'clear' }),
      markSent: (details) => setSentOrder({ sentAt: Date.now(), cart: cartFingerprint(lines), details }),
      reopenOrder: () => setSentOrder(null),
    }
  }, [lines, sentOrder, catalog])

  return <CartContext value={value}>{children}</CartContext>
}
