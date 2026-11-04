import {
  errorResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  orderResponseSchema,
  priceChangedDetailsSchema,
  productUnavailableDetailsSchema,
  storeBlockedDetailsSchema,
  type OrderQuoteDto,
  type OrderRequest,
} from '@rys/contracts'
import {
  buildOrderMessage,
  orderTotals,
  PAYMENT_METHOD_CODES,
  whatsappUrl,
  type CartLine,
  type CheckoutErrors,
  type OrderDetails,
  type UnavailableItems,
} from '@rys/domain'
import { business } from '../config/business'
import { attemptFor, type CheckoutAttempt } from '../domain/checkout-attempt'
import { checkoutErrorsFromServer } from '../domain/server-errors'
import { loadAttempt, saveAttempt } from '../store/checkout-attempt-storage'

export interface OrderSubmission {
  lines: CartLine[]
  /** Los datos del checkout ya validados en el navegador. */
  order: OrderDetails
  /** Campo trampa: vacío salvo que lo llene un bot. */
  honeypot: string
}

export interface CreatedOrder {
  /** Código en el sistema (RYS-0042); null en la carta estática. */
  code: string | null
  message: string
  /** null en modo demo. */
  whatsappUrl: string | null
  demo: boolean
}

export type SubmitOutcome =
  | { kind: 'created'; order: CreatedOrder }
  | { kind: 'validation'; errors: CheckoutErrors; message: string }
  | { kind: 'price-changed'; quote: OrderQuoteDto; message: string }
  | { kind: 'unavailable'; items: UnavailableItems; message: string }
  | { kind: 'blocked'; reason: 'ORDERS_PAUSED' | 'STORE_CLOSED'; nextOpening: Date | null; message: string }
  | { kind: 'failed'; message: string }

/** A dónde va el pedido (docs/BACKEND-SPEC.md → Cambios en la web). */
export interface OrderGateway {
  /**
   * 'static': el pedido se arma en el navegador y se abre WhatsApp en el mismo clic. 'api': se crea en la API y
   * el cliente abre WhatsApp desde la confirmación.
   */
  readonly kind: 'static' | 'api'
  submit(submission: OrderSubmission): Promise<SubmitOutcome>
}

/** La v1: el mensaje se arma aquí y va directo al WhatsApp del local (o a la pantalla, en modo demo). */
export function createStaticOrderGateway(): OrderGateway {
  return {
    kind: 'static',
    async submit({ lines, order }) {
      const message = buildOrderMessage(business.name, lines, order)
      return {
        kind: 'created',
        order: {
          code: null,
          message,
          whatsappUrl: business.isDemo ? null : whatsappUrl(business.whatsappNumber, message),
          demo: business.isDemo,
        },
      }
    },
  }
}

/** Body de POST /api/orders: qué se pide y el total que se vio, nunca precios por línea. */
export function toOrderRequest({ lines, order, honeypot }: OrderSubmission): OrderRequest {
  const base = {
    lines: lines.map(({ productId, variantId, ingredientIds, quantity }) => ({
      productId,
      ...(variantId ? { variantId } : {}),
      ...(ingredientIds ? { ingredientIds } : {}),
      quantity,
    })),
    customer: { name: order.customerName, phone: order.phone },
    payment: PAYMENT_METHOD_CODES[order.payment],
    ...(order.comment ? { notes: order.comment } : {}),
    expectedTotal: orderTotals(lines, order.fulfillment).total,
    website: honeypot,
  }
  return order.fulfillment.type === 'delivery'
    ? { ...base, fulfillment: 'delivery', zoneId: order.fulfillment.zone.id, address: order.fulfillment.address }
    : { ...base, fulfillment: 'pickup' }
}

const NETWORK_ERROR = 'No pudimos enviar tu pedido. Revisa tu conexión e inténtalo de nuevo: no se va a duplicar.'
const SERVER_ERROR = 'No pudimos enviar tu pedido. Inténtalo de nuevo en unos minutos.'

/**
 * POST /api/orders con un Idempotency-Key por intento: se reusa mientras el body sea el mismo (un reintento por la
 * red no duplica el pedido) y se borra cuando el pedido se crea.
 */
export function createApiOrderGateway(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): OrderGateway {
  // Por si sessionStorage no está disponible: el intento vale mientras la página siga abierta.
  let memory: CheckoutAttempt | null = null
  const remember = (attempt: CheckoutAttempt | null) => {
    memory = attempt
    saveAttempt(attempt)
  }

  return {
    kind: 'api',
    async submit(submission) {
      const body = toOrderRequest(submission)
      const attempt = attemptFor(body, loadAttempt() ?? memory)
      remember(attempt)

      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', [IDEMPOTENCY_KEY_HEADER]: attempt.key },
          body: JSON.stringify(body),
        })
      } catch {
        return { kind: 'failed', message: NETWORK_ERROR }
      }

      let json: unknown
      try {
        json = await response.json()
      } catch {
        return { kind: 'failed', message: SERVER_ERROR }
      }

      if (response.ok) {
        const created = orderResponseSchema.safeParse(json)
        if (!created.success) return { kind: 'failed', message: SERVER_ERROR }
        remember(null)
        const { code, message, whatsappUrl: url, demo } = created.data
        return { kind: 'created', order: { code, message, whatsappUrl: url, demo } }
      }

      const parsed = errorResponseSchema.safeParse(json)
      if (!parsed.success) return { kind: 'failed', message: SERVER_ERROR }
      const { code, message, details } = parsed.data.error

      switch (code) {
        case 'VALIDATION_ERROR': {
          const { errors, unmapped } = checkoutErrorsFromServer(details)
          return {
            kind: 'validation',
            errors,
            message: unmapped || Object.keys(errors).length === 0 ? message : 'Revisa los datos marcados.',
          }
        }
        case 'PRICE_CHANGED': {
          const quote = priceChangedDetailsSchema.safeParse(details)
          return quote.success ? { kind: 'price-changed', quote: quote.data.quote, message } : { kind: 'failed', message }
        }
        case 'PRODUCT_UNAVAILABLE': {
          const items = productUnavailableDetailsSchema.safeParse(details)
          return items.success ? { kind: 'unavailable', items: items.data, message } : { kind: 'failed', message }
        }
        case 'ORDERS_PAUSED':
        case 'STORE_CLOSED': {
          const blocked = storeBlockedDetailsSchema.safeParse(details)
          const next = blocked.success ? blocked.data.nextOpening : null
          return { kind: 'blocked', reason: code, nextOpening: next ? new Date(next) : null, message }
        }
        case 'IDEMPOTENCY_KEY_REUSED':
          // No debería pasar (la clave cambia con el body), pero si pasa, el próximo intento lleva otra.
          remember(null)
          return { kind: 'failed', message }
        default:
          return { kind: 'failed', message }
      }
    },
  }
}
