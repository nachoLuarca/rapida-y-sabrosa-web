import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { categories, deliveryZones, ingredients, products, productVariants } from '../db/schema/index.ts'

export type CategoryRow = typeof categories.$inferSelect
export type ProductRow = typeof products.$inferSelect
export type VariantRow = typeof productVariants.$inferSelect
export type IngredientRow = typeof ingredients.$inferSelect
export type ZoneRow = typeof deliveryZones.$inferSelect

export interface CatalogSnapshot {
  categories: CategoryRow[]
  products: ProductRow[]
  variants: VariantRow[]
  ingredients: IngredientRow[]
  /** Solo las activas. */
  zones: ZoneRow[]
}

/** Único lugar que lee el catálogo de la base. Todo viene ordenado por sort_order y luego por id. */
export class CatalogRepository {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  /** Lee todo en una transacción de solo lectura: las cinco consultas ven la misma versión de la carta. */
  async getSnapshot(): Promise<CatalogSnapshot> {
    return this.db.transaction(
      async (tx) => ({
        categories: await tx.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
        products: await tx.select().from(products).orderBy(asc(products.sortOrder), asc(products.id)),
        variants: await tx
          .select()
          .from(productVariants)
          .orderBy(asc(productVariants.sortOrder), asc(productVariants.id)),
        ingredients: await tx.select().from(ingredients).orderBy(asc(ingredients.sortOrder), asc(ingredients.id)),
        zones: await tx
          .select()
          .from(deliveryZones)
          .where(eq(deliveryZones.active, true))
          .orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.id)),
      }),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
}
