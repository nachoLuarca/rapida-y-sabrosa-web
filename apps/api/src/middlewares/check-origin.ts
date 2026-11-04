import type { RequestHandler } from 'express'
import { AppError } from '../errors/app-error.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Protección CSRF de las mutaciones del panel (ADR-004): el header Origin tiene que estar en ALLOWED_ORIGINS. Los
 * navegadores lo mandan siempre en POST, PATCH y DELETE, así que si falta también se rechaza. Junto con la cookie
 * SameSite=Lax alcanza para este caso.
 */
export function checkOrigin(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins)
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }
    const origin = req.get('Origin')
    if (!origin || !allowed.has(origin)) {
      next(new AppError('INVALID_ORIGIN', 'Esta acción solo se puede hacer desde el panel del local.'))
      return
    }
    next()
  }
}
