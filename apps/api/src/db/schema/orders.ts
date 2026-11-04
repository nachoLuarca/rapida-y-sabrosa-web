import { ORDER_STATUSES } from '@rys/domain'
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { adminUsers } from './auth.ts'
import { deliveryZones } from './catalog.ts'

// Pedidos (docs/BACKEND-SPEC.md → Modelo de datos). Todo lo que viene de la carta se guarda como snapshot: si
// mañana cambia un precio o un nombre, el pedido de ayer no cambia.

export const orderStatus = pgEnum('order_status', ORDER_STATUSES)
export const fulfillmentType = pgEnum('fulfillment_type', ['delivery', 'pickup'])
export const paymentMethod = pgEnum('payment_method', ['cash', 'transfer', 'card'])

/** Numera los pedidos: RYS-0001, RYS-0002… (desde 10.000 el código sigue creciendo: RYS-10000). */
export const orderCodeSequence = pgSequence('order_code_seq', { startWith: 1, increment: 1 })

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code')
      .notNull()
      .unique()
      .default(sql`'RYS-' || lpad(nextval('order_code_seq')::text, 4, '0')`),
    status: orderStatus('status').notNull().default('pending'),
    fulfillment: fulfillmentType('fulfillment').notNull(),
    /** La zona elegida; zone_name y delivery_fee son el snapshot (si la zona cambia, el pedido no). */
    zoneId: text('zone_id').references(() => deliveryZones.id),
    zoneName: text('zone_name'),
    deliveryFee: integer('delivery_fee').notNull(),
    subtotal: integer('subtotal').notNull(),
    total: integer('total').notNull(),
    payment: paymentMethod('payment').notNull(),
    customerName: text('customer_name').notNull(),
    /** Normalizado: 569XXXXXXXX. */
    customerPhone: text('customer_phone').notNull(),
    address: text('address'),
    notes: text('notes'),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    /** SHA-256 del body validado: el mismo Idempotency-Key con otro body es un error. */
    requestHash: text('request_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('orders_status_idx').on(table.status),
    index('orders_created_at_idx').on(table.createdAt),
    check('orders_amounts_check', sql`${table.subtotal} >= 0 AND ${table.deliveryFee} >= 0 AND ${table.total} >= 0`),
    check(
      'orders_delivery_check',
      sql`(${table.fulfillment} = 'pickup') OR (${table.zoneName} IS NOT NULL AND ${table.address} IS NOT NULL)`,
    ),
  ],
)

/** Ingrediente de Arma tu pizza tal como se pidió. */
export interface OrderLineIngredient {
  id: string
  name: string
  price: number
  included: boolean
}

export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** En el orden en que vinieron en el pedido. */
    position: integer('position').notNull(),
    /** Sin FK: la línea vale por su snapshot aunque el producto cambie. */
    productId: text('product_id').notNull(),
    productName: text('product_name').notNull(),
    variantLabel: text('variant_label'),
    ingredients: jsonb('ingredients').$type<OrderLineIngredient[]>(),
    unitPrice: integer('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotal: integer('line_total').notNull(),
  },
  (table) => [
    index('order_lines_order_id_idx').on(table.orderId),
    check('order_lines_quantity_check', sql`${table.quantity} BETWEEN 1 AND 50`),
    check('order_lines_total_check', sql`${table.lineTotal} = ${table.unitPrice} * ${table.quantity}`),
  ],
)

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    /** Usuario del panel que hizo el cambio; null cuando lo crea el cliente (o si el usuario se borró). */
    changedBy: uuid('changed_by').references(() => adminUsers.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('order_status_history_order_id_idx').on(table.orderId)],
)
