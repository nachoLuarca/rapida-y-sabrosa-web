import { describe, expect, it } from 'vitest'
import { createLine, type OrderDetails } from '@rys/domain'
import { toMenuData } from '../domain/menu-adapter'
import { apiMenu } from '../test/api-menu'
import { apiError, createdOrder, createFakeApi } from '../test/api-fake'
import { createStaticCatalogSource } from './catalog-source'
import { toOrderRequest, type OrderSubmission } from './order-gateway'

const catalog = toMenuData(apiMenu())
const suprema = createLine(catalog, { productId: 'suprema' })!
const pizza = createLine(catalog, { productId: 'arma-tu-pizza', ingredientIds: ['tocino'] })!
const pickup: OrderDetails = { customerName: 'Ana', phone: '56912345678', fulfillment: { type: 'pickup' }, payment: 'Efectivo' }
const submission: OrderSubmission = { lines: [suprema], order: pickup, honeypot: '' }

describe('createStaticCatalogSource', () => {
  it('trae la carta lista desde el primer render y no se recarga', async () => {
    const source = createStaticCatalogSource()
    expect(source.initial?.products.length).toBeGreaterThan(0)
    expect(source.refreshes).toBe(false)
    expect(await source.load()).toBe(source.initial)
  })
})

describe('createApiCatalogSource', () => {
  it('pide GET /api/menu y después usa el ETag: si no cambió (304), reusa la carta', async () => {
    const api = createFakeApi()
    const { catalog: real } = api.sources()
    const first = await real.load()
    const second = await real.load()
    expect(second).toBe(first)
    const [initial, conditional] = api.menuRequests()
    expect(initial.headers['If-None-Match']).toBeUndefined()
    expect(conditional.headers['If-None-Match']).toMatch(/^".+"$/)
  })

  it('si la carta cambió, trae la nueva', async () => {
    const api = createFakeApi()
    const { catalog: source } = api.sources()
    await source.load()
    api.updateMenu((menu) => {
      menu.categories[0].products[0].price = 13500
    })
    expect((await source.load()).products[0]).toMatchObject({ id: 'suprema', price: 13500 })
  })

  it('falla si la API no responde o responde algo que no cumple el contrato', async () => {
    const api = createFakeApi()
    api.setMenuDown(true)
    await expect(api.sources().catalog.load()).rejects.toThrow()

    const broken = createFakeApi({ ...apiMenu(), zones: [{ id: 'x', name: 'X', fee: -1 }] })
    await expect(broken.sources().catalog.load()).rejects.toThrow()
  })
})

describe('toOrderRequest', () => {
  it('manda qué se pide, el total que se vio y la forma de pago como código, nunca precios por línea', () => {
    expect(toOrderRequest({ lines: [suprema, pizza], order: { ...pickup, comment: 'sin cebolla' }, honeypot: '' })).toEqual({
      lines: [
        { productId: 'suprema', quantity: 1 },
        { productId: 'arma-tu-pizza', ingredientIds: ['tocino'], quantity: 1 },
      ],
      customer: { name: 'Ana', phone: '56912345678' },
      payment: 'cash',
      notes: 'sin cebolla',
      // Arma tu pizza con un ingrediente va a precio base: $10.900 + $1.500, más barato que la promoción.
      expectedTotal: 13000 + 12400,
      website: '',
      fulfillment: 'pickup',
    })
  })

  it('con despacho manda la zona, la dirección y el total con despacho', () => {
    const delivery: OrderDetails = {
      ...pickup,
      fulfillment: { type: 'delivery', zone: { id: 'islita', name: 'Islita', fee: 2000 }, address: 'Los Aromos 123' },
      payment: 'Transferencia',
    }
    expect(toOrderRequest({ lines: [suprema], order: delivery, honeypot: '' })).toMatchObject({
      fulfillment: 'delivery',
      zoneId: 'islita',
      address: 'Los Aromos 123',
      payment: 'transfer',
      expectedTotal: 15000,
    })
  })
})

describe('createApiOrderGateway', () => {
  it('crea el pedido con un Idempotency-Key uuid', async () => {
    const api = createFakeApi()
    const outcome = await api.sources().orders.submit(submission)
    expect(outcome).toEqual({ kind: 'created', order: expect.objectContaining({ code: 'RYS-0042', demo: false }) })
    expect(api.orderRequests()[0].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('si se cae la red, el reintento con los mismos datos usa la misma clave; un pedido nuevo usa otra', async () => {
    const api = createFakeApi()
    api.replyToOrders('network-error', createdOrder())
    const { orders } = api.sources()

    expect(await orders.submit(submission)).toMatchObject({ kind: 'failed' })
    expect(await orders.submit(submission)).toMatchObject({ kind: 'created' })
    await orders.submit(submission)

    const keys = api.orderRequests().map((request) => request.headers['Idempotency-Key'])
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
  })

  it('traduce cada error de la API para el formulario', async () => {
    const api = createFakeApi()
    const quote = { lines: [], subtotal: 13500, deliveryFee: 0, total: 13500 }
    api.replyToOrders(
      apiError(400, 'VALIDATION_ERROR', 'Revisa los datos del pedido.', { 'customer.phone': 'Ingresa un celular chileno.' }),
      apiError(409, 'PRICE_CHANGED', 'Cambiaron algunos precios.', { quote }),
      apiError(409, 'PRODUCT_UNAVAILABLE', 'Se agotó.', { productIds: ['suprema'], variantIds: [], ingredientIds: [] }),
      apiError(409, 'STORE_CLOSED', 'Estamos cerrados.', { nextOpening: '2026-11-03T22:00:00.000Z' }),
      apiError(429, 'RATE_LIMITED', 'Hiciste muchos pedidos seguidos.'),
      { status: 500, body: 'no es json de error' },
    )
    const { orders } = api.sources()
    expect(await orders.submit(submission)).toEqual({
      kind: 'validation',
      errors: { phone: 'Ingresa un celular chileno.' },
      message: 'Revisa los datos marcados.',
    })
    expect(await orders.submit(submission)).toEqual({ kind: 'price-changed', quote, message: 'Cambiaron algunos precios.' })
    expect(await orders.submit(submission)).toMatchObject({ kind: 'unavailable', items: { productIds: ['suprema'] } })
    expect(await orders.submit(submission)).toEqual({
      kind: 'blocked',
      reason: 'STORE_CLOSED',
      nextOpening: new Date('2026-11-03T22:00:00.000Z'),
      message: 'Estamos cerrados.',
    })
    expect(await orders.submit(submission)).toEqual({ kind: 'failed', message: 'Hiciste muchos pedidos seguidos.' })
    expect(await orders.submit(submission)).toEqual({
      kind: 'failed',
      message: 'No pudimos enviar tu pedido. Inténtalo de nuevo en unos minutos.',
    })
  })
})
