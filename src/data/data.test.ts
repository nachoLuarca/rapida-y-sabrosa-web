import { describe, expect, it } from 'vitest'
import ingredientsJson from '../../docs/data/ingredients.json'
import menuJson from '../../docs/data/menu.json'
import zonesJson from '../../docs/data/zones.json'
import { ingredients } from './ingredients'
import { buildPizza, categories, products } from './menu'
import { zones } from './zones'

const isPrice = (value: number) => Number.isInteger(value) && value > 0

describe('datos', () => {
  it('son una copia exacta de docs/data', () => {
    expect({ categories, products, buildPizza }).toEqual(menuJson)
    expect(zones).toEqual(zonesJson)
    expect(ingredients).toEqual(ingredientsJson)
  })

  it('tienen la cantidad esperada de categorías, productos, zonas e ingredientes', () => {
    expect(categories).toHaveLength(9)
    expect(products).toHaveLength(87)
    expect(zones).toHaveLength(13)
    expect(ingredients).toHaveLength(27)
  })

  it('no repiten ids', () => {
    const ids = [
      ...products.map((p) => p.id),
      ...products.flatMap((p) => p.variants?.map((v) => v.id) ?? []),
      buildPizza.productId,
    ]
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length)
    expect(new Set(zones.map((z) => z.id)).size).toBe(zones.length)
    expect(new Set(ingredients.map((i) => i.id)).size).toBe(ingredients.length)
  })

  it('cada producto pertenece a una categoría existente y tiene precios enteros positivos', () => {
    const categoryIds = new Set(categories.map((c) => c.id))
    for (const product of products) {
      expect(categoryIds.has(product.categoryId), product.id).toBe(true)
      const prices = product.variants ? product.variants.map((v) => v.price) : [product.price]
      expect(prices.every(isPrice), product.id).toBe(true)
    }
    expect([...zones.map((z) => z.fee), ...ingredients.map((i) => i.price)].every(isPrice)).toBe(true)
  })
})
