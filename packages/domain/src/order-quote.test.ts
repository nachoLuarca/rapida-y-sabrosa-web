import { describe, expect, it } from 'vitest'
import { createLine } from './cart.ts'
import { lineAvailability, quoteOrder, unavailableLineKeys } from './order-quote.ts'
import { catalog, zones } from './test/fixtures.ts'
import type { Catalog, CartLine, Fulfillment, Product } from './types.ts'

const islita = zones[1]
const delivery: Fulfillment = { type: 'delivery', zone: islita, address: 'Los Aromos 123' }
const pickup: Fulfillment = { type: 'pickup' }

const withAvailability = (changes: {
  products?: string[]
  ingredients?: string[]
  buildPizza?: boolean
}): Catalog => ({
  ...catalog,
  products: catalog.products.map((p) => ({ ...p, available: !changes.products?.includes(p.id) })),
  ingredients: catalog.ingredients.map((i) => ({ ...i, available: !changes.ingredients?.includes(i.id) })),
  buildPizza: { ...catalog.buildPizza, available: changes.buildPizza ?? true },
})

describe('quoteOrder', () => {
  it('cotiza el ejemplo de docs/SPEC.md: líneas, Arma tu pizza, despacho y total', () => {
    const quote = quoteOrder(
      catalog,
      [
        { productId: 'suprema', quantity: 2 },
        { productId: 'jugo-mango', variantId: 'jugo-mango-1l', quantity: 1 },
        { productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'], quantity: 1 },
      ],
      delivery,
    )
    expect(quote).toMatchObject({ ok: true, subtotal: 46000, deliveryFee: 2000, total: 48000 })
    if (!quote.ok) return
    expect(quote.lines.map(({ name, variantLabel, unitPrice, quantity, lineTotal }) => ({
      name,
      variantLabel,
      unitPrice,
      quantity,
      lineTotal,
    }))).toEqual([
      { name: 'Suprema', variantLabel: undefined, unitPrice: 13000, quantity: 2, lineTotal: 26000 },
      { name: 'Mango', variantLabel: '1 litro', unitPrice: 7000, quantity: 1, lineTotal: 7000 },
      { name: 'Arma tu pizza', variantLabel: undefined, unitPrice: 13000, quantity: 1, lineTotal: 13000 },
    ])
  })

  it('guarda el detalle de Arma tu pizza: qué ingredientes cubrió la promoción', () => {
    const quote = quoteOrder(
      catalog,
      [{ productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'camaron', 'choclo'], quantity: 1 }],
      pickup,
    )
    if (!quote.ok) throw new Error('se esperaba una cotización')
    expect(quote.lines[0].ingredients).toEqual([
      { id: 'tocino', name: 'Tocino', price: 1500, included: true },
      { id: 'camaron', name: 'Camarón', price: 2500, included: true },
      { id: 'choclo', name: 'Choclo', price: 1500, included: true },
    ])
    // Base sin ingredientes: no hay promoción que aplique.
    const plain = quoteOrder(catalog, [{ productId: 'arma-tu-pizza', ingredientIds: [], quantity: 1 }], pickup)
    expect(plain.ok && plain.lines[0]).toMatchObject({ unitPrice: 10900, ingredients: [] })
    // Un producto normal no tiene detalle de ingredientes.
    const suprema = quoteOrder(catalog, [{ productId: 'suprema', quantity: 1 }], pickup)
    expect(suprema.ok && suprema.lines[0].ingredients).toBeNull()
  })

  it('en retiro no cobra despacho', () => {
    expect(quoteOrder(catalog, [{ productId: 'suprema', quantity: 1 }], pickup)).toMatchObject({
      ok: true,
      subtotal: 13000,
      deliveryFee: 0,
      total: 13000,
    })
  })

  it('usa los precios de la carta que recibe, no los que el cliente cree', () => {
    const expensive: Catalog = {
      ...catalog,
      products: catalog.products.map((p): Product =>
        p.id === 'suprema' ? { id: p.id, categoryId: p.categoryId, name: p.name, price: 15000 } : p,
      ),
    }
    expect(quoteOrder(expensive, [{ productId: 'suprema', quantity: 2 }], pickup)).toMatchObject({ total: 30000 })
  })

  it('devuelve todos los ids que fallan, de todas las líneas, sin cotizar', () => {
    const quote = quoteOrder(
      withAvailability({ products: ['suprema'], ingredients: ['tocino'] }),
      [
        { productId: 'suprema', quantity: 1 },
        { productId: 'jugo-mango', variantId: 'jugo-pina-1l', quantity: 1 },
        { productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'no-existe', 'choclo'], quantity: 1 },
        { productId: 'no-existe', quantity: 1 },
      ],
      pickup,
    )
    expect(quote).toEqual({
      ok: false,
      unavailable: {
        productIds: ['no-existe', 'suprema'],
        variantIds: ['jugo-pina-1l'],
        ingredientIds: ['no-existe', 'tocino'],
      },
    })
  })
})

describe('lineAvailability', () => {
  it('acepta una línea válida con la carta de hoy', () => {
    expect(lineAvailability(catalog, { productId: 'suprema' })).toBeNull()
    expect(lineAvailability(catalog, { productId: 'jugo-mango', variantId: 'jugo-mango-500' })).toBeNull()
    expect(lineAvailability(catalog, { productId: 'arma-tu-pizza', ingredientIds: ['tocino'] })).toBeNull()
    // Sin el campo `available`, todo está disponible (la carta estática no lo trae).
    expect(catalog.products.every((p) => p.available === undefined)).toBe(true)
  })

  it('un producto agotado o que no existe falla por su id', () => {
    const soldOut = withAvailability({ products: ['suprema'] })
    expect(lineAvailability(soldOut, { productId: 'suprema' })).toEqual({
      productIds: ['suprema'],
      variantIds: [],
      ingredientIds: [],
    })
    expect(lineAvailability(catalog, { productId: 'pizza-fantasma' })?.productIds).toEqual(['pizza-fantasma'])
    // Un producto con variantes agotado falla aunque la variante exista.
    const juiceOut = withAvailability({ products: ['jugo-mango'] })
    expect(lineAvailability(juiceOut, { productId: 'jugo-mango', variantId: 'jugo-mango-500' })?.productIds).toEqual([
      'jugo-mango',
    ])
  })

  it('solo Arma tu pizza acepta ingredientes', () => {
    expect(lineAvailability(catalog, { productId: 'suprema', ingredientIds: ['tocino'] })?.productIds).toEqual([
      'suprema',
    ])
  })

  it('la variante debe ser del producto, no faltar ni sobrar', () => {
    expect(lineAvailability(catalog, { productId: 'jugo-mango', variantId: 'otra' })?.variantIds).toEqual(['otra'])
    expect(lineAvailability(catalog, { productId: 'jugo-mango' })?.productIds).toEqual(['jugo-mango'])
    expect(lineAvailability(catalog, { productId: 'suprema', variantId: 'x' })?.variantIds).toEqual(['x'])
    expect(lineAvailability(catalog, { productId: 'arma-tu-pizza', variantId: 'x' })?.variantIds).toEqual(['x'])
  })

  it('Arma tu pizza falla si está agotada o si un ingrediente está agotado o no existe', () => {
    expect(lineAvailability(withAvailability({ buildPizza: false }), { productId: 'arma-tu-pizza' })?.productIds).toEqual(
      ['arma-tu-pizza'],
    )
    expect(
      lineAvailability(withAvailability({ ingredients: ['choclo'] }), {
        productId: 'arma-tu-pizza',
        ingredientIds: ['tocino', 'choclo', 'piña'],
      })?.ingredientIds,
    ).toEqual(['choclo', 'piña'])
  })
})

describe('unavailableLineKeys', () => {
  it('marca solo las líneas del pedido que ya no se pueden pedir', () => {
    const lines = [
      createLine(catalog, { productId: 'suprema' }),
      createLine(catalog, { productId: 'jugo-mango', variantId: 'jugo-mango-500' }),
      createLine(catalog, { productId: 'arma-tu-pizza', ingredientIds: ['choclo'] }),
    ] as CartLine[]
    expect(unavailableLineKeys(catalog, lines)).toEqual([])
    expect(unavailableLineKeys(withAvailability({ products: ['suprema'], ingredients: ['choclo'] }), lines)).toEqual([
      lines[0].key,
      lines[2].key,
    ])
  })
})
