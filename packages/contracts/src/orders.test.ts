import { CHECKOUT_MESSAGES, PAYMENT_METHOD_CODES } from '@rys/domain'
import { describe, expect, it } from 'vitest'
import { validationDetails } from './errors.ts'
import {
  idempotencyKeySchema,
  orderRequestSchema,
  orderResponseSchema,
  PAYMENT_METHODS,
  priceChangedDetailsSchema,
  productUnavailableDetailsSchema,
  storeBlockedDetailsSchema,
  type OrderRequest,
} from './orders.ts'

const delivery: OrderRequest = {
  lines: [
    { productId: 'suprema', quantity: 2 },
    { productId: 'jugo-mango', variantId: 'jugo-mango-1l', quantity: 1 },
    { productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'], quantity: 1 },
  ],
  customer: { name: '  Ana Pérez ', phone: '9 1234 5678' },
  fulfillment: 'delivery',
  zoneId: 'islita',
  address: ' Los Aromos 123 ',
  payment: 'transfer',
  notes: 'sin cebolla',
  expectedTotal: 48000,
  website: '',
}

const pickup: OrderRequest = {
  lines: [{ productId: 'suprema', quantity: 1 }],
  customer: { name: 'Ana', phone: '+56 9 1234 5678' },
  fulfillment: 'pickup',
  payment: 'card',
  expectedTotal: 13000,
}

function errorsOf(input: unknown) {
  const result = orderRequestSchema.safeParse(input)
  if (result.success) throw new Error('se esperaba un error de validación')
  return validationDetails(result.error)
}

describe('orderRequestSchema', () => {
  it('acepta un pedido con despacho, recorta los textos y normaliza el celular', () => {
    const parsed = orderRequestSchema.parse(delivery)
    expect(parsed).toMatchObject({
      customer: { name: 'Ana Pérez', phone: '56912345678' },
      fulfillment: 'delivery',
      zoneId: 'islita',
      address: 'Los Aromos 123',
      notes: 'sin cebolla',
    })
    expect(parsed.lines).toHaveLength(3)
  })

  it('acepta un retiro sin zona ni dirección, y descarta las que vengan', () => {
    expect(orderRequestSchema.parse(pickup)).toMatchObject({ fulfillment: 'pickup', customer: { phone: '56912345678' } })
    const parsed = orderRequestSchema.parse({ ...pickup, zoneId: 'islita', address: 'x' })
    expect(parsed.zoneId).toBeUndefined()
    expect(parsed.address).toBeUndefined()
  })

  it('un comentario vacío es lo mismo que no enviarlo', () => {
    expect(orderRequestSchema.parse({ ...pickup, notes: '   ' }).notes).toBeUndefined()
  })

  it('usa los mismos mensajes que el checkout de la web, por campo', () => {
    expect(
      errorsOf({
        ...delivery,
        customer: { name: ' A ', phone: '12345' },
        zoneId: '',
        address: 'Calle',
        payment: 'bitcoin',
        notes: 'x'.repeat(301),
      }),
    ).toEqual({
      'customer.name': CHECKOUT_MESSAGES.customerName,
      'customer.phone': CHECKOUT_MESSAGES.phoneInvalid,
      zoneId: CHECKOUT_MESSAGES.zoneId,
      payment: CHECKOUT_MESSAGES.payment,
      notes: CHECKOUT_MESSAGES.comment,
    })
  })

  it('con despacho exige zona y dirección', () => {
    const { zoneId: _zone, address: _address, ...withoutBoth } = delivery
    expect(errorsOf(withoutBoth)).toEqual({ zoneId: CHECKOUT_MESSAGES.zoneId, address: CHECKOUT_MESSAGES.address })
    expect(errorsOf({ ...delivery, address: ' abc ' })).toEqual({ address: CHECKOUT_MESSAGES.address })
  })

  it('distingue el celular vacío del celular inválido', () => {
    expect(errorsOf({ ...pickup, customer: { name: 'Ana', phone: '  ' } })).toEqual({
      'customer.phone': CHECKOUT_MESSAGES.phoneMissing,
    })
    expect(errorsOf({ ...pickup, customer: { name: 'Ana' } })).toEqual({
      'customer.phone': CHECKOUT_MESSAGES.phoneMissing,
    })
  })

  it('limita las líneas a entre 1 y 30, y la cantidad de cada una a entre 1 y 50', () => {
    expect(errorsOf({ ...pickup, lines: [] })).toEqual({ lines: 'El pedido no tiene productos.' })
    const many = Array.from({ length: 31 }, () => ({ productId: 'suprema', quantity: 1 }))
    expect(errorsOf({ ...pickup, lines: many })).toEqual({ lines: 'El pedido puede tener hasta 30 productos distintos.' })
    expect(errorsOf({ ...pickup, lines: [{ productId: 'suprema', quantity: 0 }] })).toEqual({
      'lines.0.quantity': 'La cantidad mínima es 1.',
    })
    expect(errorsOf({ ...pickup, lines: [{ productId: 'suprema', quantity: 51 }] })).toEqual({
      'lines.0.quantity': 'La cantidad máxima es 50.',
    })
    expect(Object.keys(errorsOf({ ...pickup, lines: [{ productId: 'suprema', quantity: 1.5 }] }))).toEqual([
      'lines.0.quantity',
    ])
  })

  it('rechaza ids que no son slugs y un total que no es entero', () => {
    expect(Object.keys(errorsOf({ ...pickup, lines: [{ productId: 'Suprema!', quantity: 1 }] }))).toEqual([
      'lines.0.productId',
    ])
    expect(Object.keys(errorsOf({ ...pickup, expectedTotal: 13000.5 }))).toEqual(['expectedTotal'])
    expect(Object.keys(errorsOf({ ...pickup, expectedTotal: undefined }))).toEqual(['expectedTotal'])
  })

  it('exige despacho o retiro', () => {
    expect(errorsOf({ ...pickup, fulfillment: 'dron' })).toEqual({ fulfillment: 'Elige despacho o retiro en el local.' })
  })

  it('acepta el campo trampa con contenido: lo revisa la API, no el esquema', () => {
    expect(orderRequestSchema.parse({ ...pickup, website: 'http://spam' }).website).toBe('http://spam')
  })
})

describe('idempotencyKeySchema', () => {
  it('exige un uuid', () => {
    expect(idempotencyKeySchema.safeParse('3f0e0b8c-6d3f-4a51-9c5e-2b1b5a1f8a10').success).toBe(true)
    expect(idempotencyKeySchema.safeParse('pedido-1').success).toBe(false)
  })
})

describe('orderResponseSchema', () => {
  const response = {
    code: 'RYS-0042',
    status: 'pending',
    lines: [
      {
        productId: 'arma-tu-pizza',
        name: 'Arma tu pizza',
        variantLabel: null,
        ingredients: [{ id: 'tocino', name: 'Tocino', price: 1500, included: true }],
        unitPrice: 13000,
        quantity: 1,
        lineTotal: 13000,
      },
    ],
    subtotal: 13000,
    deliveryFee: 0,
    total: 13000,
    message: '*Nuevo pedido RYS-0042 — Rápida y Sabrosa*',
    whatsappUrl: 'https://wa.me/56974314602?text=hola',
    demo: false,
  }

  it('acepta la respuesta de un pedido creado, también en modo demo', () => {
    expect(orderResponseSchema.parse(response)).toEqual(response)
    expect(orderResponseSchema.parse({ ...response, whatsappUrl: null, demo: true }).whatsappUrl).toBeNull()
  })

  it('exige el código RYS-NNNN y un estado conocido', () => {
    expect(orderResponseSchema.safeParse({ ...response, code: 'RYS-42' }).success).toBe(false)
    expect(orderResponseSchema.safeParse({ ...response, code: 'RYS-12345' }).success).toBe(true)
    expect(orderResponseSchema.safeParse({ ...response, status: 'lost' }).success).toBe(false)
  })
})

describe('formas de pago', () => {
  it('los códigos de la API son los mismos del dominio', () => {
    expect([...PAYMENT_METHODS].sort()).toEqual(Object.values(PAYMENT_METHOD_CODES).sort())
  })
})

describe('details de los errores del pedido', () => {
  it('PRICE_CHANGED trae la cotización nueva y PRODUCT_UNAVAILABLE los ids afectados', () => {
    const line = {
      productId: 'suprema',
      name: 'Suprema',
      variantLabel: null,
      ingredients: null,
      unitPrice: 13500,
      quantity: 1,
      lineTotal: 13500,
    }
    expect(
      priceChangedDetailsSchema.safeParse({ quote: { lines: [line], subtotal: 13500, deliveryFee: 0, total: 13500 } })
        .success,
    ).toBe(true)
    expect(productUnavailableDetailsSchema.safeParse({ productIds: ['suprema'], variantIds: [], ingredientIds: [] }).success).toBe(true)
    expect(productUnavailableDetailsSchema.safeParse({ productIds: ['suprema'] }).success).toBe(false)
  })

  it('STORE_CLOSED y ORDERS_PAUSED traen la próxima apertura o null', () => {
    expect(storeBlockedDetailsSchema.safeParse({ nextOpening: '2026-11-03T22:00:00.000Z' }).success).toBe(true)
    expect(storeBlockedDetailsSchema.safeParse({ nextOpening: null }).success).toBe(true)
    expect(storeBlockedDetailsSchema.safeParse({ nextOpening: 'mañana' }).success).toBe(false)
  })
})
