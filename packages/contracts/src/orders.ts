import {
  ADDRESS_MIN_LENGTH,
  CHECKOUT_MESSAGES,
  COMMENT_MAX_LENGTH,
  CUSTOMER_NAME_MIN_LENGTH,
  MAX_LINE_QUANTITY,
  ORDER_STATUSES,
  normalizeChileanMobile,
} from '@rys/domain'
import { z } from 'zod'
import { SLUG_PATTERN, priceSchema, slugSchema } from './common.ts'

// POST /api/orders (docs/BACKEND-SPEC.md → API). El cliente envía qué quiere, nunca cuánto cuesta: el único
// monto es `expectedTotal`, el total que vio, para detectar un cambio de precio.

export const MAX_ORDER_LINES = 30
export const MAX_INGREDIENTS_PER_LINE = 30

export const PAYMENT_METHODS = ['cash', 'transfer', 'card'] as const
export const FULFILLMENT_TYPES = ['delivery', 'pickup'] as const

/** Header obligatorio: un uuid nuevo por cada intento de checkout. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'
export const idempotencyKeySchema = z.uuid({ error: 'El header Idempotency-Key debe ser un uuid.' })

export const orderLineRequestSchema = z.object({
  productId: slugSchema,
  variantId: slugSchema.optional(),
  /** Solo en Arma tu pizza, en el orden en que se eligieron. */
  ingredientIds: z.array(slugSchema).max(MAX_INGREDIENTS_PER_LINE).optional(),
  quantity: z
    .number()
    .int()
    .min(1, { error: 'La cantidad mínima es 1.' })
    .max(MAX_LINE_QUANTITY, { error: `La cantidad máxima es ${MAX_LINE_QUANTITY}.` }),
})

const customerSchema = z.object({
  name: z
    .string({ error: CHECKOUT_MESSAGES.customerName })
    .trim()
    .min(CUSTOMER_NAME_MIN_LENGTH, { error: CHECKOUT_MESSAGES.customerName })
    .max(80, { error: 'El nombre puede tener hasta 80 caracteres.' }),
  /** Se normaliza a 569XXXXXXXX con el mismo normalizador del dominio. */
  phone: z.string({ error: CHECKOUT_MESSAGES.phoneMissing }).transform((value, ctx) => {
    const phone = normalizeChileanMobile(value)
    if (phone) return phone
    ctx.addIssue({
      code: 'custom',
      message: value.trim() === '' ? CHECKOUT_MESSAGES.phoneMissing : CHECKOUT_MESSAGES.phoneInvalid,
    })
    return z.NEVER
  }),
})

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .optional()
    // Un texto vacío es lo mismo que no enviarlo.
    .transform((value) => (value === '' ? undefined : value))

const orderBaseSchema = z.object({
  lines: z
    .array(orderLineRequestSchema, { error: 'El pedido no tiene productos.' })
    .min(1, { error: 'El pedido no tiene productos.' })
    .max(MAX_ORDER_LINES, { error: `El pedido puede tener hasta ${MAX_ORDER_LINES} productos distintos.` }),
  customer: customerSchema,
  payment: z.enum(PAYMENT_METHODS, { error: CHECKOUT_MESSAGES.payment }),
  notes: optionalText(COMMENT_MAX_LENGTH, CHECKOUT_MESSAGES.comment),
  expectedTotal: z.number().int().min(0),
  /** Campo trampa: la web lo deja vacío y oculto. Si trae algo, la API responde 400 sin crear nada. */
  website: z.string().max(500).optional(),
})

const deliveryOrderSchema = orderBaseSchema.extend({
  fulfillment: z.literal('delivery'),
  zoneId: z.string({ error: CHECKOUT_MESSAGES.zoneId }).regex(SLUG_PATTERN, { error: CHECKOUT_MESSAGES.zoneId }),
  address: z
    .string({ error: CHECKOUT_MESSAGES.address })
    .trim()
    .min(ADDRESS_MIN_LENGTH, { error: CHECKOUT_MESSAGES.address })
    .max(200, { error: 'La dirección puede tener hasta 200 caracteres.' }),
})

const pickupOrderSchema = orderBaseSchema.extend({
  fulfillment: z.literal('pickup'),
  // En retiro no se usan: se aceptan y se descartan, para que cambiar de despacho a retiro no falle.
  zoneId: z.unknown().optional().transform(() => undefined),
  address: z.unknown().optional().transform(() => undefined),
})

/** Body de POST /api/orders. Con despacho, `zoneId` y `address` son obligatorios. */
export const orderRequestSchema = z.discriminatedUnion(
  'fulfillment',
  [deliveryOrderSchema, pickupOrderSchema],
  { error: 'Elige despacho o retiro en el local.' },
)

export const orderLineResponseSchema = z.object({
  productId: slugSchema,
  name: z.string(),
  variantLabel: z.string().nullable(),
  /** Snapshot de Arma tu pizza: qué ingredientes llevó y cuáles cubrió la promoción. */
  ingredients: z
    .array(z.object({ id: slugSchema, name: z.string(), price: priceSchema, included: z.boolean() }))
    .nullable(),
  unitPrice: z.number().int().min(0),
  quantity: z.number().int().min(1),
  lineTotal: z.number().int().min(0),
})

export const ORDER_CODE_PATTERN = /^RYS-\d{4,}$/

export const orderResponseSchema = z.object({
  /** RYS-0042 */
  code: z.string().regex(ORDER_CODE_PATTERN),
  status: z.enum(ORDER_STATUSES),
  lines: z.array(orderLineResponseSchema),
  subtotal: z.number().int().min(0),
  deliveryFee: z.number().int().min(0),
  total: z.number().int().min(0),
  /** Mensaje de WhatsApp con el código: "*Nuevo pedido RYS-0042 — Rápida y Sabrosa*…" */
  message: z.string(),
  /** `null` en modo demo: nada se envía al WhatsApp del local. */
  whatsappUrl: z.url().nullable(),
  demo: z.boolean(),
})

export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]
export type FulfillmentTypeCode = (typeof FULFILLMENT_TYPES)[number]
export type OrderLineRequest = z.input<typeof orderLineRequestSchema>
/** Lo que envía el cliente. */
export type OrderRequest = z.input<typeof orderRequestSchema>
/** Lo que queda después de validar: textos recortados y celular normalizado. */
export type ParsedOrderRequest = z.output<typeof orderRequestSchema>
export type OrderLineResponse = z.infer<typeof orderLineResponseSchema>
export type OrderResponse = z.infer<typeof orderResponseSchema>
