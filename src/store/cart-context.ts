import { createContext } from 'react'
import type { CartTotals } from '../domain/cart'
import type { SentOrder } from '../domain/sent-order'
import type { CartLine, LineSelection } from '../domain/types'

export interface CartContextValue {
  lines: CartLine[]
  totals: CartTotals
  /** Pedido ya enviado, mientras no cambie el carrito ni se empiece otro. */
  sentOrder: SentOrder | null
  /** Agrega una unidad (o `quantity`) de lo elegido. Ignora selecciones que no están en la carta. */
  addItem: (selection: LineSelection, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  clear: () => void
  markSent: (order: Omit<SentOrder, 'sentAt'>) => void
}

export const CartContext = createContext<CartContextValue | null>(null)
