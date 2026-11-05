import type { SessionUser, UserRole } from '@rys/contracts'
import type { Request, RequestHandler } from 'express'
import { AppError } from '../errors/app-error.ts'
import { readSessionToken, setSessionCookie } from '../http/session-cookie.ts'
import type { AuthService } from '../services/auth-service.ts'

/** Exige una sesión válida y deja al usuario en req.user. Si la sesión se renovó, vuelve a mandar la cookie. */
export function requireSession(auth: AuthService, secureCookies: boolean): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionToken(req)
    const session = token ? await auth.authenticate(token) : null
    if (!token || !session) {
      next(new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.'))
      return
    }
    if (session.renewedUntil) setSessionCookie(res, token, session.renewedUntil, secureCookies)
    req.user = session.user
    next()
  }
}

/** Solo para quien tenga uno de esos roles. Va después de requireSession. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.'))
      return
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('FORBIDDEN', 'Tu usuario no tiene permiso para hacer esto.'))
      return
    }
    next()
  }
}

/** El usuario de la sesión (lo dejó requireSession). */
export function sessionUser(req: Request): SessionUser {
  if (!req.user) throw new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.')
  return req.user
}
