import type { CartLine } from './types'

/** Lo único que se guarda en localStorage: nunca datos del cliente. */
export interface SentMark {
  sentAt: number
  /** Huella del carrito al enviar, para saber si cambió. */
  cart: string
}

/** Lo recién enviado. Trae los datos del cliente, así que vive solo en memoria. */
export interface SentDetails {
  message: string
  /** Solo en modo demo: si se pudo copiar el mensaje al portapapeles. */
  copied: boolean
}

/** Pedido ya enviado. Después de recargar, `details` es null. */
export interface SentOrder extends SentMark {
  details: SentDetails | null
}

/** Clave versionada, igual que la del carrito. */
export const SENT_ORDER_STORAGE_KEY = 'rys.sent.v1'

/** Pasado este tiempo, el pedido se da por terminado al volver a cargar la página. */
export const SENT_ORDER_TTL_MS = 2 * 60 * 60 * 1000

/** Solo productos, variantes, ingredientes y cantidades, sin importar el orden de las líneas. */
export function cartFingerprint(lines: CartLine[]): string {
  return lines
    .map((line) => `${line.key}*${line.quantity}`)
    .sort()
    .join(';')
}

export function serializeSentMark({ sentAt, cart }: SentMark): string {
  return JSON.stringify({ sentAt, cart })
}

/**
 * Lee la marca guardada. Devuelve null si falta o no es válida. Nunca lanza errores.
 * Una marca con más campos es de la versión que guardaba el mensaje con los datos del cliente.
 */
export function parseSentMark(raw: string | null): SentMark | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Object.keys(data).length !== 2) return null
  const { sentAt, cart } = data as Record<string, unknown>
  if (typeof sentAt !== 'number' || !Number.isFinite(sentAt) || sentAt <= 0) return null
  if (typeof cart !== 'string' || cart === '') return null
  return { sentAt, cart }
}

/** Con Math.abs, una fecha guardada muy en el futuro (reloj cambiado) tampoco queda vigente para siempre. */
export function isSentMarkExpired(mark: SentMark, now: number): boolean {
  return Math.abs(now - mark.sentAt) >= SENT_ORDER_TTL_MS
}
