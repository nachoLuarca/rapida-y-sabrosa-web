import { describe, expect, it } from 'vitest'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  canTransition,
  isFinalStatus,
  nextStatuses,
  validateTransition,
  type OrderStatus,
} from './order-status.ts'

describe('estados del pedido', () => {
  it('cada estado tiene su etiqueta en español', () => {
    expect(ORDER_STATUSES.map((status) => ORDER_STATUS_LABELS[status])).toEqual([
      'Pendiente',
      'Confirmado',
      'En preparación',
      'En camino',
      'Listo para retiro',
      'Entregado',
      'Cancelado',
    ])
  })

  it('sigue la tabla de transiciones para despacho', () => {
    expect(nextStatuses('pending', 'delivery')).toEqual(['confirmed', 'cancelled'])
    expect(nextStatuses('confirmed', 'delivery')).toEqual(['preparing', 'cancelled'])
    expect(nextStatuses('preparing', 'delivery')).toEqual(['out_for_delivery', 'cancelled'])
    expect(nextStatuses('out_for_delivery', 'delivery')).toEqual(['delivered'])
  })

  it('sigue la tabla de transiciones para retiro', () => {
    expect(nextStatuses('pending', 'pickup')).toEqual(['confirmed', 'cancelled'])
    expect(nextStatuses('preparing', 'pickup')).toEqual(['ready_for_pickup', 'cancelled'])
    expect(nextStatuses('ready_for_pickup', 'pickup')).toEqual(['delivered'])
  })

  it('entregado y cancelado son finales', () => {
    for (const fulfillment of ['delivery', 'pickup'] as const) {
      expect(nextStatuses('delivered', fulfillment)).toEqual([])
      expect(nextStatuses('cancelled', fulfillment)).toEqual([])
    }
    expect(ORDER_STATUSES.filter(isFinalStatus)).toEqual(['delivered', 'cancelled'])
  })

  it('no permite saltarse pasos, volver atrás ni mezclar despacho con retiro', () => {
    const invalid: [OrderStatus, OrderStatus, 'delivery' | 'pickup'][] = [
      ['pending', 'preparing', 'delivery'],
      ['pending', 'delivered', 'pickup'],
      ['confirmed', 'pending', 'delivery'],
      ['preparing', 'confirmed', 'pickup'],
      ['preparing', 'ready_for_pickup', 'delivery'],
      ['preparing', 'out_for_delivery', 'pickup'],
      ['out_for_delivery', 'cancelled', 'delivery'],
      ['delivered', 'cancelled', 'pickup'],
      ['cancelled', 'pending', 'delivery'],
      ['pending', 'pending', 'delivery'],
    ]
    for (const [from, to, fulfillment] of invalid) {
      expect(canTransition(from, to, fulfillment), `${from} → ${to} (${fulfillment})`).toBe(false)
    }
  })

  it('solo se puede cancelar antes de que el pedido salga o esté listo', () => {
    const cancellable = ORDER_STATUSES.filter((status) => canTransition(status, 'cancelled', 'delivery'))
    expect(cancellable).toEqual(['pending', 'confirmed', 'preparing'])
  })
})

describe('validateTransition', () => {
  it('acepta una transición válida y guarda el motivo solo si viene', () => {
    expect(validateTransition('pending', 'confirmed', 'pickup')).toEqual({ ok: true, reason: null })
    expect(validateTransition('pending', 'confirmed', 'pickup', '  llamó  ')).toEqual({ ok: true, reason: 'llamó' })
  })

  it('cancelar exige un motivo con texto', () => {
    for (const reason of [undefined, null, '', '   ']) {
      expect(validateTransition('pending', 'cancelled', 'delivery', reason)).toEqual({
        ok: false,
        error: 'REASON_REQUIRED',
        message: 'Indica el motivo de la cancelación.',
      })
    }
    expect(validateTransition('confirmed', 'cancelled', 'delivery', ' Sin stock ')).toEqual({
      ok: true,
      reason: 'Sin stock',
    })
  })

  it('rechaza una transición inválida antes de revisar el motivo', () => {
    expect(validateTransition('delivered', 'cancelled', 'delivery')).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
      message: 'Un pedido "Entregado" no puede pasar a "Cancelado".',
    })
  })
})
