import { z } from 'zod'

// Formato único de error de la API (docs/BACKEND-SPEC.md → API).

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  INVALID_ORIGIN: 403,
  NOT_FOUND: 404,
  STORE_CLOSED: 409,
  ORDERS_PAUSED: 409,
  PRODUCT_UNAVAILABLE: 409,
  PRICE_CHANGED: 409,
  INVALID_TRANSITION: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]]

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    /** Texto en español para mostrar. */
    message: z.string().min(1),
    /** En VALIDATION_ERROR: un mensaje por campo ("customer.phone": "Ingresa un celular chileno…"). */
    details: z.record(z.string(), z.unknown()),
    requestId: z.string().min(1),
  }),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

/** Detalles de VALIDATION_ERROR: el primer mensaje de cada campo, con la ruta unida por puntos. */
export function validationDetails(error: z.ZodError): Record<string, string> {
  const details: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.') || '_'
    details[field] ??= issue.message
  }
  return details
}
