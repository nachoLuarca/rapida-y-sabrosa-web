import type { ErrorResponse } from '@rys/contracts'
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express'
import { AppError } from '../errors/app-error.ts'
import type { Logger } from '../logger.ts'

function requestIdOf(req: Request): string {
  return String(req.id ?? 'sin-id')
}

function sendError(req: Request, res: Response, error: AppError): void {
  const body: ErrorResponse = {
    error: { code: error.code, message: error.message, details: error.details, requestId: requestIdOf(req) },
  }
  res.status(error.status).json(body)
}

/** Errores de express.json(): body que no es JSON o que supera el límite. */
function bodyParserError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null || !('type' in error)) return null
  if (error.type === 'entity.too.large') {
    return new AppError('VALIDATION_ERROR', 'La solicitud es demasiado grande.', { _: 'El body supera los 32 kB.' })
  }
  if (error.type === 'entity.parse.failed') {
    return new AppError('VALIDATION_ERROR', 'La solicitud no es un JSON válido.', { _: 'JSON inválido.' })
  }
  if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
    return new AppError('VALIDATION_ERROR', 'La solicitud debe venir en UTF-8.', {})
  }
  return null
}

/** Ruta inexistente: 404 en JSON con el formato de error, nunca la página HTML de Express. */
export const notFound: RequestHandler = (req, res) => {
  sendError(req, res, new AppError('NOT_FOUND', 'No encontramos lo que buscas.', { path: req.path }))
}

/**
 * Último middleware. Los AppError se responden tal cual; cualquier otro error es un 500 sin detalles
 * internos: el detalle va al log junto con el requestId.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error)
      return
    }
    const known = error instanceof AppError ? error : bodyParserError(error)
    if (known) {
      sendError(req, res, known)
      return
    }
    logger.error({ err: error, requestId: requestIdOf(req), method: req.method, path: req.path }, 'error inesperado')
    sendError(req, res, new AppError('INTERNAL_ERROR', 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.'))
  }
}
