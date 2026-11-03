import type { OpeningHoursDto } from '@rys/contracts'
import { sql } from 'drizzle-orm'
import { boolean, check, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/** Ajustes del local: una sola fila, con id = 1. */
export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    businessName: text('business_name').notNull(),
    /** Solo dígitos con código país: 56 + 9 dígitos. */
    whatsappNumber: text('whatsapp_number').notNull(),
    /** Pendiente de confirmar con el local: null y la web la omite. */
    pickupAddress: text('pickup_address'),
    /** null = sin horario definido: no hay restricción y la web no muestra horario. */
    openingHours: jsonb('opening_hours').$type<OpeningHoursDto>(),
    timezone: text('timezone').notNull().default('America/Santiago'),
    ordersPaused: boolean('orders_paused').notNull().default(false),
    buildPizzaBasePrice: integer('build_pizza_base_price').notNull(),
    buildPizzaPromoPrice: integer('build_pizza_promo_price').notNull(),
    buildPizzaPromoIncluded: integer('build_pizza_promo_included').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('settings_single_row', sql`${table.id} = 1`),
    check('settings_whatsapp_number_check', sql`${table.whatsappNumber} ~ '^56[0-9]{9}$'`),
    check(
      'settings_build_pizza_prices_check',
      sql`${table.buildPizzaBasePrice} BETWEEN 0 AND 1000000 AND ${table.buildPizzaPromoPrice} BETWEEN 0 AND 1000000`,
    ),
    check('settings_build_pizza_promo_included_check', sql`${table.buildPizzaPromoIncluded} BETWEEN 0 AND 30`),
  ],
)
