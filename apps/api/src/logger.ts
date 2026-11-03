import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { pino, type Logger } from 'pino'
import { pinoHttp, type HttpLogger } from 'pino-http'

export type { Logger }

export function createLogger(level: string): Logger {
  return pino({
    level,
    // Por si alguien loguea un objeto entero: nunca contraseñas, cookies ni datos del cliente.
    redact: {
      paths: [
        'password',
        '*.password',
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'customer',
        '*.customer',
      ],
      censor: '[oculto]',
    },
  })
}

/** Un id que viene del cliente solo se acepta si es corto y sin caracteres raros; si no, se genera uno. */
const REQUEST_ID_PATTERN = /^[\w-]{8,100}$/

export const REQUEST_ID_HEADER = 'X-Request-Id'

/**
 * Log de cada request con su id (también en el header X-Request-Id de la respuesta). Solo método, ruta y
 * status: nunca headers (cookies) ni el body (datos personales de los pedidos).
 */
export function createRequestLogger(logger: Logger): HttpLogger {
  return pinoHttp({
    logger,
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const incoming = req.headers['x-request-id']
      const id = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID()
      res.setHeader(REQUEST_ID_HEADER, id)
      return id
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel(_req, res, error) {
      if (error || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    // El detalle de los 500 ya lo registra el errorHandler, con el requestId.
    customErrorMessage: (_req, res) => `request terminó con ${res.statusCode}`,
  })
}
