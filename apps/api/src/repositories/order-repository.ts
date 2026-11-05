import type { OrderStatus } from '@rys/domain'
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, sum, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { adminUsers, orderLines, orders, orderStatusHistory } from '../db/schema/index.ts'

export type OrderRow = typeof orders.$inferSelect
export type NewOrderRow = Omit<typeof orders.$inferInsert, 'id' | 'code' | 'status' | 'createdAt' | 'updatedAt'>
export type OrderLineRow = typeof orderLines.$inferSelect
export type NewOrderLineRow = Omit<typeof orderLines.$inferInsert, 'id' | 'orderId'>

export interface StoredOrder {
  order: OrderRow
  lines: OrderLineRow[]
}

export interface OrderListFilters {
  statuses?: OrderStatus[]
  from?: Date
  to?: Date
  /** Código o nombre del cliente. */
  q?: string
  page: number
  pageSize: number
}

export interface OrderSummaryRow {
  order: OrderRow
  itemCount: number
}

export interface HistoryRow {
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  reason: string | null
  createdAt: Date
  changedBy: { id: string; name: string } | null
}

/** Escapa % y _ para buscar el texto tal cual con ILIKE. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

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

  /** Página de pedidos, del más nuevo al más antiguo, con la cantidad de unidades de cada uno. */
  async list(filters: OrderListFilters): Promise<{ rows: OrderSummaryRow[]; total: number }> {
    const conditions: SQL[] = []
    if (filters.statuses?.length) conditions.push(inArray(orders.status, filters.statuses))
    if (filters.from) conditions.push(gte(orders.createdAt, filters.from))
    if (filters.to) conditions.push(lt(orders.createdAt, filters.to))
    if (filters.q) {
      const pattern = likePattern(filters.q)
      const match = or(ilike(orders.code, pattern), ilike(orders.customerName, pattern))
      if (match) conditions.push(match)
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totals] = await this.db.select({ total: count() }).from(orders).where(where)
    const itemCount = sql<number>`coalesce(${sum(orderLines.quantity)}, 0)::int`
    const rows = await this.db
      .select({ order: orders, itemCount })
      .from(orders)
      .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
      .where(where)
      .groupBy(orders.id)
      .orderBy(desc(orders.createdAt), desc(orders.code))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize)
    return { rows, total: totals?.total ?? 0 }
  }

  async findByCode(code: string): Promise<(StoredOrder & { history: HistoryRow[] }) | null> {
    const [order] = await this.db.select().from(orders).where(eq(orders.code, code)).limit(1)
    if (!order) return null
    const history = await this.db
      .select({
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        reason: orderStatusHistory.reason,
        createdAt: orderStatusHistory.createdAt,
        userId: adminUsers.id,
        userName: adminUsers.name,
      })
      .from(orderStatusHistory)
      .leftJoin(adminUsers, eq(adminUsers.id, orderStatusHistory.changedBy))
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id))
    return {
      order,
      lines: await this.linesOf(order.id),
      history: history.map(({ userId, userName, ...entry }) => ({
        ...entry,
        changedBy: userId && userName ? { id: userId, name: userName } : null,
      })),
    }
  }

  /**
   * Cambia el estado solo si el pedido sigue en `from` (compare-and-set): si otro usuario lo cambió entremedio,
   * no hace nada y devuelve false. El cambio y su registro en el historial van en una transacción.
   */
  async transition(change: {
    orderId: string
    from: OrderStatus
    to: OrderStatus
    changedBy: string
    reason: string | null
    now: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ status: change.to, updatedAt: change.now })
        .where(and(eq(orders.id, change.orderId), eq(orders.status, change.from)))
        .returning({ id: orders.id })
      if (updated.length === 0) return false
      await tx.insert(orderStatusHistory).values({
        orderId: change.orderId,
        fromStatus: change.from,
        toStatus: change.to,
        changedBy: change.changedBy,
        reason: change.reason,
        createdAt: change.now,
      })
      return true
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
