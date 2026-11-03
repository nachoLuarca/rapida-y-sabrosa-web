import { describe, expect, it } from 'vitest'
import { createLine } from './cart'
import { parseStoredCart, serializeCart } from './cart-storage'
import type { CartLine, Catalog, LineSelection } from './types'

const catalog: Catalog = {
  products: [
    { id: 'suprema', categoryId: 'pizzas', name: 'Suprema', price: 13000 },
    {
      id: 'jugo-mango',
      categoryId: 'jugos',
      name: 'Mango',
      variants: [
        { id: 'jugo-mango-500', label: '500 cc', price: 3500 },
        { id: 'jugo-mango-1l', label: '1 litro', price: 7000 },
      ],
    },
  ],
  buildPizza: {
    productId: 'arma-tu-pizza',
    name: 'Arma tu pizza',
    description: 'Base',
    basePrice: 10900,
    promoPrice: 13000,
    includedInPromo: 3,
  },
  ingredients: [
    { id: 'tocino', name: 'Tocino', price: 1500 },
    { id: 'choclo', name: 'Choclo', price: 1500 },
    { id: 'camaron', name: 'Camarón', price: 2500 },
  ],
}

function line(selection: LineSelection, quantity = 1): CartLine {
  const created = createLine(catalog, selection, quantity)
  if (!created) throw new Error(`selección inválida: ${JSON.stringify(selection)}`)
  return created
}

const suprema = () => line({ productId: 'suprema' })
const mango1l = () => line({ productId: 'jugo-mango', variantId: 'jugo-mango-1l' })

describe('parseStoredCart', () => {
  it('recupera lo guardado con serializeCart', () => {
    const lines = [
      line({ productId: 'suprema' }, 2),
      mango1l(),
      line({ productId: 'arma-tu-pizza', ingredientIds: ['choclo', 'tocino'] }),
    ]
    expect(parseStoredCart(serializeCart(lines), catalog)).toEqual(lines)
  })

  it('devuelve un pedido vacío si no hay nada o no se puede leer', () => {
    for (const raw of [null, '', 'no es json', '{"a":1}', '42', 'null']) {
      expect(parseStoredCart(raw, catalog)).toEqual([])
    }
  })

  it('descarta solo las líneas inválidas o que ya no están en la carta', () => {
    const raw = JSON.stringify([
      { productId: 'suprema', quantity: 1 },
      { productId: 'eliminado', quantity: 1 },
      { productId: 'suprema', quantity: 0 },
      { productId: 'suprema', quantity: 1.5 },
      { productId: 'suprema', quantity: '2' },
      { productId: 42, quantity: 1 },
      { productId: 'jugo-mango', variantId: 7, quantity: 1 },
      { productId: 'arma-tu-pizza', ingredientIds: 'tocino', quantity: 1 },
      null,
      'texto',
    ])
    expect(parseStoredCart(raw, catalog)).toEqual([suprema()])
  })

  it('actualiza precios desde la carta, junta repetidos y respeta el máximo', () => {
    const raw = JSON.stringify([
      { productId: 'suprema', quantity: 30, unitPrice: 1 },
      { productId: 'suprema', quantity: 30 },
    ])
    expect(parseStoredCart(raw, catalog)).toEqual([line({ productId: 'suprema' }, 50)])
  })
})
