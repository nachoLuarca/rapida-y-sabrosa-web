import {
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  orderRequestSchema,
  orderResponseSchema,
  validationDetails,
} from '@rys/contracts'
import type { RequestHandler } from 'express'
import { AppError } from '../errors/app-error.ts'
import type { OrderService } from '../services/order-service.ts'

export interface OrderController {
  createOrder: RequestHandler
}

/**
 * POST /api/orders. Valida el header Idempotency-Key y el body con @rys/contracts (todos los errores de una
 * vez, por campo), llama al servicio y responde 201 (creado) o 200 (reintento del mismo pedido).
 */
export function createOrderController(orders: OrderService): OrderController {
  return {
    async createOrder(req, res) {
      const key = idempotencyKeySchema.safeParse(req.get(IDEMPOTENCY_KEY_HEADER))
      const body = orderRequestSchema.safeParse(req.body)
      if (!key.success || !body.success) {
        throw new AppError('VALIDATION_ERROR', 'Revisa los datos del pedido.', {
          ...(key.success ? {} : { [IDEMPOTENCY_KEY_HEADER]: 'Falta el header Idempotency-Key (un uuid por intento).' }),
          ...(body.success ? {} : validationDetails(body.error)),
        })
      }

      const result = await orders.create({ request: body.data, idempotencyKey: key.data })
      // Solo el código: nunca datos del cliente en el log.
      req.log.info({ orderCode: result.order.code, created: result.created }, 'pedido')
      res.status(result.created ? 201 : 200).json(orderResponseSchema.parse(result.order))
    },
  }
}
