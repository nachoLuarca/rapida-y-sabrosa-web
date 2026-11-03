import { describe, expect, it } from 'vitest'
import { buildOrderMessage, createLine, type CartLine, type LineSelection, type OrderDetails } from '@rys/domain'
import { business } from '../config/business'
import { catalog } from './catalog'
import { zones } from './zones'

// La lógica del mensaje se prueba en packages/domain con datos de prueba. Esto verifica que la carta real
// y el nombre del local sigan dando exactamente el ejemplo de docs/SPEC.md.

function line(selection: LineSelection, quantity = 1): CartLine {
  const created = createLine(catalog, selection, quantity)
  if (!created) throw new Error(`selección inválida: ${JSON.stringify(selection)}`)
  return created
}

describe('mensaje de pedido con la carta real', () => {
  it('genera exactamente el mensaje de ejemplo de docs/SPEC.md', () => {
    const islita = zones.find((zone) => zone.id === 'islita')
    if (!islita) throw new Error('falta la zona Islita')
    const lines = [
      line({ productId: 'suprema' }, 2),
      line({ productId: 'jugo-mango', variantId: 'jugo-mango-1l' }),
      line({ productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'] }),
    ]
    const order: OrderDetails = {
      customerName: 'Ana Pérez',
      phone: '56912345678',
      fulfillment: { type: 'delivery', zone: islita, address: 'Los Aromos 123' },
      payment: 'Transferencia',
      comment: 'sin cebolla',
    }

    expect(buildOrderMessage(business.name, lines, order)).toBe(
      [
        '*Nuevo pedido — Rápida y Sabrosa*',
        '',
        '• 2 x Suprema — $26.000',
        '• 1 x Mango (1 litro) — $7.000',
        '• 1 x Arma tu pizza — $13.000',
        '   Ingredientes: Tocino, Choclo',
        '',
        'Subtotal: $46.000',
        'Despacho: $2.000',
        '*Total: $48.000*',
        '',
        '*Despacho* a Islita',
        'Dirección: Los Aromos 123',
        'Pago: Transferencia',
        '',
        'Cliente: Ana Pérez',
        'Teléfono: +56 9 1234 5678',
        '',
        'Comentario: sin cebolla',
      ].join('\n'),
    )
  })
})
