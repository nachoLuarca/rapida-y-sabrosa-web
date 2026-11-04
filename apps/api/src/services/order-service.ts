import { createHash } from 'node:crypto'
import type { OrderResponse, ParsedOrderRequest } from '@rys/contracts'
import {
  buildOrderMessage,
  CHECKOUT_MESSAGES,
  describeNextOpening,
  orderingStatus,
  paymentMethodFromCode,
  quoteOrder,
  whatsappUrl,
  type CartLine,
  type Fulfillment,
  type OrderDetails,
} from '@rys/domain'
import { AppError } from '../errors/app-error.ts'
import type { EventBus } from '../events/event-bus.ts'
import type { CatalogRepository } from '../repositories/catalog-repository.ts'
import {
  isIdempotencyConflict,
  type OrderRepository,
  type StoredOrder,
} from '../repositories/order-repository.ts'
import type { SettingsRepository, SettingsRow } from '../repositories/settings-repository.ts'
import type { Clock } from './catalog-service.ts'
import { toDomainCatalog } from './domain-catalog.ts'
import { MissingSeedError } from './missing-seed-error.ts'

export interface CreateOrderInput {
  /** El body ya validado con orderRequestSchema: textos recortados y celular normalizado. */
  request: ParsedOrderRequest
  idempotencyKey: string
}

export interface CreateOrderResult {
  /** false si ya existía un pedido con esa clave y el mismo body (el reintento devuelve el mismo pedido). */
  created: boolean
  order: OrderResponse
}

export interface OrderServiceOptions {
  /** En modo demo los pedidos se guardan, pero la respuesta no trae enlace de WhatsApp. */
  demoMode: boolean
}

/** JSON con las claves ordenadas: el mismo body siempre da el mismo hash, venga en el orden que venga. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashOrderRequest(request: ParsedOrderRequest): string {
  return createHash('sha256').update(canonicalJson(request)).digest('hex')
}

/**
 * Crea pedidos (docs/BACKEND-SPEC.md → POST /api/orders). El servidor es la fuente de verdad del precio: el
 * cliente dice qué quiere y cuánto vio, y aquí se recalcula todo con @rys/domain.
 */
export class OrderService {
  private readonly catalog: CatalogRepository
  private readonly settings: SettingsRepository
  private readonly orders: OrderRepository
  private readonly bus: EventBus
  private readonly now: Clock
  private readonly options: OrderServiceOptions

  constructor(
    repositories: { catalog: CatalogRepository; settings: SettingsRepository; orders: OrderRepository },
    bus: EventBus,
    now: Clock,
    options: OrderServiceOptions,
  ) {
    this.catalog = repositories.catalog
    this.settings = repositories.settings
    this.orders = repositories.orders
    this.bus = bus
    this.now = now
    this.options = options
  }

  async create({ request, idempotencyKey }: CreateOrderInput): Promise<CreateOrderResult> {
    // 1. La validación del esquema ya la hizo el controlador.
    // 2. Campo trampa con contenido: un bot. Se responde genérico, sin decir por qué.
    if (request.website?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'No pudimos procesar el pedido.')
    }

    const settings = await this.settings.get()
    if (!settings) throw new MissingSeedError('Faltan los ajustes del local')

    // 3. Idempotencia: el mismo intento de checkout devuelve el mismo pedido.
    const requestHash = hashOrderRequest(request)
    const existing = await this.orders.findByIdempotencyKey(idempotencyKey)
    if (existing) return { created: false, order: this.replay(existing, requestHash, settings) }

    // 4. Pausa o local cerrado. La pausa manda sobre el horario.
    const now = this.now()
    const status = orderingStatus(
      { openingHours: settings.openingHours, ordersPaused: settings.ordersPaused, timezone: settings.timezone },
      now,
    )
    if (status.blockedBy) {
      const when = status.nextOpening ? describeNextOpening(status.nextOpening, now, settings.timezone) : null
      throw new AppError(
        status.blockedBy,
        status.blockedBy === 'ORDERS_PAUSED'
          ? 'Por ahora no estamos recibiendo pedidos. Intenta de nuevo en un rato.'
          : when
            ? `Estamos cerrados. Abrimos ${when}.`
            : 'Estamos cerrados por ahora.',
        { nextOpening: status.nextOpening?.toISOString() ?? null },
      )
    }

    // 5 y 6. Disponibilidad de cada línea y cotización con la carta y los precios de hoy.
    const { catalog, zones } = toDomainCatalog(await this.catalog.getSnapshot(), settings)
    let fulfillment: Fulfillment = { type: 'pickup' }
    if (request.fulfillment === 'delivery') {
      const zone = zones.find((item) => item.id === request.zoneId)
      // Una zona desactivada mientras el cliente pedía es lo mismo que una zona mal elegida.
      if (!zone) throw new AppError('VALIDATION_ERROR', 'Revisa los datos del pedido.', { zoneId: CHECKOUT_MESSAGES.zoneId })
      fulfillment = { type: 'delivery', zone, address: request.address }
    }

    const quote = quoteOrder(catalog, request.lines, fulfillment)
    if (!quote.ok) {
      throw new AppError(
        'PRODUCT_UNAVAILABLE',
        'Algunos productos de tu pedido ya no están disponibles. Quítalos para continuar.',
        { ...quote.unavailable },
      )
    }

    // 7. Lo que vio el cliente debe ser lo que cuesta hoy.
    if (quote.total !== request.expectedTotal) {
      throw new AppError('PRICE_CHANGED', 'Cambiaron algunos precios. Revisa el total y confirma de nuevo.', {
        quote: {
          lines: quote.lines.map(toLineResponse),
          subtotal: quote.subtotal,
          deliveryFee: quote.deliveryFee,
          total: quote.total,
        },
      })
    }

    // 8. Pedido, líneas e historial en una transacción.
    let stored: StoredOrder
    try {
      stored = await this.orders.create(
        {
          fulfillment: request.fulfillment,
          zoneId: fulfillment.type === 'delivery' ? fulfillment.zone.id : null,
          zoneName: fulfillment.type === 'delivery' ? fulfillment.zone.name : null,
          deliveryFee: quote.deliveryFee,
          subtotal: quote.subtotal,
          total: quote.total,
          payment: request.payment,
          customerName: request.customer.name,
          customerPhone: request.customer.phone,
          address: fulfillment.type === 'delivery' ? fulfillment.address : null,
          notes: request.notes ?? null,
          idempotencyKey,
          requestHash,
        },
        quote.lines.map((line, position) => ({
          position,
          productId: line.productId,
          productName: line.name,
          variantLabel: line.variantLabel ?? null,
          ingredients: line.ingredients,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
      )
    } catch (error) {
      // Dos requests simultáneos con la misma clave: el otro ya lo creó. Se responde como un reintento.
      if (!isIdempotencyConflict(error)) throw error
      const winner = await this.orders.findByIdempotencyKey(idempotencyKey)
      if (!winner) throw error
      return { created: false, order: this.replay(winner, requestHash, settings) }
    }

    // 9. Aviso al panel (SSE, Fase 8).
    this.bus.publish('order.created', {
      id: stored.order.id,
      code: stored.order.code,
      status: stored.order.status,
      fulfillment: stored.order.fulfillment,
      total: stored.order.total,
      createdAt: stored.order.createdAt.toISOString(),
    })

    return { created: true, order: this.toResponse(stored, settings) }
  }

  private replay(existing: StoredOrder, requestHash: string, settings: SettingsRow): OrderResponse {
    if (existing.order.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        'Este intento de pedido ya se usó con otros datos. Vuelve a enviar el pedido.',
      )
    }
    return this.toResponse(existing, settings)
  }

  /** La respuesta sale de lo guardado (snapshots), así un reintento recibe exactamente el mismo pedido. */
  private toResponse({ order, lines }: StoredOrder, settings: SettingsRow): OrderResponse {
    const cartLines: CartLine[] = lines.map((line) => ({
      key: line.id,
      productId: line.productId,
      name: line.productName,
      ...(line.variantLabel ? { variantLabel: line.variantLabel } : {}),
      ...(line.ingredients ? { ingredientNames: line.ingredients.map((ingredient) => ingredient.name) } : {}),
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    }))
    const details: OrderDetails = {
      customerName: order.customerName,
      phone: order.customerPhone,
      fulfillment:
        order.fulfillment === 'delivery'
          ? {
              type: 'delivery',
              zone: { id: order.zoneId ?? '', name: order.zoneName ?? '', fee: order.deliveryFee },
              address: order.address ?? '',
            }
          : { type: 'pickup' },
      payment: paymentMethodFromCode(order.payment),
      ...(order.notes ? { comment: order.notes } : {}),
    }
    const message = buildOrderMessage(settings.businessName, cartLines, details, order.code)
    const demo = this.options.demoMode

    return {
      code: order.code,
      status: order.status,
      lines: lines.map((line) => ({
        productId: line.productId,
        name: line.productName,
        variantLabel: line.variantLabel,
        ingredients: line.ingredients,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
      })),
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      message,
      whatsappUrl: demo ? null : whatsappUrl(settings.whatsappNumber, message),
      demo,
    }
  }
}

function toLineResponse(line: {
  productId: string
  name: string
  variantLabel?: string
  ingredients: { id: string; name: string; price: number; included: boolean }[] | null
  unitPrice: number
  quantity: number
  lineTotal: number
}) {
  return {
    productId: line.productId,
    name: line.name,
    variantLabel: line.variantLabel ?? null,
    ingredients: line.ingredients,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    lineTotal: line.lineTotal,
  }
}

