import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import {
  errorResponseSchema,
  orderResponseSchema,
  priceChangedDetailsSchema,
  type OpeningHoursDto,
  type OrderRequest,
} from '@rys/contracts'
import { CHECKOUT_MESSAGES } from '@rys/domain'
import { asc, eq } from 'drizzle-orm'
import { pino } from 'pino'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createContainer } from '../src/container.ts'
import {
  deliveryZones,
  ingredients,
  orderLines,
  orders,
  orderStatusHistory,
  products,
  productVariants,
  settings,
} from '../src/db/schema/index.ts'
import type { OrderEventPayload } from '../src/events/event-bus.ts'
import { isIdempotencyConflict, OrderRepository } from '../src/repositories/order-repository.ts'
import { reseed, truncateAll, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

// Cada test parte con la carta de docs/data y sin pedidos (los códigos vuelven a RYS-0001).
beforeEach(async () => {
  await truncateAll(ctx.database)
  await reseed(ctx.database)
})

/** El ejemplo de docs/SPEC.md: 2 Supremas, un jugo de mango de 1 litro y una Arma tu pizza, a Islita. */
const deliveryOrder: OrderRequest = {
  lines: [
    { productId: 'suprema', quantity: 2 },
    { productId: 'jugo-mango', variantId: 'jugo-mango-1l', quantity: 1 },
    { productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'], quantity: 1 },
  ],
  customer: { name: 'Ana Pérez', phone: '9 1234 5678' },
  fulfillment: 'delivery',
  zoneId: 'islita',
  address: 'Los Aromos 123',
  payment: 'transfer',
  notes: 'sin cebolla',
  expectedTotal: 48000,
  website: '',
}

const pickupOrder: OrderRequest = {
  lines: [{ productId: 'suprema', quantity: 1 }],
  customer: { name: 'Juan', phone: '+56 9 8765 4321' },
  fulfillment: 'pickup',
  payment: 'cash',
  expectedTotal: 13000,
}

function post(body: unknown, key: string | null = randomUUID(), app = ctx.app()) {
  const req = request(app).post('/api/orders').send(body as object)
  return key === null ? req : req.set('Idempotency-Key', key)
}

const errorOf = (body: unknown) => errorResponseSchema.parse(body).error
const countOrders = () => ctx.db.$count(orders)

describe('POST /api/orders: pedido creado', () => {
  it('crea el pedido del ejemplo con despacho: 201, código, totales, mensaje y enlace de WhatsApp', async () => {
    const response = await post(deliveryOrder)
    expect(response.status).toBe(201)
    const order = orderResponseSchema.parse(response.body)
    expect(response.body).toEqual(order)
    expect(order).toMatchObject({
      code: 'RYS-0001',
      status: 'pending',
      subtotal: 46000,
      deliveryFee: 2000,
      total: 48000,
      demo: false,
    })
    expect(order.lines).toEqual([
      { productId: 'suprema', name: 'Suprema', variantLabel: null, ingredients: null, unitPrice: 13000, quantity: 2, lineTotal: 26000 },
      { productId: 'jugo-mango', name: 'Mango', variantLabel: '1 litro', ingredients: null, unitPrice: 7000, quantity: 1, lineTotal: 7000 },
      {
        productId: 'arma-tu-pizza',
        name: 'Arma tu pizza',
        variantLabel: null,
        ingredients: [
          { id: 'tocino', name: 'Tocino', price: 1500, included: true },
          { id: 'choclo', name: 'Choclo', price: 1500, included: true },
        ],
        unitPrice: 13000,
        quantity: 1,
        lineTotal: 13000,
      },
    ])
    expect(order.message).toBe(
      [
        '*Nuevo pedido RYS-0001 — Rápida y Sabrosa*',
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
    expect(order.whatsappUrl).toBe(`https://wa.me/56974314602?text=${encodeURIComponent(order.message)}`)
  })

  it('guarda el pedido, sus líneas y el primer estado del historial, con el celular normalizado', async () => {
    const key = randomUUID()
    await post(deliveryOrder, key)

    const [row] = await ctx.db.select().from(orders)
    expect(row).toMatchObject({
      code: 'RYS-0001',
      status: 'pending',
      fulfillment: 'delivery',
      zoneId: 'islita',
      zoneName: 'Islita',
      deliveryFee: 2000,
      subtotal: 46000,
      total: 48000,
      payment: 'transfer',
      customerName: 'Ana Pérez',
      customerPhone: '56912345678',
      address: 'Los Aromos 123',
      notes: 'sin cebolla',
      idempotencyKey: key,
    })
    const lines = await ctx.db.select().from(orderLines).orderBy(asc(orderLines.position))
    expect(lines.map((line) => [line.position, line.productId, line.quantity, line.lineTotal])).toEqual([
      [0, 'suprema', 2, 26000],
      [1, 'jugo-mango', 1, 7000],
      [2, 'arma-tu-pizza', 1, 13000],
    ])
    const history = await ctx.db.select().from(orderStatusHistory)
    expect(history).toMatchObject([{ orderId: row?.id, fromStatus: null, toStatus: 'pending', changedBy: null }])
  })

  it('crea un retiro sin despacho, y numera los pedidos seguidos', async () => {
    await post(pickupOrder)
    const response = await post({ ...pickupOrder, customer: { name: 'Otra persona', phone: '912345678' } })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ code: 'RYS-0002', deliveryFee: 0, total: 13000 })
    expect(response.body.message).toContain('*Retiro en local*\nPago: Efectivo')
    const [row] = await ctx.db.select().from(orders).where(eq(orders.code, 'RYS-0002'))
    expect(row).toMatchObject({ zoneId: null, zoneName: null, address: null, notes: null })
  })

  it('publica order.created en el bus con el resumen del pedido, sin datos del cliente', async () => {
    const { app, bus } = ctx.container()
    const events: OrderEventPayload[] = []
    bus.subscribe('order.created', (payload) => events.push(payload))

    await post(deliveryOrder, randomUUID(), app)

    expect(events).toEqual([
      {
        id: expect.any(String),
        code: 'RYS-0001',
        status: 'pending',
        fulfillment: 'delivery',
        total: 48000,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ])
    expect(JSON.stringify(events)).not.toMatch(/Ana|5691234/)
  })

  it('en modo demo guarda el pedido, pero responde demo: true y sin enlace de WhatsApp', async () => {
    const response = await post(pickupOrder, randomUUID(), ctx.app({ demoMode: true }))
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ code: 'RYS-0001', demo: true, whatsappUrl: null })
    expect(response.body.message).toContain('*Nuevo pedido RYS-0001 — Rápida y Sabrosa*')
    expect(await countOrders()).toBe(1)
  })
})

describe('POST /api/orders: validación (regla 1)', () => {
  it('exige el header Idempotency-Key con un uuid', async () => {
    for (const key of [null, 'pedido-1']) {
      const response = await post(pickupOrder, key)
      expect(response.status).toBe(400)
      expect(errorOf(response.body)).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { 'Idempotency-Key': 'Falta el header Idempotency-Key (un uuid por intento).' },
      })
    }
    expect(await countOrders()).toBe(0)
  })

  it('responde los errores por campo con los mismos mensajes del checkout de la web', async () => {
    const response = await post({
      ...deliveryOrder,
      customer: { name: 'A', phone: '1234' },
      zoneId: '',
      address: 'ab',
      payment: 'bitcoin',
    })
    expect(response.status).toBe(400)
    expect(errorOf(response.body)).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Revisa los datos del pedido.',
      details: {
        'customer.name': CHECKOUT_MESSAGES.customerName,
        'customer.phone': CHECKOUT_MESSAGES.phoneInvalid,
        zoneId: CHECKOUT_MESSAGES.zoneId,
        address: CHECKOUT_MESSAGES.address,
        payment: CHECKOUT_MESSAGES.payment,
      },
    })
  })

  it('rechaza cantidades fuera de 1 a 50 y más de 30 líneas', async () => {
    const tooMany = await post({ ...pickupOrder, quantity: 1, lines: Array.from({ length: 31 }, () => pickupOrder.lines[0]) })
    expect(errorOf(tooMany.body).details).toHaveProperty('lines')
    const big = await post({ ...pickupOrder, lines: [{ productId: 'suprema', quantity: 51 }] })
    expect(errorOf(big.body).details).toEqual({ 'lines.0.quantity': 'La cantidad máxima es 50.' })
    expect(await countOrders()).toBe(0)
  })
})

describe('POST /api/orders: campo trampa (regla 2)', () => {
  it('con el honeypot lleno responde 400 genérico y no crea nada', async () => {
    const response = await post({ ...pickupOrder, website: 'http://spam.example' })
    expect(response.status).toBe(400)
    expect(errorOf(response.body)).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'No pudimos procesar el pedido.',
      details: {},
    })
    expect(await countOrders()).toBe(0)
  })
})

describe('POST /api/orders: idempotencia (regla 3)', () => {
  it('el mismo Idempotency-Key con el mismo body responde 200 con el mismo pedido', async () => {
    const key = randomUUID()
    const first = await post(deliveryOrder, key)
    // El mismo body, con las claves en otro orden y textos con espacios de más: es el mismo pedido.
    const { lines, ...rest } = deliveryOrder
    const second = await post({ ...rest, customer: { phone: '912345678', name: ' Ana Pérez ' }, lines }, key)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(await countOrders()).toBe(1)
  })

  it('el mismo Idempotency-Key con otro body responde 422 y no crea otro pedido', async () => {
    const key = randomUUID()
    await post(deliveryOrder, key)
    const response = await post({ ...deliveryOrder, notes: 'con extra queso' }, key)
    expect(response.status).toBe(422)
    expect(errorOf(response.body).code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect(await countOrders()).toBe(1)
  })

  it('dos requests simultáneos con la misma clave crean un solo pedido', async () => {
    const key = randomUUID()
    const app = ctx.app()
    const responses = await Promise.all([post(deliveryOrder, key, app), post(deliveryOrder, key, app)])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201])
    expect(responses[0].body.code).toBe(responses[1].body.code)
    expect(await countOrders()).toBe(1)
    expect(await ctx.db.$count(orderLines)).toBe(3)
  })

  it('el reintento devuelve el mismo pedido aunque después se haya pausado el local o cambiado la carta', async () => {
    const key = randomUUID()
    const first = await post(pickupOrder, key)
    await ctx.db.update(settings).set({ ordersPaused: true })
    await ctx.db.update(products).set({ price: 15000, available: false }).where(eq(products.id, 'suprema'))

    const retry = await post(pickupOrder, key)
    expect(retry.status).toBe(200)
    expect(retry.body).toEqual(first.body)
  })
})

describe('POST /api/orders: local cerrado o pausado (regla 4)', () => {
  const tuesdayEvenings: OpeningHoursDto = { mon: [], tue: [['19:00', '23:30']], wed: [], thu: [], fri: [], sat: [], sun: [] }

  it('con los pedidos pausados responde 409 ORDERS_PAUSED y no crea nada', async () => {
    await ctx.db.update(settings).set({ ordersPaused: true })
    const response = await post(pickupOrder)
    expect(response.status).toBe(409)
    expect(errorOf(response.body)).toMatchObject({
      code: 'ORDERS_PAUSED',
      message: 'Por ahora no estamos recibiendo pedidos. Intenta de nuevo en un rato.',
      details: { nextOpening: null },
    })
    expect(await countOrders()).toBe(0)
  })

  it('con el local cerrado responde 409 STORE_CLOSED con la próxima apertura', async () => {
    await ctx.db.update(settings).set({ openingHours: tuesdayEvenings })
    // Martes 3 de noviembre de 2026, 16:00 en Santiago.
    const clock = () => new Date('2026-11-03T19:00:00Z')
    const response = await post(pickupOrder, randomUUID(), ctx.app({ clock }))
    expect(response.status).toBe(409)
    expect(errorOf(response.body)).toMatchObject({
      code: 'STORE_CLOSED',
      message: 'Estamos cerrados. Abrimos hoy a las 19:00.',
      details: { nextOpening: '2026-11-03T22:00:00.000Z' },
    })
    expect(await countOrders()).toBe(0)
  })

  it('con el local abierto según el horario, crea el pedido', async () => {
    await ctx.db.update(settings).set({ openingHours: tuesdayEvenings })
    const clock = () => new Date('2026-11-03T23:00:00Z') // martes 20:00
    expect((await post(pickupOrder, randomUUID(), ctx.app({ clock }))).status).toBe(201)
  })
})

describe('POST /api/orders: disponibilidad (regla 5)', () => {
  async function expectUnavailable(body: unknown, details: object) {
    const response = await post(body)
    expect(response.status).toBe(409)
    expect(errorOf(response.body)).toMatchObject({ code: 'PRODUCT_UNAVAILABLE', details })
    expect(await countOrders()).toBe(0)
  }

  it('un producto agotado', async () => {
    await ctx.db.update(products).set({ available: false }).where(eq(products.id, 'suprema'))
    await expectUnavailable(deliveryOrder, { productIds: ['suprema'], variantIds: [], ingredientIds: [] })
  })

  it('un producto que no existe', async () => {
    await expectUnavailable(
      { ...pickupOrder, expectedTotal: 0, lines: [{ productId: 'pizza-fantasma', quantity: 1 }] },
      { productIds: ['pizza-fantasma'] },
    )
  })

  it('una variante que no es de ese producto', async () => {
    await expectUnavailable(
      { ...pickupOrder, lines: [{ productId: 'jugo-mango', variantId: 'jugo-pina-1l', quantity: 1 }] },
      { variantIds: ['jugo-pina-1l'] },
    )
  })

  it('un ingrediente agotado o que no existe en Arma tu pizza', async () => {
    await ctx.db.update(ingredients).set({ available: false }).where(eq(ingredients.id, 'tocino'))
    await expectUnavailable(
      { ...pickupOrder, lines: [{ productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'caviar'], quantity: 1 }] },
      { productIds: [], ingredientIds: ['caviar', 'tocino'] },
    )
  })

  it('ingredientes en un producto que no es Arma tu pizza', async () => {
    await expectUnavailable(
      { ...pickupOrder, lines: [{ productId: 'suprema', ingredientIds: ['tocino'], quantity: 1 }] },
      { productIds: ['suprema'] },
    )
  })

  it('Arma tu pizza agotada', async () => {
    await ctx.db.update(products).set({ available: false }).where(eq(products.id, 'arma-tu-pizza'))
    await expectUnavailable(deliveryOrder, { productIds: ['arma-tu-pizza'] })
  })

  it('una zona desactivada es un error del campo zoneId', async () => {
    await ctx.db.update(deliveryZones).set({ active: false }).where(eq(deliveryZones.id, 'islita'))
    const response = await post(deliveryOrder)
    expect(response.status).toBe(400)
    expect(errorOf(response.body)).toMatchObject({ code: 'VALIDATION_ERROR', details: { zoneId: CHECKOUT_MESSAGES.zoneId } })
    expect(await countOrders()).toBe(0)
  })
})

describe('POST /api/orders: precio (reglas 6 y 7)', () => {
  it('un total manipulado responde 409 PRICE_CHANGED con la cotización real y no crea nada', async () => {
    const response = await post({ ...deliveryOrder, expectedTotal: 1000 })
    expect(response.status).toBe(409)
    const error = errorOf(response.body)
    expect(error.code).toBe('PRICE_CHANGED')
    const { quote } = priceChangedDetailsSchema.parse(error.details)
    expect(quote).toMatchObject({ subtotal: 46000, deliveryFee: 2000, total: 48000 })
    expect(quote.lines.map((line) => line.lineTotal)).toEqual([26000, 7000, 13000])
    expect(await countOrders()).toBe(0)
  })

  it('si el precio cambió desde que el cliente vio la carta, avisa con los precios nuevos', async () => {
    await ctx.db.update(products).set({ price: 13500 }).where(eq(products.id, 'suprema'))
    await ctx.db.update(productVariants).set({ price: 7500 }).where(eq(productVariants.id, 'jugo-mango-1l'))
    await ctx.db.update(deliveryZones).set({ fee: 2500 }).where(eq(deliveryZones.id, 'islita'))

    const response = await post(deliveryOrder)
    const { quote } = priceChangedDetailsSchema.parse(errorOf(response.body).details)
    expect(quote).toMatchObject({ subtotal: 47500, deliveryFee: 2500, total: 50000 })
    expect(quote.lines[0]).toMatchObject({ unitPrice: 13500, lineTotal: 27000 })

    // Con el total nuevo, el pedido se crea.
    expect((await post({ ...deliveryOrder, expectedTotal: 50000 })).status).toBe(201)
  })

  it('cobra Arma tu pizza con los precios de los ajustes: la promoción cubre los 3 más caros', async () => {
    const response = await post({
      ...pickupOrder,
      lines: [{ productId: 'arma-tu-pizza', ingredientIds: ['camaron-ecuatoriano', 'tocino', 'choclo', 'palta'], quantity: 1 }],
      expectedTotal: 14500,
    })
    expect(response.status).toBe(201)
    expect(response.body.lines[0].ingredients.map((i: { id: string; included: boolean }) => [i.id, i.included])).toEqual([
      ['camaron-ecuatoriano', true],
      ['tocino', true],
      ['choclo', true],
      ['palta', false],
    ])
  })
})

describe('POST /api/orders: snapshots', () => {
  it('el pedido guardado no cambia cuando cambia la carta', async () => {
    const key = randomUUID()
    const created = await post(deliveryOrder, key)
    const before = await ctx.db.select().from(orderLines).orderBy(asc(orderLines.position))

    await ctx.db.update(products).set({ name: 'Suprema nueva', price: 20000 }).where(eq(products.id, 'suprema'))
    await ctx.db.update(productVariants).set({ label: '1 L', price: 9000 }).where(eq(productVariants.id, 'jugo-mango-1l'))
    await ctx.db.update(ingredients).set({ name: 'Tocino ahumado', price: 3000 }).where(eq(ingredients.id, 'tocino'))
    await ctx.db.update(deliveryZones).set({ name: 'Islita norte', fee: 5000 }).where(eq(deliveryZones.id, 'islita'))
    await ctx.db.update(settings).set({ buildPizzaPromoPrice: 20000 })

    expect(await ctx.db.select().from(orderLines).orderBy(asc(orderLines.position))).toEqual(before)
    const [row] = await ctx.db.select().from(orders)
    expect(row).toMatchObject({ zoneName: 'Islita', deliveryFee: 2000, total: 48000 })
    // El reintento arma la respuesta desde lo guardado: el mismo pedido y el mismo mensaje.
    const retry = await post(deliveryOrder, key)
    expect(retry.body).toEqual(created.body)
  })
})

describe('POST /api/orders: rate limit', () => {
  it('permite 10 pedidos por IP cada 10 minutos; el 11.º responde 429 con Retry-After', async () => {
    const app = ctx.app()
    for (let i = 0; i < 10; i += 1) {
      expect((await post({}, randomUUID(), app)).status).toBe(400)
    }
    const blocked = await post(pickupOrder, randomUUID(), app)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect(errorOf(blocked.body)).toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Hiciste muchos pedidos seguidos. Espera unos minutos y vuelve a intentarlo.',
    })
    expect(await countOrders()).toBe(0)
  })

  it('cuenta por la IP real que informa el proxy local (X-Forwarded-For)', async () => {
    const app = ctx.app({ routes: { orderRateLimit: { limit: 1, windowMs: 60_000 } } })
    const fromPhone = (ip: string) => post(pickupOrder, randomUUID(), app).set('X-Forwarded-For', ip)
    expect((await fromPhone('192.168.1.20')).status).toBe(201)
    expect((await fromPhone('192.168.1.20')).status).toBe(429)
    expect((await fromPhone('192.168.1.21')).status).toBe(201)
  })
})

describe('logs', () => {
  it('registran el código del pedido, pero nunca el nombre, el celular, la dirección ni el body', async () => {
    const output: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, done) {
        output.push(String(chunk))
        done()
      },
    })
    const app = createApp({
      controllers: createContainer({ database: ctx.database }).controllers,
      logger: pino({ level: 'info' }, stream),
    })

    await post(deliveryOrder, randomUUID(), app)
    await post({ ...deliveryOrder, customer: { name: 'Ana Pérez', phone: 'malo' } }, randomUUID(), app)

    const logs = output.join('')
    expect(logs).toContain('"orderCode":"RYS-0001"')
    expect(logs).not.toMatch(/Ana|Pérez|56912345678|1234 5678|Aromos|cebolla/)
  })
})

describe('GET /api/docs', () => {
  it('sirve el OpenAPI solo cuando está activado (desarrollo)', async () => {
    const docs = await request(ctx.app({ routes: { docs: true } })).get('/api/docs')
    expect(docs.status).toBe(200)
    expect(docs.body).toMatchObject({ openapi: '3.1.0', paths: { '/api/orders': expect.any(Object) } })
    expect((await request(ctx.app()).get('/api/docs')).status).toBe(404)
  })
})

describe('OrderRepository', () => {
  it('reconoce el choque de Idempotency-Key cuando dos inserciones llegan a la vez', async () => {
    const repository = new OrderRepository(ctx.db)
    const key = randomUUID()
    const order = {
      fulfillment: 'pickup' as const,
      deliveryFee: 0,
      subtotal: 13000,
      total: 13000,
      payment: 'cash' as const,
      customerName: 'Ana',
      customerPhone: '56912345678',
      idempotencyKey: key,
      requestHash: 'hash',
    }
    const line = { position: 0, productId: 'suprema', productName: 'Suprema', unitPrice: 13000, quantity: 1, lineTotal: 13000 }

    const results = await Promise.allSettled([repository.create(order, [line]), repository.create(order, [line])])
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(isIdempotencyConflict((rejected[0] as PromiseRejectedResult).reason)).toBe(true)
    expect(isIdempotencyConflict(new Error('otro error'))).toBe(false)
    // La transacción que perdió no deja líneas ni historial sueltos.
    expect(await ctx.db.$count(orderLines)).toBe(1)
    expect(await ctx.db.$count(orderStatusHistory)).toBe(1)
  })
})
