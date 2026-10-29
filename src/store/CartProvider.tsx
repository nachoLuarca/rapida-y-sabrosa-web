import { useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { catalog as defaultCatalog } from '../data/catalog'
import { cartReducer, cartTotals, createLine } from '../domain/cart'
import type { Catalog } from '../domain/types'
import { CartContext, type CartContextValue } from './cart-context'
import { loadCart, saveCart } from './storage'

interface CartProviderProps {
  children: ReactNode
  catalog?: Catalog
}

export function CartProvider({ children, catalog = defaultCatalog }: CartProviderProps) {
  const [lines, dispatch] = useReducer(cartReducer, catalog, loadCart)

  useEffect(() => {
    saveCart(lines)
  }, [lines])

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      totals: cartTotals(lines),
      addItem: (selection, quantity = 1) => {
        const line = createLine(catalog, selection, quantity)
        if (line) dispatch({ type: 'add', line })
      },
      setQuantity: (key, quantity) => dispatch({ type: 'setQuantity', key, quantity }),
      removeLine: (key) => dispatch({ type: 'remove', key }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [lines, catalog],
  )

  return <CartContext value={value}>{children}</CartContext>
}
