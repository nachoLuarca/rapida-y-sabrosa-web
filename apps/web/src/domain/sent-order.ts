import type { CartLine } from '@rys/domain'

/** Lo único que se guarda en localStorage: nunca datos del cliente. */
export interface SentMark {
  sentAt: number
  /** Huella del carrito al enviar, para saber si cambió. */
  cart: string
  /** Código del pedido en el sistema (RYS-0042), cuando se creó en la API. No es un dato personal. */
  code?: string
}

/** Lo recién enviado. Trae los datos del cliente, así que vive solo en memoria. */
export interface SentDetails {
  message: string
  /** Solo en el modo demo estático: si se pudo copiar el mensaje al portapapeles. */
  copied: boolean
  /** Código del pedido si se creó en la API; null en la carta estática. */
  code: string | null
  /** Enlace para que el cliente abra WhatsApp con un clic; null en modo demo. */
  whatsappUrl: string | null
  /** El pedido no llega al WhatsApp del local (VITE_DEMO en la carta estática, DEMO_MODE en la API). */
  demo: boolean
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

export function serializeSentMark({ sentAt, cart, code }: SentMark): string {
  return JSON.stringify(code ? { sentAt, cart, code } : { sentAt, cart })
}

const ORDER_CODE = /^RYS-\d{4,}$/

/**
 * Lee la marca guardada. Devuelve null si falta o no es válida. Nunca lanza errores.
 * Solo acepta sentAt, cart y, opcionalmente, code: una marca con otros campos es de la versión que guardaba el
 * mensaje con los datos del cliente.
 */
export function parseSentMark(raw: string | null): SentMark | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  if (Object.keys(data).some((key) => !['sentAt', 'cart', 'code'].includes(key))) return null
  const { sentAt, cart, code } = data as Record<string, unknown>
  if (typeof sentAt !== 'number' || !Number.isFinite(sentAt) || sentAt <= 0) return null
  if (typeof cart !== 'string' || cart === '') return null
  if (code === undefined) return { sentAt, cart }
  if (typeof code !== 'string' || !ORDER_CODE.test(code)) return null
  return { sentAt, cart, code }
}

/** Con Math.abs, una fecha guardada muy en el futuro (reloj cambiado) tampoco queda vigente para siempre. */
export function isSentMarkExpired(mark: SentMark, now: number): boolean {
  return Math.abs(now - mark.sentAt) >= SENT_ORDER_TTL_MS
}

/** Título del panel en la confirmación: con la API lleva el código del pedido. */
export function sentOrderTitle(code: string | null, demo: boolean): string {
  if (!code) return 'Pedido listo'
  return demo ? `Pedido ${code} recibido (demo)` : `Pedido ${code} creado`
}
