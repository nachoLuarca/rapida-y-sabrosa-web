import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { OpeningHoursDto } from '@rys/contracts'
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { categories, deliveryZones, ingredients, products, productVariants, settings } from '../src/db/schema/index.ts'
import { loadSeedData, seedDatabase } from '../src/db/seed.ts'
import { truncateAll, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()
const data = loadSeedData()

const FULL = { categories: 9, products: 88, variants: 16, ingredients: 27, zones: 13, settings: 1 }
const NOTHING = { categories: 0, products: 0, variants: 0, ingredients: 0, zones: 0, settings: 0 }

async function counts() {
  return {
    categories: await ctx.db.$count(categories),
    products: await ctx.db.$count(products),
    variants: await ctx.db.$count(productVariants),
    ingredients: await ctx.db.$count(ingredients),
    zones: await ctx.db.$count(deliveryZones),
    settings: await ctx.db.$count(settings),
  }
}

/** Lo que el local podría haber cambiado desde el panel. */
async function simulatePanelChanges() {
  await ctx.db.update(products).set({ price: 99_000, available: false }).where(eq(products.id, 'suprema'))
  await ctx.db.update(productVariants).set({ price: 8000 }).where(eq(productVariants.id, 'jugo-mango-1l'))
  await ctx.db.update(ingredients).set({ available: false }).where(eq(ingredients.id, 'tocino'))
  await ctx.db.update(deliveryZones).set({ active: false, fee: 2500 }).where(eq(deliveryZones.id, 'islita'))
  await ctx.db
    .update(settings)
    .set({ ordersPaused: true, pickupAddress: 'Calle del local 308', buildPizzaPromoPrice: 14000 })
  await ctx.db.insert(deliveryZones).values({ id: 'zona-nueva', name: 'Zona nueva', fee: 4000, sortOrder: 99 })
}

const productById = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0]
const variantById = async (id: string) =>
  (await ctx.db.select().from(productVariants).where(eq(productVariants.id, id)))[0]
const ingredientById = async (id: string) => (await ctx.db.select().from(ingredients).where(eq(ingredients.id, id)))[0]
const zoneById = async (id: string) => (await ctx.db.select().from(deliveryZones).where(eq(deliveryZones.id, id)))[0]
const currentSettings = async () => (await ctx.db.select().from(settings))[0]

// Cada test parte de una base vacía.
beforeEach(() => truncateAll(ctx.database))

describe('seed en modo missing (npm run db:seed)', () => {
  it('en una base vacía carga la carta completa, con Arma tu pizza como producto y una sola fila de ajustes', async () => {
    expect(await seedDatabase(ctx.db, data)).toEqual(FULL)
    expect(await counts()).toEqual(FULL)
    expect(await productById('arma-tu-pizza')).toMatchObject({ categoryId: 'arma-tu-pizza', price: null, available: true })
  })

  it('correrlo de nuevo no inserta ni duplica nada', async () => {
    await seedDatabase(ctx.db, data)
    expect(await seedDatabase(ctx.db, data)).toEqual(NOTHING)
    expect(await counts()).toEqual(FULL)
  })

  it('no pisa precios, disponibilidad, zonas ni ajustes que ya existen', async () => {
    await seedDatabase(ctx.db, data)
    await simulatePanelChanges()

    expect(await seedDatabase(ctx.db, data)).toEqual(NOTHING)

    expect(await productById('suprema')).toMatchObject({ price: 99_000, available: false })
    expect(await variantById('jugo-mango-1l')).toMatchObject({ price: 8000 })
    expect(await ingredientById('tocino')).toMatchObject({ available: false })
    expect(await zoneById('islita')).toMatchObject({ active: false, fee: 2500 })
    expect(await currentSettings()).toMatchObject({
      ordersPaused: true,
      pickupAddress: 'Calle del local 308',
      buildPizzaPromoPrice: 14000,
    })
  })

  it('inserta lo que falta: un producto con sus variantes, una zona o los ajustes', async () => {
    await seedDatabase(ctx.db, data)
    await ctx.db.delete(products).where(eq(products.id, 'jugo-pina'))
    await ctx.db.delete(deliveryZones).where(eq(deliveryZones.id, 'cmpc'))
    await ctx.db.delete(settings)
    await ctx.db.update(products).set({ price: 15_000 }).where(eq(products.id, 'suprema'))

    expect(await seedDatabase(ctx.db, data)).toEqual({ ...NOTHING, products: 1, variants: 2, zones: 1, settings: 1 })
    expect(await counts()).toEqual(FULL)
    expect(await productById('suprema')).toMatchObject({ price: 15_000 })
  })

  it('deja lo pendiente de confirmar en null (de verdad null en la base, no un JSON "null")', async () => {
    await seedDatabase(ctx.db, data)
    const result = await ctx.db.execute<{ pickup: string | null; hours_is_null: boolean }>(
      sql`select pickup_address as pickup, opening_hours is null as hours_is_null from settings`,
    )
    expect(result.rows).toEqual([{ pickup: null, hours_is_null: true }])
  })
})

describe('seed en modo reset (para demo:reset)', () => {
  it('vuelve a dejar todo lo de docs/data como en docs/data', async () => {
    await seedDatabase(ctx.db, data)
    await simulatePanelChanges()

    expect(await seedDatabase(ctx.db, data, 'reset')).toEqual(FULL)

    expect(await productById('suprema')).toMatchObject({ price: 13000, available: true })
    expect(await variantById('jugo-mango-1l')).toMatchObject({ price: 7000 })
    expect(await ingredientById('tocino')).toMatchObject({ available: true })
    expect(await zoneById('islita')).toMatchObject({ active: true, fee: 2000 })
    expect(await currentSettings()).toMatchObject({ ordersPaused: false, pickupAddress: null, buildPizzaPromoPrice: 13000 })
  })

  it('no toca lo que no viene de docs/data', async () => {
    await seedDatabase(ctx.db, data)
    await simulatePanelChanges()
    await seedDatabase(ctx.db, data, 'reset')
    expect(await zoneById('zona-nueva')).toMatchObject({ name: 'Zona nueva', fee: 4000 })
    expect(await counts()).toEqual({ ...FULL, zones: FULL.zones + 1 })
  })

  it('en una base vacía carga lo mismo que el modo missing', async () => {
    expect(await seedDatabase(ctx.db, data, 'reset')).toEqual(FULL)
    expect(await counts()).toEqual(FULL)
  })
})

describe('datos del local (docs/data/business.json)', () => {
  const businessJson = JSON.parse(readFileSync(new URL('../../../docs/data/business.json', import.meta.url), 'utf8'))

  it('el seed los toma de business.json, la misma fuente que la web', async () => {
    expect(data.business).toEqual({
      name: businessJson.name,
      whatsappNumber: businessJson.whatsappNumber,
      pickupAddress: businessJson.pickupAddress,
      openingHours: businessJson.openingHours,
      timezone: businessJson.timezone,
    })
    await seedDatabase(ctx.db, data)
    expect(await currentSettings()).toMatchObject({
      businessName: 'Rápida y Sabrosa',
      whatsappNumber: '56974314602',
      timezone: 'America/Santiago',
      ordersPaused: false,
    })
  })

  it('guarda el horario y la dirección cuando el local los confirme', async () => {
    const week: OpeningHoursDto = { mon: [], tue: [['19:00', '23:30']], wed: [], thu: [], fri: [], sat: [], sun: [] }
    const confirmed = { ...data, business: { ...data.business, pickupAddress: 'Calle del local 308', openingHours: week } }
    await seedDatabase(ctx.db, confirmed)
    expect(await currentSettings()).toMatchObject({ pickupAddress: 'Calle del local 308', openingHours: week })
  })

  it('rechaza un business.json con formato inválido, diciendo qué archivo es', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rys-seed-'))
    try {
      for (const file of ['menu.json', 'zones.json', 'ingredients.json']) {
        copyFileSync(new URL(`../../../docs/data/${file}`, import.meta.url), join(dir, file))
      }
      const broken = { ...businessJson, whatsappNumber: '+56 9 7431 4602', openingHours: { mon: [['9:00', '12:00']] } }
      writeFileSync(join(dir, 'business.json'), JSON.stringify(broken))
      expect(() => loadSeedData(pathToFileURL(`${dir}/`))).toThrow(/docs\/data\/business\.json no tiene el formato esperado/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
