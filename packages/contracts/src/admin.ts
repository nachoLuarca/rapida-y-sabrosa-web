import { ORDER_STATUSES } from '@rys/domain'
import { z } from 'zod'
import { orderLineResponseSchema, PAYMENT_METHODS, FULFILLMENT_TYPES } from './orders.ts'

// Panel del local (docs/BACKEND-SPEC.md → Panel). Todas las rutas /api/admin/* requieren sesión.

export const USER_ROLES = ['admin', 'staff'] as const

export const SESSION_COOKIE = 'rys_session'

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(USER_ROLES),
})

/** POST /api/admin/session. Los errores son siempre genéricos: no dicen si el email existe. */
export const loginRequestSchema = z.object({
  email: z
    .string({ error: 'Ingresa tu email.' })
    .trim()
    .toLowerCase()
    .min(3, { error: 'Ingresa tu email.' })
    .max(200),
  password: z.string({ error: 'Ingresa tu contraseña.' }).min(1, { error: 'Ingresa tu contraseña.' }).max(200),
})

/** Respuesta del login y de GET /api/admin/me. */
export const meResponseSchema = z.object({ user: sessionUserSchema })

const orderStatusSchema = z.enum(ORDER_STATUSES)
const isoDateTime = z.iso.datetime({ offset: true })

/** Un pedido en el tablero: sin dirección ni teléfono. */
export const adminOrderSummarySchema = z.object({
  code: z.string(),
  status: orderStatusSchema,
  fulfillment: z.enum(FULFILLMENT_TYPES),
  zoneName: z.string().nullable(),
  customerName: z.string(),
  total: z.number().int().min(0),
  /** Unidades en total (2 Supremas + 1 jugo = 3). */
  itemCount: z.number().int().min(0),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export const MAX_ORDERS_PAGE_SIZE = 100

/**
 * GET /api/admin/orders: `status` acepta varios separados por coma; `from` (incluido) y `to` (excluido) son
 * instantes ISO; `q` busca en el código o en el nombre del cliente.
 */
export const ordersListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined
      const statuses = value.split(',').map((status) => status.trim())
      const parsed = z.array(orderStatusSchema).safeParse(statuses)
      if (parsed.success) return parsed.data
      ctx.addIssue({ code: 'custom', message: `Estados válidos: ${ORDER_STATUSES.join(', ')}.` })
      return z.NEVER
    }),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_ORDERS_PAGE_SIZE).default(50),
})

export const ordersListResponseSchema = z.object({
  orders: z.array(adminOrderSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
})

export const statusHistoryEntrySchema = z.object({
  fromStatus: orderStatusSchema.nullable(),
  toStatus: orderStatusSchema,
  /** null cuando lo hizo el cliente (el pedido nuevo). */
  changedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  reason: z.string().nullable(),
  createdAt: isoDateTime,
})

export const adminOrderDetailSchema = adminOrderSummarySchema.extend({
  payment: z.enum(PAYMENT_METHODS),
  /** Normalizado: 569XXXXXXXX. */
  customerPhone: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  subtotal: z.number().int().min(0),
  deliveryFee: z.number().int().min(0),
  lines: z.array(orderLineResponseSchema),
  history: z.array(statusHistoryEntrySchema),
  /** A qué estados puede pasar ahora, según la tabla de transiciones del dominio. */
  nextStatuses: z.array(orderStatusSchema),
})

/** PATCH /api/admin/orders/:code/status. Cancelar exige `reason`. */
export const statusChangeRequestSchema = z.object({
  status: z.enum(ORDER_STATUSES, { error: 'Elige un estado.' }),
  reason: z.string().trim().max(200, { error: 'El motivo puede tener hasta 200 caracteres.' }).optional(),
})

export const ORDER_STREAM_EVENTS = ['order.created', 'order.updated'] as const

/** `data` de cada evento del SSE (/api/admin/orders/stream): un resumen para recargar el tablero. */
export const orderStreamEventSchema = z.object({
  code: z.string(),
  status: orderStatusSchema,
  fulfillment: z.enum(FULFILLMENT_TYPES),
  total: z.number().int().min(0),
  createdAt: isoDateTime,
})

export type UserRole = (typeof USER_ROLES)[number]
export type SessionUser = z.infer<typeof sessionUserSchema>
export type LoginRequest = z.input<typeof loginRequestSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>
export type OrdersListQuery = z.input<typeof ordersListQuerySchema>
export type ParsedOrdersListQuery = z.output<typeof ordersListQuerySchema>
export type OrdersListResponse = z.infer<typeof ordersListResponseSchema>
export type StatusHistoryEntry = z.infer<typeof statusHistoryEntrySchema>
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>
export type StatusChangeRequest = z.input<typeof statusChangeRequestSchema>
export type OrderStreamEventName = (typeof ORDER_STREAM_EVENTS)[number]
export type OrderStreamEvent = z.infer<typeof orderStreamEventSchema>
