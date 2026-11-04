import type { MenuResponse, OrderResponse } from '@rys/contracts'
import type { DataSources } from '../data-source'
import { createApiCatalogSource } from '../data-source/catalog-source'
import { createApiOrderGateway } from '../data-source/order-gateway'
import { apiMenu } from './api-menu'

/** Una respuesta mínima con lo que usan las fuentes de datos: status, ok, headers.get y json(). */
function reply(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('sin body')
      return structuredClone(body)
    },
  } as unknown as Response
}

export interface RecordedRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

export type OrderReply = { status: number; body: unknown } | 'network-error'

/** Respuesta de error con el formato único de la API. */
export function apiError(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return { status, body: { error: { code, message, details, requestId: 'test' } } }
}

/** Un pedido creado: el mensaje lleva el código, como el de la API. */
export function createdOrder(overrides: Partial<OrderResponse> = {}): { status: number; body: OrderResponse } {
  const message = '*Nuevo pedido RYS-0042 — Rápida y Sabrosa*\n\n• 1 x Suprema — $13.000'
  return {
    status: 201,
    body: {
      code: 'RYS-0042',
      status: 'pending',
      lines: [],
      subtotal: 13000,
      deliveryFee: 0,
      total: 13000,
      message,
      whatsappUrl: `https://wa.me/56974314602?text=${encodeURIComponent(message)}`,
      demo: false,
      ...overrides,
    },
  }
}

/**
 * API simulada para los tests de la web en modo api: GET /api/menu con ETag (304 si no cambió) y POST /api/orders
 * con las respuestas que el test encola. Las fuentes de datos son las reales; solo `fetch` es de mentira.
 */
export function createFakeApi(initialMenu: MenuResponse = apiMenu()) {
  let menu = initialMenu
  let menuDown = false
  const orderReplies: OrderReply[] = []
  const requests: RecordedRequest[] = []

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const headers = { ...(init.headers as Record<string, string> | undefined) }
    const method = init.method ?? 'GET'
    requests.push({ method, url, headers, body: init.body ? JSON.parse(String(init.body)) : undefined })

    if (method === 'GET' && url === '/api/menu') {
      if (menuDown) throw new TypeError('Failed to fetch')
      const current = `"${hash(JSON.stringify(menu))}"`
      if (headers['If-None-Match'] === current) return reply(304, undefined, { ETag: current })
      return reply(200, menu, { ETag: current })
    }
    if (method === 'POST' && url === '/api/orders') {
      const next = orderReplies.shift() ?? createdOrder()
      if (next === 'network-error') throw new TypeError('Failed to fetch')
      return reply(next.status, next.body)
    }
    return reply(404, { error: { code: 'NOT_FOUND', message: 'No existe', details: {}, requestId: 'test' } })
  }) as typeof fetch

  return {
    sources(): DataSources {
      return { catalog: createApiCatalogSource(fetchImpl), orders: createApiOrderGateway(fetchImpl) }
    },
    /** Cambia la carta que responde la API (por ejemplo, un producto agotado o un precio nuevo). */
    updateMenu(change: (menu: MenuResponse) => void) {
      const next = structuredClone(menu)
      change(next)
      menu = next
    },
    setMenuDown(down: boolean) {
      menuDown = down
    },
    /** Lo que responderá cada POST /api/orders, en orden. Sin respuestas encoladas, crea RYS-0042. */
    replyToOrders(...replies: OrderReply[]) {
      orderReplies.push(...replies)
    },
    requests,
    orderRequests: () => requests.filter((request) => request.method === 'POST'),
    menuRequests: () => requests.filter((request) => request.method === 'GET'),
  }
}

function hash(text: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 0x01000193)
  }
  return (value >>> 0).toString(16)
}
