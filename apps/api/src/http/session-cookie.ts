import { SESSION_COOKIE } from '@rys/contracts'
import type { CookieOptions, Request, Response } from 'express'

/**
 * Cookie de sesión (docs/BACKEND-SPEC.md → Autenticación): HttpOnly, SameSite=Lax, Path=/api y Secure fuera de
 * desarrollo. En desarrollo y en la demo la web va por HTTP, así que ahí no puede ser Secure.
 */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/api' }
}

/** Valor de una cookie del header Cookie, o null. Sin dependencias: solo se necesita una. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== name) continue
    const value = part.slice(index + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }
  return null
}

export function readSessionToken(req: Request): string | null {
  return readCookie(req.headers.cookie, SESSION_COOKIE)
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(secure), expires: expiresAt })
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(secure))
}
