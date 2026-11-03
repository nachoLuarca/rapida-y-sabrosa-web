// Estados del pedido y sus transiciones (docs/BACKEND-SPEC.md → Estados del pedido). Lo usan la API, para
// validar cada cambio, y el panel, para ofrecer solo las acciones posibles.

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'ready_for_pickup',
  'delivered',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type FulfillmentType = 'delivery' | 'pickup'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  out_for_delivery: 'En camino',
  ready_for_pickup: 'Listo para retiro',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['out_for_delivery', 'ready_for_pickup', 'cancelled'],
  out_for_delivery: ['delivered'],
  ready_for_pickup: ['delivered'],
  delivered: [],
  cancelled: [],
}

/** "En camino" solo existe para despacho y "Listo para retiro" solo para retiro. */
const ONLY_FOR: Partial<Record<OrderStatus, FulfillmentType>> = {
  out_for_delivery: 'delivery',
  ready_for_pickup: 'pickup',
}

/** Estados a los que puede pasar un pedido, en el orden de la tabla (la acción principal va primero). */
export function nextStatuses(from: OrderStatus, fulfillment: FulfillmentType): OrderStatus[] {
  return TRANSITIONS[from].filter((to) => (ONLY_FOR[to] ?? fulfillment) === fulfillment)
}

export function canTransition(from: OrderStatus, to: OrderStatus, fulfillment: FulfillmentType): boolean {
  return nextStatuses(from, fulfillment).includes(to)
}

export function isFinalStatus(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0
}

export const CANCEL_REASON_MAX_LENGTH = 200

export type TransitionResult =
  | { ok: true; reason: string | null }
  | { ok: false; error: 'INVALID_TRANSITION' | 'REASON_REQUIRED'; message: string }

/**
 * Valida un cambio de estado. Cancelar exige un motivo (sin espacios sobrantes); en los demás cambios el
 * motivo es opcional y se guarda si viene.
 */
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: FulfillmentType,
  reason?: string | null,
): TransitionResult {
  if (!canTransition(from, to, fulfillment)) {
    return {
      ok: false,
      error: 'INVALID_TRANSITION',
      message: `Un pedido "${ORDER_STATUS_LABELS[from]}" no puede pasar a "${ORDER_STATUS_LABELS[to]}".`,
    }
  }
  const trimmed = reason?.trim() ?? ''
  if (to === 'cancelled' && trimmed === '') {
    return { ok: false, error: 'REASON_REQUIRED', message: 'Indica el motivo de la cancelación.' }
  }
  return { ok: true, reason: trimmed === '' ? null : trimmed }
}
