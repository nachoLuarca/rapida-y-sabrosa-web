import {
  adminOrderDetailSchema,
  ordersListQuerySchema,
  ordersListResponseSchema,
  statusChangeRequestSchema,
  validationDetails,
  type OrderStreamEvent,
  type OrderStreamEventName,
} from '@rys/contracts'
import type { RequestHandler } from 'express'
import { AppError } from '../errors/app-error.ts'
import type { EventBus, OrderEventPayload } from '../events/event-bus.ts'
import { sessionUser } from '../middlewares/auth.ts'
import type { AdminOrderService } from '../services/admin-order-service.ts'

export interface AdminOrderController {
  list: RequestHandler
  detail: RequestHandler
  changeStatus: RequestHandler
  stream: RequestHandler
}

export const HEARTBEAT_MS = 25_000

const toStreamEvent = ({ code, status, fulfillment, total, createdAt }: OrderEventPayload): OrderStreamEvent => ({
  code,
  status,
  fulfillment,
  total,
  createdAt,
})

/** /api/admin/orders: listado, detalle, cambio de estado y SSE con los pedidos en vivo. */
export function createAdminOrderController(
  orders: AdminOrderService,
  bus: EventBus,
  heartbeatMs: number = HEARTBEAT_MS,
): AdminOrderController {
  return {
    async list(req, res) {
      const query = ordersListQuerySchema.safeParse(req.query)
      if (!query.success) throw new AppError('VALIDATION_ERROR', 'Revisa los filtros.', validationDetails(query.error))
      res.set('Cache-Control', 'no-store').json(ordersListResponseSchema.parse(await orders.list(query.data)))
    },

    async detail(req, res) {
      const code = String(req.params.code)
      res.set('Cache-Control', 'no-store').json(adminOrderDetailSchema.parse(await orders.detail(code)))
    },

    async changeStatus(req, res) {
      const body = statusChangeRequestSchema.safeParse(req.body)
      if (!body.success) throw new AppError('VALIDATION_ERROR', 'Elige un estado.', validationDetails(body.error))
      const user = sessionUser(req)
      const updated = await orders.changeStatus(String(req.params.code), body.data.status, body.data.reason, user)
      req.log.info({ orderCode: updated.code, status: updated.status, userId: user.id }, 'cambio de estado')
      res.json(adminOrderDetailSchema.parse(updated))
    },

    /**
     * Server-Sent Events (ADR-007): order.created y order.updated con un resumen del pedido, y un comentario cada
     * 25 s para que ningún proxy corte la conexión por inactividad. El navegador se reconecta solo.
     */
    stream(req, res) {
      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Que ningún proxy (nginx, por ejemplo) junte los eventos antes de mandarlos.
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders()
      // Si se corta, el navegador vuelve a intentar a los 3 segundos.
      res.write('retry: 3000\n\n')

      const send = (event: OrderStreamEventName) => (payload: OrderEventPayload) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(toStreamEvent(payload))}\n\n`)
      }
      const unsubscribe = [
        bus.subscribe('order.created', send('order.created')),
        bus.subscribe('order.updated', send('order.updated')),
      ]
      const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs)

      req.on('close', () => {
        clearInterval(heartbeat)
        for (const off of unsubscribe) off()
      })
    },
  }
}
