import { createContext } from 'react'
import type { CartLine, CartTotals, LineSelection } from '@rys/domain'
import type { SentDetails, SentOrder } from '../domain/sent-order'

export interface CartContextValue {
  lines: CartLine[]
  totals: CartTotals
  /** Líneas que ya no se pueden pedir (agotadas o fuera de la carta): hay que quitarlas para enviar. */
  unavailableKeys: string[]
  /** Pedido ya enviado, mientras no cambie el carrito ni se empiece otro. */
  sentOrder: SentOrder | null
  /** Agrega una unidad (o `quantity`) de lo elegido. Ignora selecciones que no están en la carta. */
  addItem: (selection: LineSelection, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  clear: () => void
  markSent: (details: SentDetails) => void
  /** Borra la marca de enviado y conserva los productos. */
  reopenOrder: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)
