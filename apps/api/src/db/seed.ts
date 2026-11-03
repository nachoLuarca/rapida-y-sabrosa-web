import { readFileSync } from 'node:fs'
import { priceSchema, slugSchema, whatsappNumberSchema } from '@rys/contracts'
import { getTableColumns, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import type { Db } from './client.ts'
import { categories, deliveryZones, ingredients, products, productVariants, settings } from './schema/index.ts'
import { businessSeed } from './seed-business.ts'

// Seed (docs/BACKEND-SPEC.md → Seed): carga la carta de docs/data/*.json y los datos del local. Tiene dos modos:
// - 'missing' (npm run db:seed): solo inserta lo que falta, por id. Nunca pisa lo que el local cambió en la base
//   (precios, disponibilidad, ajustes). Correrlo de nuevo no cambia nada.
// - 'reset' (para demo:reset, Fase 10): deja todo lo que viene de docs/data igual a docs/data, incluidos precios,
//   disponibilidad, zonas activas y la pausa. Lo que no viene de docs/data (p. ej. una zona creada en el panel)
//   no se toca.

const DOCS_DATA_DIR = new URL('../../../../docs/data/', import.meta.url)

const menuFileSchema = z.object({
  categories: z.array(z.object({ id: slugSchema, name: z.string(), description: z.string().optional() })),
  products: z.array(
    z
      .object({
        id: slugSchema,
        categoryId: slugSchema,
        name: z.string(),
        description: z.string().optional(),
        price: priceSchema.optional(),
        variants: z.array(z.object({ id: slugSchema, label: z.string(), price: priceSchema })).min(1).optional(),
        tags: z.array(z.string()).optional(),
        image: z.string().optional(),
      })
      .refine((product) => (product.price === undefined) !== (product.variants === undefined), {
        error: 'Cada producto tiene price o variants, nunca ambos ni ninguno.',
      }),
  ),
  buildPizza: z.object({
    productId: slugSchema,
    name: z.string(),
    description: z.string(),
    basePrice: priceSchema,
    promoPrice: priceSchema,
    includedInPromo: z.number().int().min(0),
  }),
})

const zonesFileSchema = z.array(z.object({ id: slugSchema, name: z.string(), fee: priceSchema }))
const ingredientsFileSchema = z.array(z.object({ id: slugSchema, name: z.string(), price: priceSchema }))

const businessSchema = z.object({
  name: z.string().min(1),
  whatsappNumber: whatsappNumberSchema,
  pickupAddress: z.string().nullable(),
  openingHours: z.null(),
  timezone: z.string(),
  ordersPaused: z.boolean(),
})

export interface SeedData {
  menu: z.infer<typeof menuFileSchema>
  zones: z.infer<typeof zonesFileSchema>
  ingredients: z.infer<typeof ingredientsFileSchema>
  business: z.infer<typeof businessSchema>
}

function readJson<T>(dir: URL, file: string, schema: z.ZodType<T>): T {
  const path = new URL(file, dir)
  const result = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!result.success) throw new Error(`docs/data/${file} no tiene el formato esperado:\n${z.prettifyError(result.error)}`)
  return result.data
}

/** Lee y valida docs/data/*.json y los datos del local. */
export function loadSeedData(dataDir: URL = DOCS_DATA_DIR): SeedData {
  return {
    menu: readJson(dataDir, 'menu.json', menuFileSchema),
    zones: readJson(dataDir, 'zones.json', zonesFileSchema),
    ingredients: readJson(dataDir, 'ingredients.json', ingredientsFileSchema),
    business: businessSchema.parse(businessSeed),
  }
}

/** En un upsert, actualiza todas las columnas (salvo el id) con el valor nuevo. */
function updateAllColumns(table: PgTable): Record<string, SQL> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([, column]) => !column.primary)
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  )
}

export type SeedMode = 'missing' | 'reset'

/** Filas que el seed insertó (en 'missing') o dejó como en docs/data (en 'reset'), por tabla. */
export interface SeedSummary {
  categories: number
  products: number
  variants: number
  ingredients: number
  zones: number
  settings: number
}

export async function seedDatabase(db: Db, data: SeedData, mode: SeedMode = 'missing'): Promise<SeedSummary> {
  const { menu, business } = data
  const buildPizzaCategory = menu.categories.find((category) => category.id === menu.buildPizza.productId)
  if (!buildPizzaCategory) {
    throw new Error(`docs/data/menu.json no tiene la categoría "${menu.buildPizza.productId}" de Arma tu pizza.`)
  }

  const categoryRows = menu.categories.map((category, index) => ({
    id: category.id,
    name: category.name,
    description: category.description ?? null,
    // La web reconoce Arma tu pizza igual: la categoría con el id de buildPizza.productId.
    kind: category.id === buildPizzaCategory.id ? ('build_pizza' as const) : ('regular' as const),
    sortOrder: index,
  }))

  const productRows = [
    ...menu.products.map((product, index) => ({
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      description: product.description ?? null,
      price: product.variants ? null : (product.price ?? null),
      tags: product.tags ?? [],
      imageUrl: product.image ?? null,
      available: true,
      sortOrder: index,
    })),
    // Arma tu pizza también es un producto (se puede marcar agotado); su precio sale de los ajustes.
    {
      id: menu.buildPizza.productId,
      categoryId: buildPizzaCategory.id,
      name: menu.buildPizza.name,
      description: menu.buildPizza.description,
      price: null,
      tags: [],
      imageUrl: null,
      available: true,
      sortOrder: 0,
    },
  ]

  const variantRows = menu.products.flatMap((product) =>
    (product.variants ?? []).map((variant, index) => ({
      id: variant.id,
      productId: product.id,
      label: variant.label,
      price: variant.price,
      sortOrder: index,
    })),
  )

  const ingredientRows = data.ingredients.map((ingredient, index) => ({ ...ingredient, available: true, sortOrder: index }))
  const zoneRows = data.zones.map((zone, index) => ({ ...zone, active: true, sortOrder: index }))

  const settingsRow = {
    id: 1,
    businessName: business.name,
    whatsappNumber: business.whatsappNumber,
    pickupAddress: business.pickupAddress,
    openingHours: business.openingHours,
    timezone: business.timezone,
    ordersPaused: business.ordersPaused,
    buildPizzaBasePrice: menu.buildPizza.basePrice,
    buildPizzaPromoPrice: menu.buildPizza.promoPrice,
    buildPizzaPromoIncluded: menu.buildPizza.includedInPromo,
    updatedAt: new Date(),
  }

  return db.transaction(async (tx) => {
    // Inserta las filas por id: en 'missing' ignora las que ya existen; en 'reset' las deja como en docs/data.
    // Devuelve cuántas filas insertó o actualizó.
    async function upsert<T extends PgTable>(table: T & { id: AnyPgColumn }, rows: T['$inferInsert'][]) {
      if (rows.length === 0) return 0
      const insert = tx.insert(table).values(rows)
      const written =
        mode === 'reset'
          ? await insert.onConflictDoUpdate({ target: table.id, set: updateAllColumns(table) }).returning()
          : await insert.onConflictDoNothing({ target: table.id }).returning()
      return written.length
    }

    // El orden importa: las categorías antes que los productos y estos antes que sus variantes.
    return {
      categories: await upsert(categories, categoryRows),
      products: await upsert(products, productRows),
      variants: await upsert(productVariants, variantRows),
      ingredients: await upsert(ingredients, ingredientRows),
      zones: await upsert(deliveryZones, zoneRows),
      settings: await upsert(settings, [settingsRow]),
    }
  })
}
