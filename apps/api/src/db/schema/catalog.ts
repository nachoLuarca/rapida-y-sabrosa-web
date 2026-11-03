import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgEnum, pgTable, text, type AnyPgColumn } from 'drizzle-orm/pg-core'

// Catálogo (docs/BACKEND-SPEC.md → Modelo de datos). Ids como slug de texto, los mismos de docs/data/*.json.
// Dinero en pesos enteros, entre 0 y 1.000.000.

const priceCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} BETWEEN 0 AND 1000000`)

export const categoryKind = pgEnum('category_kind', ['regular', 'build_pizza'])

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  kind: categoryKind('kind').notNull().default('regular'),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    name: text('name').notNull(),
    description: text('description'),
    /** null si tiene variantes (y en Arma tu pizza, cuyo precio sale de los ajustes). */
    price: integer('price'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    imageUrl: text('image_url'),
    available: boolean('available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('products_category_id_idx').on(table.categoryId), priceCheck('products_price_check', table.price)],
)

export const productVariants = pgTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Texto visible: "500 cc". */
    label: text('label').notNull(),
    price: integer('price').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('product_variants_product_id_idx').on(table.productId),
    priceCheck('product_variants_price_check', table.price),
  ],
)

export const ingredients = pgTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    price: integer('price').notNull(),
    available: boolean('available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [priceCheck('ingredients_price_check', table.price)],
)

export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    fee: integer('fee').notNull(),
    /** Las zonas no se borran: se desactivan. */
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [priceCheck('delivery_zones_fee_check', table.fee)],
)
