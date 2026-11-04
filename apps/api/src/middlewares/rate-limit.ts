import type { RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { AppError } from '../errors/app-error.ts'

export interface RateLimitOptions {
  /** Requests permitidos por IP dentro de la ventana. */
  limit: number
  windowMs: number
}

/** POST /api/orders: 10 pedidos por IP cada 10 minutos (docs/BACKEND-SPEC.md). */
export const ORDER_RATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 10 * 60 * 1000 }

/**
 * Rate limit en memoria (hay una sola instancia de la API). Al pasarse responde 429 RATE_LIMITED con el formato
 * de error de la API y el header Retry-After en segundos.
 */
export function createRateLimit({ limit, windowMs }: RateLimitOptions, message: string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res, next) {
      // express-rate-limit deja el estado en req.rateLimit, pero sus tipos no lo declaran en Request.
      const resetTime = (req as typeof req & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime
      const seconds = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : windowMs / 1000
      res.setHeader('Retry-After', String(seconds))
      next(new AppError('RATE_LIMITED', message, { retryAfterSeconds: seconds }))
    },
  })
}
