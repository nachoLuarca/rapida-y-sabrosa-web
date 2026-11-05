import type { AdminOrderSummary } from '@rys/contracts'
import { describe, expect, it } from 'vitest'
import { boardTitle, formatDateTime, formatTime, groupBoard, newOrderAnnouncement, whatsappChatUrl } from './board'

const order = (code: string, status: AdminOrderSummary['status'], createdAt: string): AdminOrderSummary => ({
  code,
  status,
  fulfillment: 'pickup',
  zoneName: null,
  customerName: 'Ana',
  total: 13000,
  itemCount: 1,
  createdAt,
  updatedAt: createdAt,
})

describe('groupBoard', () => {
  it('pone cada pedido en su columna, el más nuevo arriba, sin repetir ni mostrar cancelados', () => {
    const board = groupBoard([
      order('RYS-0001', 'pending', '2026-11-03T22:00:00.000Z'),
      order('RYS-0003', 'pending', '2026-11-03T22:10:00.000Z'),
      order('RYS-0002', 'out_for_delivery', '2026-11-03T22:05:00.000Z'),
      order('RYS-0004', 'ready_for_pickup', '2026-11-03T22:06:00.000Z'),
      order('RYS-0005', 'cancelled', '2026-11-03T22:07:00.000Z'),
      order('RYS-0006', 'delivered', '2026-11-03T21:00:00.000Z'),
      order('RYS-0003', 'pending', '2026-11-03T22:10:00.000Z'),
    ])
    const codes = (id: string) => board.get(id)?.map((o) => o.code)
    expect(codes('pendientes')).toEqual(['RYS-0003', 'RYS-0001'])
    expect(codes('confirmados')).toEqual([])
    expect(codes('en-camino-o-listos')).toEqual(['RYS-0004', 'RYS-0002'])
    expect(codes('entregados-hoy')).toEqual(['RYS-0006'])
    expect([...board.values()].flat().map((o) => o.code)).not.toContain('RYS-0005')
  })
})

describe('textos del tablero', () => {
  it('el título muestra cuántos pedidos pendientes hay', () => {
    expect(boardTitle(0)).toBe('Pedidos | Panel de Rápida y Sabrosa')
    expect(boardTitle(3)).toBe('(3) Pedidos | Panel de Rápida y Sabrosa')
  })

  it('anuncia el pedido nuevo con su código, total y entrega', () => {
    expect(
      newOrderAnnouncement({ code: 'RYS-0042', status: 'pending', fulfillment: 'delivery', total: 15000, createdAt: '2026-11-03T22:00:00.000Z' }),
    ).toBe('Pedido nuevo RYS-0042: $15.000, despacho.')
  })

  it('muestra las horas en Santiago y arma el chat de WhatsApp del cliente', () => {
    expect(formatTime('2026-11-03T22:05:00.000Z')).toBe('19:05')
    expect(formatDateTime('2026-11-03T22:05:00.000Z')).toMatch(/^3 nov\.?,? 19:05$/)
    expect(whatsappChatUrl('56912345678')).toBe('https://wa.me/56912345678')
  })
})
