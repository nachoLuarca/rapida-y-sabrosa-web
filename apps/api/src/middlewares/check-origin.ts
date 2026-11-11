import type { RequestHandler } from 'express'
import { AppError } from '../errors/app-error.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** 10.0.0.0/8, 172.16.0.0/12 y 192.168.0.0/16: las direcciones de una red local (RFC 1918). */
export function isPrivateIPv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!match) return false
  const [a, b, c, d] = match.slice(1).map(Number)
  if ([a, b, c, d].some((part) => part > 255)) return false
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

const portOf = (url: URL) => url.port || (url.protocol === 'https:' ? '443' : '80')

/**
 * Modo demo: la web y el panel también se abren por la IP del notebook en la red local (http://192.168.1.20:5174),
 * que cambia según la red Wi-Fi. Se acepta un origen http con una IP de red local y el puerto de alguno de los
 * orígenes permitidos (5173 y 5174 por defecto). Así no hay que tocar ALLOWED_ORIGINS en cada red.
 */
export function isLocalNetworkOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  if (!URL.canParse(origin)) return false
  const url = new URL(origin)
  if (url.protocol !== 'http:' || url.origin !== origin || !isPrivateIPv4(url.hostname)) return false
  const ports = new Set(allowedOrigins.filter((allowed) => URL.canParse(allowed)).map((allowed) => portOf(new URL(allowed))))
  return ports.has(portOf(url))
}

export interface CheckOriginOptions {
  /** DEMO_MODE: acepta además la IP de la red local (ver isLocalNetworkOrigin). */
  allowLocalNetwork?: boolean
}

/**
 * Protección CSRF de las mutaciones del panel (ADR-004): el header Origin tiene que estar en ALLOWED_ORIGINS. Los
 * navegadores lo mandan siempre en POST, PATCH y DELETE, así que si falta también se rechaza. Junto con la cookie
 * SameSite=Lax alcanza para este caso.
 */
export function checkOrigin(allowedOrigins: readonly string[], options: CheckOriginOptions = {}): RequestHandler {
  const allowed = new Set(allowedOrigins)
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }
    const origin = req.get('Origin')
    const accepted =
      origin !== undefined &&
      (allowed.has(origin) || (options.allowLocalNetwork === true && isLocalNetworkOrigin(origin, allowedOrigins)))
    if (!accepted) {
      next(new AppError('INVALID_ORIGIN', 'Esta acción solo se puede hacer desde el panel del local.'))
      return
    }
    next()
  }
}
