import { ERROR_STATUS, type ErrorCode } from '@rys/contracts'

/**
 * Error esperable de la API: el errorHandler lo responde con el formato único
 * `{ error: { code, message, details, requestId } }` y el status de su código (docs/BACKEND-SPEC.md → API).
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.details = details
  }
}
