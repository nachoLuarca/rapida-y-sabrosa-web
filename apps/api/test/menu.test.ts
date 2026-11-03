import { readFileSync } from 'node:fs'
import { menuResponseSchema, type MenuResponse } from '@rys/contracts'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { deliveryZones, ingredients, products, productVariants, settings } from '../src/db/schema/index.ts'
import { reseed, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

const docs = (file: string) => JSON.parse(readFileSync(new URL(`../../../docs/data/${file}`, import.meta.url), 'utf8'))
const menuJson = docs('menu.json')
const zonesJson = docs('zones.json')
const ingredientsJson = docs('ingredients.json')

// Cada test parte de la carta tal como la deja el seed.
beforeEach(() => reseed(ctx.database))

async function getMenu(): Promise<MenuResponse> {
  const response = await request(ctx.app()).get('/api/menu')
  expect(response.status).toBe(200)
  return menuResponseSchema.parse(response.body)
}

const allProducts = (menu: MenuResponse) => menu.categories.flatMap((category) => category.products)

describe('GET /api/menu', () => {
  it('devuelve la carta completa de docs/data, en orden y con la forma del contrato', async () => {
    const response = await request(ctx.app()).get('/api/menu')
    expect(response.status).toBe(200)
    expect(response.type).toBe('application/json')
    const menu = menuResponseSchema.parse(response.body)
    // Sin campos de más: el body es exactamente lo que define el contrato.
    expect(response.body).toEqual(menu)

    expect(menu.categories.map((category) => category.id)).toEqual(menuJson.categories.map((c: { id: string }) => c.id))
    expect(allProducts(menu).map((product) => product.id)).toEqual(menuJson.products.map((p: { id: string }) => p.id))
    expect(menu.ingredients.map(({ id, name, price }) => ({ id, name, price }))).toEqual(ingredientsJson)
    expect(menu.zones).toEqual(zonesJson)
  })

  it('cada producto conserva nombre, descripción, precio, variantes y etiquetas', async () => {
    const menu = await getMenu()
    const byId = new Map(allProducts(menu).map((product) => [product.id, product]))
    for (const expected of menuJson.products) {
      const product = byId.get(expected.id)
      expect(product, expected.id).toEqual({
        id: expected.id,
        name: expected.name,
        description: expected.description ?? null,
        price: expected.price ?? null,
        variants: expected.variants ?? [],
        tags: expected.tags ?? [],
        imageUrl: null,
        available: true,
      })
    }
  })

  it('Arma tu pizza va en buildPizza con los precios de los ajustes, y su categoría sin productos', async () => {
    const menu = await getMenu()
    const category = menu.categories.find((c) => c.id === 'arma-tu-pizza')
    expect(category).toMatchObject({ kind: 'build_pizza', products: [] })
    expect(menu.categories.filter((c) => c.kind === 'build_pizza')).toHaveLength(1)
    expect(menu.buildPizza).toEqual({ ...menuJson.buildPizza, available: true })
  })

  it('respeta lo pendiente de confirmar: dirección y horario en null, sin restricción de horario', async () => {
    const menu = await getMenu()
    expect(menu.business).toEqual({
      name: 'Rápida y Sabrosa',
      whatsappNumber: '56974314602',
      pickupAddress: null,
      openingHours: null,
      isOpen: true,
      nextOpening: null,
      ordersPaused: false,
    })
    expect(menu.categories.find((c) => c.id === 'pizzas-carnes')?.description).toBeNull()
  })

  it('incluye los agotados con available false, sin ocultarlos', async () => {
    await ctx.db.update(products).set({ available: false }).where(eq(products.id, 'suprema'))
    await ctx.db.update(products).set({ available: false }).where(eq(products.id, 'jugo-mango'))
    await ctx.db.update(products).set({ available: false }).where(eq(products.id, 'arma-tu-pizza'))
    await ctx.db.update(ingredients).set({ available: false }).where(eq(ingredients.id, 'tocino'))

    const menu = await getMenu()
    const byId = new Map(allProducts(menu).map((product) => [product.id, product]))
    expect(byId.size).toBe(menuJson.products.length)
    expect(byId.get('suprema')?.available).toBe(false)
    expect(byId.get('jugo-mango')).toMatchObject({ available: false, variants: expect.any(Array) })
    expect(byId.get('california')?.available).toBe(true)
    expect(menu.buildPizza.available).toBe(false)
    expect(menu.ingredients.find((i) => i.id === 'tocino')).toMatchObject({ available: false })
    expect(menu.ingredients).toHaveLength(ingredientsJson.length)
  })

  it('excluye las zonas inactivas', async () => {
    await ctx.db.update(deliveryZones).set({ active: false }).where(eq(deliveryZones.id, 'islita'))
    const menu = await getMenu()
    expect(menu.zones.map((zone) => zone.id)).not.toContain('islita')
    expect(menu.zones).toHaveLength(zonesJson.length - 1)
  })

  it('con horario, calcula si está abierto y la próxima apertura en America/Santiago', async () => {
    const openingHours = {
      mon: [],
      tue: [['19:00', '23:30'] as [string, string]],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    }
    await ctx.db.update(settings).set({ openingHours })
    // Martes 3 de noviembre de 2026, 16:00 en Santiago (UTC-3).
    const clock = () => new Date('2026-11-03T19:00:00Z')
    const response = await request(ctx.app({ clock })).get('/api/menu')
    const { business } = menuResponseSchema.parse(response.body)
    expect(business).toMatchObject({ openingHours, isOpen: false, ordersPaused: false })
    expect(new Date(business.nextOpening ?? '').toISOString()).toBe('2026-11-03T22:00:00.000Z')
  })

  it('informa los pedidos pausados', async () => {
    await ctx.db.update(settings).set({ ordersPaused: true })
    expect((await getMenu()).business.ordersPaused).toBe(true)
  })

  it('si falta el seed responde 500 sin detalles internos', async () => {
    await ctx.db.delete(settings)
    const response = await request(ctx.app()).get('/api/menu')
    expect(response.status).toBe(500)
    expect(response.body.error).toMatchObject({ code: 'INTERNAL_ERROR', details: {} })
  })
})

describe('ETag de GET /api/menu', () => {
  it('trae ETag y Cache-Control: no-cache', async () => {
    const response = await request(ctx.app()).get('/api/menu')
    expect(response.headers.etag).toMatch(/^"[\w-]+"$/)
    expect(response.headers['cache-control']).toBe('no-cache')
  })

  it('responde 304 sin body si el ETag no cambió', async () => {
    const first = await request(ctx.app()).get('/api/menu')
    const second = await request(ctx.app()).get('/api/menu').set('If-None-Match', first.headers.etag)
    expect(second.status).toBe(304)
    expect(second.text).toBe('')
    expect(second.headers.etag).toBe(first.headers.etag)
    expect(second.headers['cache-control']).toBe('no-cache')
  })

  it('acepta el ETag en forma débil o dentro de una lista', async () => {
    const { etag } = (await request(ctx.app()).get('/api/menu')).headers
    const weak = await request(ctx.app()).get('/api/menu').set('If-None-Match', `W/${etag}`)
    expect(weak.status).toBe(304)
    const list = await request(ctx.app()).get('/api/menu').set('If-None-Match', `"otro", ${etag}`)
    expect(list.status).toBe(304)
  })

  it('responde 200 con un ETag que no coincide', async () => {
    const response = await request(ctx.app()).get('/api/menu').set('If-None-Match', '"viejo"')
    expect(response.status).toBe(200)
    expect(response.body.categories).toHaveLength(menuJson.categories.length)
  })

  it('cambia al cambiar un precio, y el ETag viejo ya no da 304', async () => {
    const before = await request(ctx.app()).get('/api/menu')
    await ctx.db.update(products).set({ price: 13500 }).where(eq(products.id, 'suprema'))

    const after = await request(ctx.app()).get('/api/menu').set('If-None-Match', before.headers.etag)
    expect(after.status).toBe(200)
    expect(after.headers.etag).not.toBe(before.headers.etag)
    const suprema = allProducts(menuResponseSchema.parse(after.body)).find((p) => p.id === 'suprema')
    expect(suprema?.price).toBe(13500)
  })

  it('cambia al cambiar una variante, un ingrediente, una zona o los ajustes', async () => {
    const etag = async () => (await request(ctx.app()).get('/api/menu')).headers.etag as string
    const seen = new Set([await etag()])

    await ctx.db.update(productVariants).set({ price: 7500 }).where(eq(productVariants.id, 'jugo-mango-1l'))
    seen.add(await etag())
    await ctx.db.update(ingredients).set({ price: 1800 }).where(eq(ingredients.id, 'choclo'))
    seen.add(await etag())
    await ctx.db.update(deliveryZones).set({ fee: 2200 }).where(eq(deliveryZones.id, 'islita'))
    seen.add(await etag())
    await ctx.db.update(settings).set({ buildPizzaPromoPrice: 13500 })
    seen.add(await etag())

    expect(seen.size).toBe(5)
  })
})
