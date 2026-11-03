import { describe, expect, it } from 'vitest'
import { menuResponseSchema, openingHoursSchema, productSchema, type MenuResponse } from './menu.ts'

const menu: MenuResponse = {
  categories: [
    {
      id: 'pizzas-carnes',
      name: 'Pizzas de mechada y charcutería',
      description: null,
      kind: 'regular',
      products: [
        {
          id: 'suprema',
          name: 'Suprema',
          description: 'Carne mechada.',
          price: 13000,
          variants: [],
          tags: [],
          imageUrl: null,
          available: true,
        },
      ],
    },
    { id: 'arma-tu-pizza', name: 'Arma tu pizza', description: null, kind: 'build_pizza', products: [] },
    {
      id: 'jugos',
      name: 'Jugos naturales',
      description: 'Botella de 500 cc o de 1 litro.',
      kind: 'regular',
      products: [
        {
          id: 'jugo-mango',
          name: 'Mango',
          description: null,
          price: null,
          variants: [
            { id: 'jugo-mango-500', label: '500 cc', price: 3500 },
            { id: 'jugo-mango-1l', label: '1 litro', price: 7000 },
          ],
          tags: [],
          imageUrl: null,
          available: false,
        },
      ],
    },
  ],
  ingredients: [{ id: 'tocino', name: 'Tocino', price: 1500, available: true }],
  zones: [{ id: 'islita', name: 'Islita', fee: 2000 }],
  buildPizza: {
    productId: 'arma-tu-pizza',
    name: 'Arma tu pizza',
    description: 'Salsa de tomates frescos, mozzarella, nuestra masa y orégano.',
    basePrice: 10900,
    promoPrice: 13000,
    includedInPromo: 3,
    available: true,
  },
  business: {
    name: 'Rápida y Sabrosa',
    whatsappNumber: '56974314602',
    pickupAddress: null,
    openingHours: null,
    isOpen: true,
    nextOpening: null,
    ordersPaused: false,
  },
}

const week = { mon: [], tue: [['19:00', '01:00']], wed: [], thu: [], fri: [], sat: [], sun: [] }

describe('menuResponseSchema', () => {
  it('acepta la carta con lo pendiente en null y agotados con available false', () => {
    expect(menuResponseSchema.parse(menu)).toEqual(menu)
  })

  it('acepta un horario y la próxima apertura con zona horaria', () => {
    const business = { ...menu.business, openingHours: week, isOpen: false, nextOpening: '2026-11-03T19:00:00-03:00' }
    expect(menuResponseSchema.safeParse({ ...menu, business }).success).toBe(true)
  })

  it('rechaza un número de WhatsApp que no sea 56 + 9 dígitos', () => {
    const business = { ...menu.business, whatsappNumber: '+56 9 7431 4602' }
    expect(menuResponseSchema.safeParse({ ...menu, business }).success).toBe(false)
  })
})

describe('productSchema', () => {
  const base = menu.categories[0].products[0]

  it('exige precio o variantes, nunca ambos ni ninguno', () => {
    const variants = [{ id: 'x-500', label: '500 cc', price: 3500 }]
    expect(productSchema.safeParse({ ...base, price: 1000, variants }).success).toBe(false)
    expect(productSchema.safeParse({ ...base, price: null, variants: [] }).success).toBe(false)
    expect(productSchema.safeParse({ ...base, price: null, variants }).success).toBe(true)
  })

  it('exige precios enteros entre 0 y 1.000.000', () => {
    expect(productSchema.safeParse({ ...base, price: 12.5 }).success).toBe(false)
    expect(productSchema.safeParse({ ...base, price: -1 }).success).toBe(false)
    expect(productSchema.safeParse({ ...base, price: 1_000_001 }).success).toBe(false)
  })
})

describe('openingHoursSchema', () => {
  it('exige los siete días y horas HH:MM', () => {
    expect(openingHoursSchema.safeParse(week).success).toBe(true)
    const { sun: _sun, ...withoutSunday } = week
    expect(openingHoursSchema.safeParse(withoutSunday).success).toBe(false)
    expect(openingHoursSchema.safeParse({ ...week, mon: [['9:00', '12:00']] }).success).toBe(false)
    expect(openingHoursSchema.safeParse({ ...week, mon: [['24:00', '12:00']] }).success).toBe(false)
    expect(openingHoursSchema.safeParse({ ...week, holiday: [] }).success).toBe(false)
  })
})
