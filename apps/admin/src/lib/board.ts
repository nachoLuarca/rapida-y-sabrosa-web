import type { AdminOrderSummary, OrderStreamEvent } from '@rys/contracts'
import { formatClp, type OrderStatus } from '@rys/domain'

// Lógica pura del tablero de pedidos (docs/BACKEND-SPEC.md → Panel → /pedidos).

export interface BoardColumn {
  id: string
  title: string
  statuses: readonly OrderStatus[]
}

/** Los cancelados no van en el tablero: se ven en el detalle de cada pedido. */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { id: 'pendientes', title: 'Pendientes', statuses: ['pending'] },
  { id: 'confirmados', title: 'Confirmados', statuses: ['confirmed'] },
  { id: 'en-preparacion', title: 'En preparación', statuses: ['preparing'] },
  { id: 'en-camino-o-listos', title: 'En camino o listos', statuses: ['out_for_delivery', 'ready_for_pickup'] },
  { id: 'entregados-hoy', title: 'Entregados de hoy', statuses: ['delivered'] },
]

/** Estados que se piden para el tablero (todo menos entregados y cancelados; los entregados van aparte, de hoy). */
export const ACTIVE_STATUSES: readonly OrderStatus[] = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_pickup']

/** Cada pedido en su columna, el más nuevo arriba. Un mismo código no se repite aunque venga dos veces. */
export function groupBoard(orders: readonly AdminOrderSummary[]): Map<string, AdminOrderSummary[]> {
  const unique = [...new Map(orders.map((order) => [order.code, order])).values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
  return new Map(
    BOARD_COLUMNS.map((column) => [column.id, unique.filter((order) => column.statuses.includes(order.status))]),
  )
}

const BASE_TITLE = 'Pedidos | Panel de Rápida y Sabrosa'

/** "(2) Pedidos | …": la pestaña muestra cuántos pendientes hay, aunque esté en segundo plano. */
export function boardTitle(pendingCount: number): string {
  return pendingCount > 0 ? `(${pendingCount}) ${BASE_TITLE}` : BASE_TITLE
}

/** Lo que anuncia el lector de pantalla cuando llega un pedido. */
export function newOrderAnnouncement(event: OrderStreamEvent): string {
  const fulfillment = event.fulfillment === 'delivery' ? 'despacho' : 'retiro en el local'
  return `Pedido nuevo ${event.code}: ${formatClp(event.total)}, ${fulfillment}.`
}

const timeFormat = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const dateTimeFormat = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "19:42", en hora de Santiago. */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** "3 nov, 19:42", en hora de Santiago. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

/** Chat de WhatsApp con el cliente (celular normalizado 569XXXXXXXX). */
export function whatsappChatUrl(phone: string): string {
  return `https://wa.me/${phone}`
}
