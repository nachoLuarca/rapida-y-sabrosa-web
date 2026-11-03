import { describe, expect, it } from 'vitest'
import { emptyCheckoutForm, firstErrorField, validateCheckout, type CheckoutForm } from './checkout'
import type { PaymentMethod, Zone } from './types'

const zones: Zone[] = [
  { id: 'islita', name: 'Islita', fee: 2000 },
  { id: 'cmpc', name: 'CMPC', fee: 3500 },
]
const payments: PaymentMethod[] = ['Efectivo', 'Transferencia', 'Tarjeta']

const valid: CheckoutForm = {
  customerName: '  Ana Pérez ',
  phone: '+56 9 1234-5678',
  fulfillment: 'delivery',
  zoneId: 'islita',
  address: ' Los Aromos 123 ',
  payment: 'Transferencia',
  comment: ' sin cebolla ',
}

describe('validateCheckout', () => {
  it('arma el pedido con despacho, textos sin espacios sobrantes y celular normalizado', () => {
    expect(validateCheckout(valid, zones, payments)).toEqual({
      ok: true,
      order: {
        customerName: 'Ana Pérez',
        phone: '56912345678',
        fulfillment: { type: 'delivery', zone: zones[0], address: 'Los Aromos 123' },
        payment: 'Transferencia',
        comment: 'sin cebolla',
      },
    })
  })

  it('en retiro no pide sector ni dirección y omite el comentario vacío', () => {
    const result = validateCheckout(
      { ...valid, fulfillment: 'pickup', zoneId: '', address: '', comment: '  ' },
      zones,
      payments,
    )
    expect(result).toEqual({
      ok: true,
      order: { customerName: 'Ana Pérez', phone: '56912345678', fulfillment: { type: 'pickup' }, payment: 'Transferencia' },
    })
  })

  it('el formulario vacío marca todos los obligatorios', () => {
    const result = validateCheckout(emptyCheckoutForm, zones, payments)
    expect(result).toEqual({
      ok: false,
      errors: {
        customerName: 'Ingresa tu nombre, con al menos 2 letras.',
        phone: 'Ingresa tu celular, por ejemplo 9 1234 5678.',
        zoneId: 'Elige tu sector para calcular el despacho.',
        address: 'Ingresa tu dirección con calle y número.',
        payment: 'Elige cómo vas a pagar.',
      },
    })
  })

  it('explica cada error puntual', () => {
    const errorsFor = (form: Partial<CheckoutForm>) => {
      const result = validateCheckout({ ...valid, ...form }, zones, payments)
      return result.ok ? {} : result.errors
    }
    expect(errorsFor({ customerName: ' A ' })).toEqual({ customerName: 'Ingresa tu nombre, con al menos 2 letras.' })
    expect(errorsFor({ phone: '22 345 6789' })).toEqual({ phone: 'Ingresa un celular chileno, por ejemplo 9 1234 5678.' })
    expect(errorsFor({ zoneId: 'no-existe' })).toEqual({ zoneId: 'Elige tu sector para calcular el despacho.' })
    expect(errorsFor({ address: 'Av 1' })).toEqual({ address: 'Ingresa tu dirección con calle y número.' })
    expect(errorsFor({ payment: '' })).toEqual({ payment: 'Elige cómo vas a pagar.' })
    expect(errorsFor({ comment: 'x'.repeat(301) })).toEqual({ comment: 'El comentario puede tener hasta 300 caracteres.' })
    expect(errorsFor({ comment: 'x'.repeat(300) })).toEqual({})
  })

  it('solo acepta formas de pago configuradas', () => {
    expect(validateCheckout(valid, zones, ['Efectivo']).ok).toBe(false)
  })
})

describe('firstErrorField', () => {
  it('sigue el orden de los campos en pantalla', () => {
    expect(firstErrorField({ payment: 'x', address: 'y' })).toBe('address')
    expect(firstErrorField({ comment: 'x', phone: 'y' })).toBe('phone')
    expect(firstErrorField({})).toBeNull()
  })
})
