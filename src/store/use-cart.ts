import { useContext } from 'react'
import { CartContext, type CartContextValue } from './cart-context'

export function useCart(): CartContextValue {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart debe usarse dentro de <CartProvider>')
  return cart
}
