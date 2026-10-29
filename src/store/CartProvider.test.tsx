import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CART_STORAGE_KEY } from '../domain/cart'
import { CartProvider } from './CartProvider'
import { useCart } from './use-cart'

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('CartProvider', () => {
  it('agrega productos, calcula totales y guarda el pedido', () => {
    const { result } = renderHook(useCart, { wrapper })
    act(() => {
      result.current.addItem({ productId: 'suprema' }, 2)
      result.current.addItem({ productId: 'jugo-mango', variantId: 'jugo-mango-1l' })
    })
    expect(result.current.totals).toEqual({ itemCount: 3, subtotal: 33000 })
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]')).toHaveLength(2)
  })

  it('recupera el pedido guardado al cargar', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ productId: 'suprema', quantity: 2 }]))
    const { result } = renderHook(useCart, { wrapper })
    expect(result.current.totals).toEqual({ itemCount: 2, subtotal: 26000 })
  })

  it('ignora lo guardado si está corrupto y borra la clave al vaciar el pedido', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{roto')
    const { result } = renderHook(useCart, { wrapper })
    expect(result.current.lines).toEqual([])
    act(() => result.current.addItem({ productId: 'suprema' }))
    act(() => result.current.clear())
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
  })

  it('sigue funcionando si localStorage falla', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cuota llena')
    })
    const { result } = renderHook(useCart, { wrapper })
    act(() => result.current.addItem({ productId: 'suprema' }))
    expect(result.current.totals.itemCount).toBe(1)
  })

  it('ignora selecciones que no están en la carta', () => {
    const { result } = renderHook(useCart, { wrapper })
    act(() => result.current.addItem({ productId: 'no-existe' }))
    expect(result.current.lines).toEqual([])
  })

  it('useCart falla con un mensaje claro fuera del Provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(useCart)).toThrow('useCart debe usarse dentro de <CartProvider>')
  })
})
