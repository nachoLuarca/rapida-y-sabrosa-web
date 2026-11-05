import type {
  AdminOrderDetail,
  AdminOrderSummary,
  OrdersListResponse,
  ParsedOrdersListQuery,
  SessionUser,
} from '@rys/contracts'
import { nextStatuses, validateTransition, type OrderStatus } from '@rys/domain'
import { AppError } from '../errors/app-error.ts'
import type { EventBus, OrderEventPayload } from '../events/event-bus.ts'
import type { OrderRepository, OrderRow } from '../repositories/order-repository.ts'
import type { Clock } from './catalog-service.ts'

function toSummary(order: OrderRow, itemCount: number): AdminOrderSummary {
  return {
    code: order.code,
    status: order.status,
    fulfillment: order.fulfillment,
    zoneName: order.zoneName,
    customerName: order.customerName,
    total: order.total,
    itemCount,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

function toEvent(order: OrderRow): OrderEventPayload {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    fulfillment: order.fulfillment,
    total: order.total,
    createdAt: order.createdAt.toISOString(),
  }
}

/** Pedidos para el panel: listado, detalle y cambios de estado con la tabla de transiciones del dominio. */
export class AdminOrderService {
  private readonly orders: OrderRepository
  private readonly bus: EventBus
  private readonly now: Clock

  constructor(orders: OrderRepository, bus: EventBus, now: Clock) {
    this.orders = orders
    this.bus = bus
    this.now = now
  }

  async list(query: ParsedOrdersListQuery): Promise<OrdersListResponse> {
    const { rows, total } = await this.orders.list({
      statuses: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      q: query.q || undefined,
      page: query.page,
      pageSize: query.pageSize,
    })
    return {
      orders: rows.map(({ order, itemCount }) => toSummary(order, itemCount)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    }
  }

  async detail(code: string): Promise<AdminOrderDetail> {
    const found = await this.orders.findByCode(code)
    if (!found) throw new AppError('NOT_FOUND', `No existe el pedido ${code}.`)
    const { order, lines, history } = found
    return {
      ...toSummary(order, lines.reduce((total, line) => total + line.quantity, 0)),
      payment: order.payment,
      customerPhone: order.customerPhone,
      address: order.address,
      notes: order.notes,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      lines: lines.map((line) => ({
        productId: line.productId,
        name: line.productName,
        variantLabel: line.variantLabel,
        ingredients: line.ingredients,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
      })),
      history: history.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
      nextStatuses: nextStatuses(order.status, order.fulfillment),
    }
  }

  /**
   * Cambia el estado si la tabla de transiciones lo permite (cancelar exige motivo), lo deja en el historial con el
   * usuario y avisa al panel (order.updated). Si otro usuario lo cambió justo antes, responde INVALID_TRANSITION.
   */
  async changeStatus(code: string, to: OrderStatus, reason: string | undefined, user: SessionUser): Promise<AdminOrderDetail> {
    const found = await this.orders.findByCode(code)
    if (!found) throw new AppError('NOT_FOUND', `No existe el pedido ${code}.`)
    const { order } = found

    const check = validateTransition(order.status, to, order.fulfillment, reason)
    if (!check.ok) {
      if (check.error === 'REASON_REQUIRED') {
        throw new AppError('VALIDATION_ERROR', check.message, { reason: check.message })
      }
      throw new AppError('INVALID_TRANSITION', check.message, { from: order.status, to })
    }

    const changed = await this.orders.transition({
      orderId: order.id,
      from: order.status,
      to,
      changedBy: user.id,
      reason: check.reason,
      now: this.now(),
    })
    if (!changed) {
      throw new AppError('INVALID_TRANSITION', 'Otra persona cambió este pedido recién. Revisa su estado actual.', {
        to,
      })
    }

    const updated = await this.detail(code)
    this.bus.publish('order.updated', { ...toEvent(order), status: updated.status })
    return updated
  }
}
