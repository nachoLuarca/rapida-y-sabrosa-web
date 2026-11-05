import { ORDER_STREAM_EVENTS, orderStreamEventSchema, type OrderStreamEvent, type OrderStreamEventName } from '@rys/contracts'

export type StreamStatus = 'connecting' | 'online' | 'offline'

/** Lo mínimo de un EventSource que se usa; los tests pasan uno de mentira. */
export interface EventSourceLike {
  readonly readyState: number
  onopen: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  close(): void
}

export type CreateEventSource = (url: string) => EventSourceLike

export const browserEventSource: CreateEventSource = (url) => new EventSource(url, { withCredentials: true })

const CLOSED = 2
/** Si el navegador se rinde (por ejemplo, la API respondió un error), se vuelve a intentar a mano. */
export const RECONNECT_MS = 3000

export interface OrderStreamHandlers {
  onEvent: (name: OrderStreamEventName, event: OrderStreamEvent) => void
  onStatus: (status: StreamStatus) => void
  /** Cada vez que se conecta (también al reconectar): hay que volver a pedir la lista para no perder eventos. */
  onOpen: () => void
  /** El navegador cerró la conexión para siempre (pasa con un 401): conviene revisar la sesión. */
  onClosed: () => void
}

/**
 * Pedidos en vivo (ADR-007). EventSource se reconecta solo cuando la conexión se cae; si en vez de eso la cierra
 * (por una respuesta de error), se vuelve a abrir a los 3 segundos. Devuelve la función para desconectarse.
 */
export function connectOrderStream(
  create: CreateEventSource,
  handlers: OrderStreamHandlers,
  url = '/api/admin/orders/stream',
): () => void {
  let source: EventSourceLike | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const open = () => {
    handlers.onStatus('connecting')
    const current = create(url)
    source = current
    current.onopen = () => {
      handlers.onStatus('online')
      handlers.onOpen()
    }
    current.onerror = () => {
      if (stopped) return
      handlers.onStatus('offline')
      if (current.readyState === CLOSED) {
        current.close()
        handlers.onClosed()
        retry = setTimeout(() => {
          if (!stopped) open()
        }, RECONNECT_MS)
      }
    }
    for (const name of ORDER_STREAM_EVENTS) {
      current.addEventListener(name, (message) => {
        const parsed = orderStreamEventSchema.safeParse(safeJson(message.data))
        if (parsed.success) handlers.onEvent(name, parsed.data)
      })
    }
  }

  open()
  return () => {
    stopped = true
    clearTimeout(retry)
    source?.close()
  }
}

function safeJson(text: unknown): unknown {
  try {
    return JSON.parse(String(text))
  } catch {
    return null
  }
}
