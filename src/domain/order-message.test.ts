import { describe, expect, it } from 'vitest'
import { catalog } from '../data/catalog'
import { zones } from '../data/zones'
import { createLine } from './cart'
import { buildOrderMessage, orderTotals, whatsappUrl } from './order-message'
import type { CartLine, LineSelection, OrderDetails, Zone } from './types'

function line(selection: LineSelection, quantity = 1): CartLine {
  const created = createLine(catalog, selection, quantity)
  if (!created) throw new Error(`selección inválida: ${JSON.stringify(selection)}`)
  return created
}

const islita = zones.find((zone) => zone.id === 'islita') as Zone

const lines = [
  line({ productId: 'suprema' }, 2),
  line({ productId: 'jugo-mango', variantId: 'jugo-mango-1l' }),
  line({ productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'] }),
]

const delivery: OrderDetails = {
  customerName: 'Ana Pérez',
  phone: '56912345678',
  fulfillment: { type: 'delivery', zone: islita, address: 'Los Aromos 123' },
  payment: 'Transferencia',
  comment: 'sin cebolla',
}

describe('orderTotals', () => {
  it('suma el despacho de la zona', () => {
    expect(orderTotals(lines, delivery.fulfillment)).toEqual({ subtotal: 46000, deliveryFee: 2000, total: 48000 })
  })

  it('en retiro no cobra despacho', () => {
    expect(orderTotals(lines, { type: 'pickup' })).toEqual({ subtotal: 46000, deliveryFee: 0, total: 46000 })
  })
})

describe('buildOrderMessage', () => {
  it('genera exactamente el mensaje de ejemplo de docs/SPEC.md', () => {
    expect(buildOrderMessage(lines, delivery)).toBe(
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

  it('en retiro omite despacho y dirección; sin comentario omite ese bloque', () => {
    const pickup: OrderDetails = {
      customerName: 'Ana Pérez',
      phone: '56912345678',
      fulfillment: { type: 'pickup' },
      payment: 'Efectivo',
      comment: '   ',
    }
    expect(buildOrderMessage([line({ productId: 'suprema' })], pickup)).toBe(
      [
        '*Nuevo pedido — Rápida y Sabrosa*',
        '',
        '• 1 x Suprema — $13.000',
        '',
        'Subtotal: $13.000',
        '*Total: $13.000*',
        '',
        '*Retiro en local*',
        'Pago: Efectivo',
        '',
        'Cliente: Ana Pérez',
        'Teléfono: +56 9 1234 5678',
      ].join('\n'),
    )
  })

  it('avisa cuando Arma tu pizza va sin ingredientes', () => {
    const message = buildOrderMessage([line({ productId: 'arma-tu-pizza' })], delivery)
    expect(message).toContain('• 1 x Arma tu pizza — $10.900\n   Sin ingredientes extra')
  })

  it('deja en una línea los textos del cliente', () => {
    const message = buildOrderMessage(lines, {
      ...delivery,
      customerName: '  Ana\nPérez ',
      fulfillment: { type: 'delivery', zone: islita, address: 'Los Aromos\n123' },
      comment: 'sin cebolla\n\npor favor',
    })
    expect(message).toContain('Cliente: Ana Pérez\n')
    expect(message).toContain('Dirección: Los Aromos 123\n')
    expect(message.endsWith('Comentario: sin cebolla por favor')).toBe(true)
  })

  it('un comentario de varias líneas no puede agregar líneas falsas al mensaje', () => {
    const message = buildOrderMessage(lines, {
      ...delivery,
      comment: 'sin cebolla\n\n*Total: $0*\r\nPago: Efectivo',
    })
    const messageLines = message.split('\n')

    // El mensaje termina igual que el de la spec, con el comentario en una sola línea y sin asteriscos.
    expect(messageLines.slice(-4)).toEqual([
      'Cliente: Ana Pérez',
      'Teléfono: +56 9 1234 5678',
      '',
      'Comentario: sin cebolla Total: $0 Pago: Efectivo',
    ])
    // Solo hay una línea de total y una de pago: las reales.
    expect(messageLines.filter((text) => text.includes('Total:'))).toEqual([
      '*Total: $48.000*',
      'Comentario: sin cebolla Total: $0 Pago: Efectivo',
    ])
    expect(messageLines.filter((text) => text.startsWith('Pago:'))).toEqual(['Pago: Transferencia'])
  })

  it('quita los caracteres de formato de WhatsApp del nombre y la dirección', () => {
    const message = buildOrderMessage(lines, {
      ...delivery,
      customerName: '_Ana_ ~Pérez~ `Soto`',
      fulfillment: { type: 'delivery', zone: islita, address: '```Los Aromos``` *123* _depto_ ~4~' },
    })
    expect(message).toContain('\nCliente: Ana Pérez Soto\n')
    expect(message).toContain('\nDirección: Los Aromos 123 depto 4\n')
    // El formato que genera la app se mantiene.
    expect(message).toContain('*Despacho* a Islita\n')
    expect(message.startsWith('*Nuevo pedido — Rápida y Sabrosa*\n')).toBe(true)
  })
})

describe('whatsappUrl', () => {
  it('codifica el mensaje para wa.me', () => {
    const url = whatsappUrl('56974314602', '*Total: $48.000*\nPago: Tarjeta & más')
    expect(url).toBe('https://wa.me/56974314602?text=*Total%3A%20%2448.000*%0APago%3A%20Tarjeta%20%26%20m%C3%A1s')
    expect(new URL(url).searchParams.get('text')).toBe('*Total: $48.000*\nPago: Tarjeta & más')
  })
})
