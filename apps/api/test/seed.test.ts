import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { categories, deliveryZones, ingredients, products, productVariants, settings } from '../src/db/schema/index.ts'
import { loadSeedData, seedDatabase } from '../src/db/seed.ts'
import { useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

async function counts() {
  const count = async (table: Parameters<typeof ctx.db.$count>[0]) => ctx.db.$count(table)
  return {
    categories: await count(categories),
    products: await count(products),
    variants: await count(productVariants),
    ingredients: await count(ingredients),
    zones: await count(deliveryZones),
    settings: await count(settings),
  }
}

describe('seed', () => {
  it('carga la carta de docs/data, con Arma tu pizza como producto y una sola fila de ajustes', async () => {
    expect(await counts()).toEqual({ categories: 9, products: 88, variants: 16, ingredients: 27, zones: 13, settings: 1 })
    const [buildPizza] = await ctx.db.select().from(products).where(eq(products.id, 'arma-tu-pizza'))
    expect(buildPizza).toMatchObject({ categoryId: 'arma-tu-pizza', price: null, available: true })
  })

  it('es idempotente: correrlo de nuevo no duplica nada', async () => {
    const before = await counts()
    const summary = await seedDatabase(ctx.db, loadSeedData())
    expect(summary).toEqual({ categories: 9, products: 88, variants: 16, ingredients: 27, zones: 13 })
    expect(await counts()).toEqual(before)
  })

  it('deja lo pendiente de confirmar en null (de verdad null en la base, no un JSON "null")', async () => {
    const [row] = await ctx.db.execute<{ pickup: string | null; hours_is_null: boolean }>(
      sql`select pickup_address as pickup, opening_hours is null as hours_is_null from settings`,
    ).then((result) => result.rows)
    expect(row).toEqual({ pickup: null, hours_is_null: true })
  })

  it('vuelve a dejar precios y disponibilidad como en docs/data, sin tocar lo que no viene de ahí', async () => {
    await ctx.db.update(products).set({ price: 99_000, available: false }).where(eq(products.id, 'suprema'))
    await ctx.db.update(settings).set({ ordersPaused: true })
    await ctx.db.insert(deliveryZones).values({ id: 'zona-nueva', name: 'Zona nueva', fee: 4000, sortOrder: 99 })

    await seedDatabase(ctx.db, loadSeedData())

    const [suprema] = await ctx.db.select().from(products).where(eq(products.id, 'suprema'))
    expect(suprema).toMatchObject({ price: 13000, available: true })
    const [row] = await ctx.db.select().from(settings)
    expect(row?.ordersPaused).toBe(false)
    expect(await ctx.db.$count(deliveryZones, eq(deliveryZones.id, 'zona-nueva'))).toBe(1)
  })
})
