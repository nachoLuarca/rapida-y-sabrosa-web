import { describe, expect, it } from 'vitest'
import { quoteBuildPizza } from './build-pizza'
import type { BuildPizzaConfig, Ingredient } from './types'

const config: BuildPizzaConfig = {
  productId: 'arma-tu-pizza',
  name: 'Arma tu pizza',
  description: 'Salsa de tomates frescos, mozzarella, nuestra masa y orégano.',
  basePrice: 10900,
  promoPrice: 13000,
  includedInPromo: 3,
}

const normal = (id: string): Ingredient => ({ id, name: id, price: 1500 })
const premium = (id: string): Ingredient => ({ id, name: id, price: 2500 })

describe('quoteBuildPizza: casos de docs/SPEC.md', () => {
  it('sin ingredientes cuesta la base: $10.900', () => {
    const quote = quoteBuildPizza([], config)
    expect(quote.total).toBe(10900)
    expect(quote.mode).toBe('base')
    expect(quote.label).toBe('Base')
    expect(quote.includedRemaining).toBe(3)
  })

  it('1 ingrediente de $1.500 cuesta $12.400 (base + ingredientes)', () => {
    const quote = quoteBuildPizza([normal('a')], config)
    expect(quote.total).toBe(12400)
    expect(quote.mode).toBe('base')
    expect(quote.label).toBe('Base + ingredientes')
    expect(quote.includedRemaining).toBe(2)
  })

  it('2 ingredientes de $2.500 cuestan $13.000 (promoción)', () => {
    const quote = quoteBuildPizza([premium('a'), premium('b')], config)
    expect(quote.total).toBe(13000)
    expect(quote.mode).toBe('promo')
    expect(quote.label).toBe('Promoción')
    expect(quote.includedRemaining).toBe(1)
  })

  it('3 ingredientes de $1.500 cuestan $13.000', () => {
    const quote = quoteBuildPizza([normal('a'), normal('b'), normal('c')], config)
    expect(quote.total).toBe(13000)
    expect(quote.mode).toBe('promo')
    expect(quote.charged).toEqual([])
    expect(quote.includedRemaining).toBe(0)
  })

  it('2 de $2.500 + 2 de $1.500 cuestan $14.500: se cobra 1 extra de $1.500', () => {
    const selected = [normal('n1'), premium('p1'), normal('n2'), premium('p2')]
    const quote = quoteBuildPizza(selected, config)
    expect(quote.total).toBe(14500)
    expect(quote.mode).toBe('promo')
    expect(quote.label).toBe('Promoción + 1 extra')
    expect(quote.included.map((i) => i.id)).toEqual(['p1', 'p2', 'n1'])
    expect(quote.charged.map((i) => i.id)).toEqual(['n2'])
  })
})

describe('quoteBuildPizza: otras reglas', () => {
  it('en la promoción incluye los más caros y cobra el resto en el orden elegido', () => {
    const selected = [normal('n1'), normal('n2'), premium('p1'), normal('n3'), premium('p2')]
    const quote = quoteBuildPizza(selected, config)
    expect(quote.included.map((i) => i.id)).toEqual(['p1', 'p2', 'n1'])
    expect(quote.charged.map((i) => i.id)).toEqual(['n2', 'n3'])
    expect(quote.total).toBe(13000 + 1500 * 2)
    expect(quote.label).toBe('Promoción + 2 extras')
  })

  it('siempre aplica la opción más barata para el cliente', () => {
    for (let normals = 0; normals <= 6; normals++) {
      for (let premiums = 0; premiums <= 6; premiums++) {
        const selected = [
          ...Array.from({ length: normals }, (_, i) => normal(`n${i}`)),
          ...Array.from({ length: premiums }, (_, i) => premium(`p${i}`)),
        ]
        const base = 10900 + normals * 1500 + premiums * 2500
        const quote = quoteBuildPizza(selected, config)
        expect(quote.total).toBeLessThanOrEqual(base)
        expect(quote.total).toBe(quote.mode === 'promo' ? 13000 + quote.charged.reduce((t, i) => t + i.price, 0) : base)
      }
    }
  })

  it('si la base y la promoción empatan, usa la base', () => {
    const quote = quoteBuildPizza([{ id: 'x', name: 'x', price: 2100 }], config)
    expect(quote.total).toBe(13000)
    expect(quote.mode).toBe('base')
  })

  it('no modifica la selección recibida', () => {
    const selected = [normal('n1'), premium('p1')]
    quoteBuildPizza(selected, config)
    expect(selected.map((i) => i.id)).toEqual(['n1', 'p1'])
  })
})
