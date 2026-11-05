import { describe, expect, it } from 'vitest'
import { createLine, type Catalog } from '@rys/domain'
import { apiMenu } from '../test/api-menu'
import { attemptFor, newIdempotencyKey, parseAttempt, requestFingerprint, serializeAttempt } from './checkout-attempt'
import { toMenuData } from './menu-adapter'
import { priceChanges } from './price-changes'
import { parseSentMark, sentOrderTitle, serializeSentMark } from './sent-order'
import { checkoutErrorsFromServer } from './server-errors'
import { storeBlockMessage } from './store-messages'

describe('toMenuData', () => {
  it('pasa la carta de la API a la forma de la carta del bundle', () => {
    const received = new Date('2026-11-03T19:00:00Z')
    const menu = toMenuData(apiMenu(), received)
    expect(menu.categories.map((c) => c.id)).toEqual(['pizzas-carnes', 'arma-tu-pizza', 'jugos'])
    // Los null de la API pasan a campos ausentes, como en docs/data.
    expect(menu.categories[0]).toEqual({ id: 'pizzas-carnes', name: 'Pizzas de mechada y charcutería' })
    expect(menu.products).toEqual([
      {
        id: 'suprema',
        categoryId: 'pizzas-carnes',
        name: 'Suprema',
        description: 'Carne mechada, papas fritas artesanales, salsa de queso, mozzarella y salsa de tomate.',
        available: true,
        price: 13000,
      },
      {
        id: 'jugo-mango',
        categoryId: 'jugos',
        name: 'Mango',
        available: true,
        variants: [
          { id: 'jugo-mango-500', label: '500 cc', price: 3500 },
          { id: 'jugo-mango-1l', label: '1 litro', price: 7000 },
        ],
      },
    ])
    expect(menu.buildPizza).toMatchObject({ productId: 'arma-tu-pizza', basePrice: 10900, available: true })
    expect(menu.store).toEqual({ isOpen: true, nextOpening: null, ordersPaused: false, asOf: received })
  })

  it('sirve para armar líneas del pedido con @rys/domain y trae los agotados', () => {
    const response = apiMenu()
    response.categories[0].products[0].available = false
    response.business = { ...response.business, isOpen: false, nextOpening: '2026-11-03T22:00:00.000Z' }
    const menu = toMenuData(response)
    const catalog: Catalog = menu
    expect(createLine(catalog, { productId: 'jugo-mango', variantId: 'jugo-mango-1l' })?.unitPrice).toBe(7000)
    expect(menu.products[0].available).toBe(false)
    expect(menu.store.nextOpening).toEqual(new Date('2026-11-03T22:00:00.000Z'))
  })
})

describe('intento de checkout (Idempotency-Key)', () => {
  const body = { lines: [{ productId: 'suprema', quantity: 1 }], customer: { name: 'Ana', phone: '912345678' } }

  it('la huella no depende del orden de las claves y cambia si cambia el body', () => {
    const reordered = { customer: { phone: '912345678', name: 'Ana' }, lines: [{ quantity: 1, productId: 'suprema' }] }
    expect(requestFingerprint(reordered)).toBe(requestFingerprint(body))
    expect(requestFingerprint({ ...body, notes: 'x' })).not.toBe(requestFingerprint(body))
    expect(requestFingerprint(body)).toMatch(/^[0-9a-f]{16}$/)
    // No guarda nada legible del cliente.
    expect(requestFingerprint(body)).not.toContain('Ana')
  })

  it('reusa la clave con el mismo body y crea otra si el body cambió', () => {
    const first = attemptFor(body, null, () => 'clave-1')
    expect(attemptFor(body, first, () => 'clave-2')).toBe(first)
    expect(attemptFor({ ...body, notes: 'x' }, first, () => 'clave-2').key).toBe('clave-2')
  })

  it('genera uuid v4 válidos sin crypto.randomUUID', () => {
    const zeros = newIdempotencyKey((bytes) => bytes.fill(0))
    expect(zeros).toBe('00000000-0000-4000-8000-000000000000')
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(50)
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('lee lo guardado solo si es válido', () => {
    const attempt = { key: newIdempotencyKey(), fingerprint: requestFingerprint(body) }
    expect(parseAttempt(serializeAttempt(attempt))).toEqual(attempt)
    for (const raw of [null, '', '{', '[]', '{"key":"x","fingerprint":"0123456789abcdef"}', JSON.stringify({ ...attempt, fingerprint: 'zz' })]) {
      expect(parseAttempt(raw)).toBeNull()
    }
  })
})

describe('checkoutErrorsFromServer', () => {
  it('pone cada error de la API junto a su campo del formulario', () => {
    expect(
      checkoutErrorsFromServer({
        'customer.name': 'Ingresa tu nombre, con al menos 2 letras.',
        'customer.phone': 'Ingresa un celular chileno, por ejemplo 9 1234 5678.',
        zoneId: 'Elige tu sector para calcular el despacho.',
        notes: 'El comentario puede tener hasta 300 caracteres.',
      }),
    ).toEqual({
      errors: {
        customerName: 'Ingresa tu nombre, con al menos 2 letras.',
        phone: 'Ingresa un celular chileno, por ejemplo 9 1234 5678.',
        zoneId: 'Elige tu sector para calcular el despacho.',
        comment: 'El comentario puede tener hasta 300 caracteres.',
      },
      unmapped: false,
    })
  })

  it('avisa si hay errores que no son de un campo del formulario', () => {
    expect(checkoutErrorsFromServer({ 'lines.0.quantity': 'La cantidad máxima es 50.' })).toEqual({ errors: {}, unmapped: true })
  })
})

describe('storeBlockMessage', () => {
  const asOf = new Date('2026-11-03T19:00:00Z') // martes 16:00 en Santiago

  it('dice cuándo abre, o que los pedidos están pausados', () => {
    expect(storeBlockMessage({ isOpen: true, nextOpening: null, ordersPaused: false, asOf })).toBeNull()
    expect(storeBlockMessage({ isOpen: false, nextOpening: new Date('2026-11-03T22:00:00Z'), ordersPaused: false, asOf })).toBe(
      'Estamos cerrados. Abrimos hoy a las 19:00.',
    )
    expect(storeBlockMessage({ isOpen: false, nextOpening: null, ordersPaused: false, asOf })).toBe('Estamos cerrados por ahora.')
    expect(storeBlockMessage({ isOpen: true, nextOpening: null, ordersPaused: true, asOf })).toBe(
      'Por ahora no estamos recibiendo pedidos. Vuelve a intentarlo en un rato.',
    )
  })
})

describe('priceChanges', () => {
  it('lista lo que cambió y el total nuevo', () => {
    const catalog = toMenuData(apiMenu())
    const before = [
      createLine(catalog, { productId: 'suprema' }, 2),
      createLine(catalog, { productId: 'jugo-mango', variantId: 'jugo-mango-1l' }),
    ].filter((line) => line !== null)
    const quote = {
      lines: [
        { productId: 'suprema', name: 'Suprema', variantLabel: null, ingredients: null, unitPrice: 13500, quantity: 2, lineTotal: 27000 },
        { productId: 'jugo-mango', name: 'Mango', variantLabel: '1 litro', ingredients: null, unitPrice: 7000, quantity: 1, lineTotal: 7000 },
      ],
      subtotal: 34000,
      deliveryFee: 2500,
      total: 36500,
    }
    expect(priceChanges(before, 2000, quote)).toEqual([
      'Suprema: $13.000 → $13.500 c/u',
      'Despacho: $2.000 → $2.500',
      'Total nuevo: $36.500',
    ])
  })
})

describe('marca de pedido enviado con código', () => {
  it('guarda el código del pedido (no es un dato personal) y lo vuelve a leer', () => {
    const mark = { sentAt: 1_700_000_000_000, cart: 'suprema||*1', code: 'RYS-0042' }
    expect(parseSentMark(serializeSentMark(mark))).toEqual(mark)
  })

  it('guarda si el pedido fue demo, solo junto con el código', () => {
    const demo = { sentAt: 1_700_000_000_000, cart: 'suprema||*1', code: 'RYS-0042', demo: true as const }
    expect(parseSentMark(serializeSentMark(demo))).toEqual(demo)
    // Sin código no hay demo de la API que recordar; un demo que no es true no vale.
    expect(JSON.parse(serializeSentMark({ sentAt: 1, cart: 'x', demo: true }))).toEqual({ sentAt: 1, cart: 'x' })
    expect(parseSentMark(JSON.stringify({ sentAt: 1, cart: 'x', demo: true }))).toBeNull()
    expect(parseSentMark(JSON.stringify({ sentAt: 1, cart: 'x', code: 'RYS-0042', demo: false }))).toBeNull()
  })

  it('rechaza un código que no tiene la forma RYS-0000 o campos de más', () => {
    expect(parseSentMark(JSON.stringify({ sentAt: 1, cart: 'x', code: 'hola' }))).toBeNull()
    expect(parseSentMark(JSON.stringify({ sentAt: 1, cart: 'x', code: 'RYS-0042', message: 'Ana' }))).toBeNull()
  })

  it('el título de la confirmación lleva el código cuando hay', () => {
    expect(sentOrderTitle(null, false)).toBe('Pedido listo')
    expect(sentOrderTitle('RYS-0042', false)).toBe('Pedido RYS-0042 creado')
    expect(sentOrderTitle('RYS-0042', true)).toBe('Pedido RYS-0042 recibido (demo)')
  })
})
