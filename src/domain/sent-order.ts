/** Un pedido ya enviado: lo que se muestra en "Pedido listo" y cuándo se envió. */
export interface SentOrder {
  message: string
  /** Solo en modo demo: si se pudo copiar el mensaje al portapapeles. */
  copied: boolean
  sentAt: number
}

/** Clave versionada, igual que la del carrito. */
export const SENT_ORDER_STORAGE_KEY = 'rys.sent.v1'

/** Pasado este tiempo, el pedido se da por terminado al volver a cargar la página. */
export const SENT_ORDER_TTL_MS = 2 * 60 * 60 * 1000

export function serializeSentOrder(sent: SentOrder): string {
  return JSON.stringify(sent)
}

/** Lee la marca guardada. Devuelve null si falta o no es válida. Nunca lanza errores. */
export function parseSentOrder(raw: string | null): SentOrder | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { message, copied, sentAt } = data as Record<string, unknown>
  if (typeof message !== 'string' || message === '') return null
  if (typeof copied !== 'boolean') return null
  if (typeof sentAt !== 'number' || !Number.isFinite(sentAt) || sentAt <= 0) return null
  return { message, copied, sentAt }
}

/** Con Math.abs, una fecha guardada muy en el futuro (reloj cambiado) tampoco queda vigente para siempre. */
export function isSentOrderExpired(sent: SentOrder, now: number): boolean {
  return Math.abs(now - sent.sentAt) >= SENT_ORDER_TTL_MS
}
