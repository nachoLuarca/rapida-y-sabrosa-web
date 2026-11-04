import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { orderLines, orders, orderStatusHistory } from '../db/schema/index.ts'

export type OrderRow = typeof orders.$inferSelect
export type NewOrderRow = Omit<typeof orders.$inferInsert, 'id' | 'code' | 'status' | 'createdAt' | 'updatedAt'>
export type OrderLineRow = typeof orderLines.$inferSelect
export type NewOrderLineRow = Omit<typeof orderLines.$inferInsert, 'id' | 'orderId'>

export interface StoredOrder {
  order: OrderRow
  lines: OrderLineRow[]
}

/** Único lugar que lee y escribe pedidos. */
export class OrderRepository {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredOrder | null> {
    const [order] = await this.db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey)).limit(1)
    if (!order) return null
    return { order, lines: await this.linesOf(order.id) }
  }

  /**
   * Crea el pedido, sus líneas y el primer registro del historial en una sola transacción. Si otro request con
   * el mismo Idempotency-Key ganó la carrera, lanza un error que `isIdempotencyConflict` reconoce.
   */
  async create(order: NewOrderRow, lines: NewOrderLineRow[]): Promise<StoredOrder> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(orders).values(order).returning()
      if (!created) throw new Error('El pedido no se insertó.')
      const createdLines = await tx
        .insert(orderLines)
        .values(lines.map((line) => ({ ...line, orderId: created.id })))
        .returning()
      await tx.insert(orderStatusHistory).values({ orderId: created.id, fromStatus: null, toStatus: created.status })
      return { order: created, lines: createdLines.sort((a, b) => a.position - b.position) }
    })
  }

  private async linesOf(orderId: string): Promise<OrderLineRow[]> {
    return this.db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.position))
  }
}

/** ¿El error es la clave única de idempotency_key? (Dos requests simultáneos con la misma clave.) */
export function isIdempotencyConflict(error: unknown): boolean {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    const pgError = current as { code?: string; constraint?: string }
    if (pgError.code === '23505' && pgError.constraint === 'orders_idempotency_key_unique') return true
  }
  return false
}
