import { describe, expect, it } from 'vitest'
import {
  cartReducer,
  cartTotals,
  createLine,
  lineKey,
  lineTotal,
  MAX_LINE_QUANTITY,
  quantityInCart,
} from './cart.ts'
import type { CartLine, Catalog, LineSelection } from './types.ts'

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

describe('lineKey', () => {
  it('es igual con los mismos ingredientes en cualquier orden', () => {
    const a = lineKey({ productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'] })
    const b = lineKey({ productId: 'arma-tu-pizza', ingredientIds: ['choclo', 'tocino'] })
    expect(a).toBe(b)
  })

  it('distingue producto, variante e ingredientes', () => {
    const keys = [
      lineKey({ productId: 'suprema' }),
      lineKey({ productId: 'jugo-mango', variantId: 'jugo-mango-500' }),
      lineKey({ productId: 'jugo-mango', variantId: 'jugo-mango-1l' }),
      lineKey({ productId: 'arma-tu-pizza', ingredientIds: [] }),
      lineKey({ productId: 'arma-tu-pizza', ingredientIds: ['tocino'] }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('createLine', () => {
  it('toma nombre y precio de la carta', () => {
    expect(suprema()).toMatchObject({ name: 'Suprema', unitPrice: 13000, quantity: 1 })
  })

  it('usa el precio y la etiqueta de la variante', () => {
    expect(mango1l()).toMatchObject({ name: 'Mango', variantLabel: '1 litro', unitPrice: 7000 })
  })

  it('cotiza Arma tu pizza y conserva el orden en que se eligieron los ingredientes', () => {
    const pizza = line({ productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo', 'tocino'] })
    expect(pizza).toMatchObject({
      name: 'Arma tu pizza',
      ingredientIds: ['tocino', 'choclo'],
      ingredientNames: ['Tocino', 'Choclo'],
      unitPrice: 13000,
    })
    expect(line({ productId: 'arma-tu-pizza' }).unitPrice).toBe(10900)
  })

  it('rechaza selecciones que no están en la carta', () => {
    expect(createLine(catalog, { productId: 'no-existe' })).toBeNull()
    expect(createLine(catalog, { productId: 'jugo-mango' })).toBeNull()
    expect(createLine(catalog, { productId: 'jugo-mango', variantId: 'otra' })).toBeNull()
    expect(createLine(catalog, { productId: 'suprema', variantId: 'jugo-mango-1l' })).toBeNull()
    expect(createLine(catalog, { productId: 'suprema', ingredientIds: ['tocino'] })).toBeNull()
    expect(createLine(catalog, { productId: 'arma-tu-pizza', ingredientIds: ['oro'] })).toBeNull()
    expect(createLine(catalog, { productId: 'arma-tu-pizza', variantId: 'x' })).toBeNull()
    expect(createLine(catalog, { productId: 'suprema' }, 0)).toBeNull()
  })

  it('limita la cantidad al máximo por línea', () => {
    expect(line({ productId: 'suprema' }, 80).quantity).toBe(MAX_LINE_QUANTITY)
  })
})

describe('cartReducer', () => {
  it('add agrega una línea nueva', () => {
    expect(cartReducer([], { type: 'add', line: suprema() })).toEqual([suprema()])
  })

  it('add junta productos iguales en una sola línea', () => {
    const first = line({ productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'] })
    const second = line({ productId: 'arma-tu-pizza', ingredientIds: ['choclo', 'tocino'] }, 2)
    const lines = cartReducer(cartReducer([], { type: 'add', line: first }), { type: 'add', line: second })
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
    expect(lines[0].ingredientNames).toEqual(['Tocino', 'Choclo'])
  })

  it('add no pasa del máximo por línea', () => {
    const lines = cartReducer([line({ productId: 'suprema' }, 49)], { type: 'add', line: line({ productId: 'suprema' }, 5) })
    expect(lines[0].quantity).toBe(MAX_LINE_QUANTITY)
  })

  it('setQuantity cambia la cantidad, con 0 elimina y nunca pasa del máximo', () => {
    const lines = [suprema(), mango1l()]
    expect(cartReducer(lines, { type: 'setQuantity', key: suprema().key, quantity: 4 })[0].quantity).toBe(4)
    expect(cartReducer(lines, { type: 'setQuantity', key: suprema().key, quantity: 0 })).toEqual([mango1l()])
    expect(cartReducer(lines, { type: 'setQuantity', key: suprema().key, quantity: -3 })).toEqual([mango1l()])
    expect(cartReducer(lines, { type: 'setQuantity', key: suprema().key, quantity: 99 })[0].quantity).toBe(50)
  })

  it('remove elimina la línea y clear vacía el pedido', () => {
    const lines = [suprema(), mango1l()]
    expect(cartReducer(lines, { type: 'remove', key: mango1l().key })).toEqual([suprema()])
    expect(cartReducer(lines, { type: 'clear' })).toEqual([])
  })

  it('devuelve el mismo arreglo cuando nada cambia', () => {
    const lines = [line({ productId: 'suprema' }, 50)]
    expect(cartReducer(lines, { type: 'add', line: suprema() })).toBe(lines)
    expect(cartReducer(lines, { type: 'setQuantity', key: 'no-existe', quantity: 2 })).toBe(lines)
    expect(cartReducer(lines, { type: 'setQuantity', key: lines[0].key, quantity: Number.NaN })).toBe(lines)
    expect(cartReducer(lines, { type: 'remove', key: 'no-existe' })).toBe(lines)
    const empty: CartLine[] = []
    expect(cartReducer(empty, { type: 'clear' })).toBe(empty)
  })
})

describe('totales', () => {
  it('suma unidades y subtotal', () => {
    const lines = [line({ productId: 'suprema' }, 2), mango1l()]
    expect(cartTotals(lines)).toEqual({ itemCount: 3, subtotal: 33000 })
    expect(lineTotal(lines[0])).toBe(26000)
    expect(cartTotals([])).toEqual({ itemCount: 0, subtotal: 0 })
  })

  it('cuenta unidades por producto y por variante', () => {
    const lines = [
      line({ productId: 'jugo-mango', variantId: 'jugo-mango-500' }, 2),
      line({ productId: 'jugo-mango', variantId: 'jugo-mango-1l' }, 3),
      line({ productId: 'arma-tu-pizza', ingredientIds: ['tocino'] }),
      line({ productId: 'arma-tu-pizza', ingredientIds: ['choclo'] }, 2),
    ]
    expect(quantityInCart(lines, 'jugo-mango')).toBe(5)
    expect(quantityInCart(lines, 'jugo-mango', 'jugo-mango-1l')).toBe(3)
    expect(quantityInCart(lines, 'arma-tu-pizza')).toBe(3)
    expect(quantityInCart(lines, 'suprema')).toBe(0)
  })
})
