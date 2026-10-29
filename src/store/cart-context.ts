import { createContext } from 'react'
import type { CartTotals } from '../domain/cart'
import type { CartLine, LineSelection } from '../domain/types'

export interface CartContextValue {
  lines: CartLine[]
  totals: CartTotals
  /** Agrega una unidad (o `quantity`) de lo elegido. Ignora selecciones que no están en la carta. */
  addItem: (selection: LineSelection, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  clear: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)
