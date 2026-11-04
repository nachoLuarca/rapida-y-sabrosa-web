import { loginRequestSchema, meResponseSchema, validationDetails } from '@rys/contracts'
import type { RequestHandler } from 'express'
import { AppError } from '../errors/app-error.ts'
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../http/session-cookie.ts'
import { sessionUser } from '../middlewares/auth.ts'
import type { AuthService } from '../services/auth-service.ts'

export interface AuthController {
  login: RequestHandler
  logout: RequestHandler
  me: RequestHandler
}

/** POST y DELETE /api/admin/session, GET /api/admin/me. */
export function createAuthController(auth: AuthService, secureCookies: boolean): AuthController {
  return {
    async login(req, res) {
      const body = loginRequestSchema.safeParse(req.body)
      if (!body.success) throw new AppError('VALIDATION_ERROR', 'Ingresa tu email y tu contraseña.', validationDetails(body.error))
      const { user, token, expiresAt } = await auth.login(body.data.email, body.data.password)
      setSessionCookie(res, token, expiresAt, secureCookies)
      // Solo quién entró: nunca la contraseña ni la cookie.
      req.log.info({ userId: user.id }, 'inicio de sesión')
      res.json(meResponseSchema.parse({ user }))
    },

    async logout(req, res) {
      const token = readSessionToken(req)
      if (token) await auth.logout(token)
      clearSessionCookie(res, secureCookies)
      res.status(204).end()
    },

    me(req, res) {
      res.json(meResponseSchema.parse({ user: sessionUser(req) }))
    },
  }
}
