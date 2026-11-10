import { asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { categories, deliveryZones, ingredients, products, productVariants } from '../db/schema/index.ts'

export type CategoryRow = typeof categories.$inferSelect
export type ProductRow = typeof products.$inferSelect
export type VariantRow = typeof productVariants.$inferSelect
export type IngredientRow = typeof ingredients.$inferSelect
export type ZoneRow = typeof deliveryZones.$inferSelect

export type ProductChanges = Partial<Pick<ProductRow, 'name' | 'description' | 'price' | 'available'>>
export type VariantChanges = Partial<Pick<VariantRow, 'label' | 'price'>>
export type IngredientChanges = Partial<Pick<IngredientRow, 'name' | 'price' | 'available'>>
export type ZoneChanges = Partial<Pick<ZoneRow, 'name' | 'fee' | 'active'>>

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

  // --- Gestión del panel. Los update devuelven la fila nueva, o null si el id no existe. ---

  async findProduct(id: string): Promise<ProductRow | null> {
    const [row] = await this.db.select().from(products).where(eq(products.id, id)).limit(1)
    return row ?? null
  }

  async variantsOf(productId: string): Promise<VariantRow[]> {
    return this.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.id))
  }

  async updateProduct(id: string, changes: ProductChanges): Promise<ProductRow | null> {
    const [row] = await this.db.update(products).set(changes).where(eq(products.id, id)).returning()
    return row ?? null
  }

  async updateVariant(id: string, changes: VariantChanges): Promise<VariantRow | null> {
    const [row] = await this.db.update(productVariants).set(changes).where(eq(productVariants.id, id)).returning()
    return row ?? null
  }

  async updateIngredient(id: string, changes: IngredientChanges): Promise<IngredientRow | null> {
    const [row] = await this.db.update(ingredients).set(changes).where(eq(ingredients.id, id)).returning()
    return row ?? null
  }

  /** Todas las zonas, también las desactivadas. */
  async listZones(): Promise<ZoneRow[]> {
    return this.db.select().from(deliveryZones).orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.id))
  }

  /** La zona nueva queda al final de la lista. */
  async insertZone(zone: Pick<ZoneRow, 'id' | 'name' | 'fee' | 'active'>): Promise<ZoneRow> {
    const [row] = await this.db
      .insert(deliveryZones)
      .values({ ...zone, sortOrder: sql`(select coalesce(max(${deliveryZones.sortOrder}), -1) + 1 from ${deliveryZones})` })
      .returning()
    return row
  }

  async updateZone(id: string, changes: ZoneChanges): Promise<ZoneRow | null> {
    const [row] = await this.db.update(deliveryZones).set(changes).where(eq(deliveryZones.id, id)).returning()
    return row ?? null
  }
}
