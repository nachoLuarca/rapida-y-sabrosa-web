import type { AddressInfo } from 'node:net'
import {
  adminOrderDetailSchema,
  errorResponseSchema,
  orderStreamEventSchema,
  ordersListResponseSchema,
} from '@rys/contracts'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { orders, orderStatusHistory } from '../src/db/schema/index.ts'
import { OrderRepository } from '../src/repositories/order-repository.ts'
import { createUser, deliveryOrder, login, PANEL_ORIGIN, pickupOrder, placeOrder } from './admin-helpers.ts'
import { reseed, truncateAll, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

beforeEach(async () => {
  await truncateAll(ctx.database)
  await reseed(ctx.database)
})

const errorOf = (body: unknown) => errorResponseSchema.parse(body).error

/** API con un usuario de caja con sesión iniciada. */
async function staffSession(options: Parameters<typeof ctx.container>[0] = {}) {
  const { app, bus } = ctx.container(options)
  const user = await createUser(ctx.db, 'staff', 'caja@local.test')
  const cookie = await login(app, user.email)
  return { app, bus, user, cookie }
}

const changeStatus = (app: Parameters<typeof request>[0], cookie: string, code: string, body: object, origin = PANEL_ORIGIN) =>
  request(app).patch(`/api/admin/orders/${code}/status`).set('Cookie', cookie).set('Origin', origin).send(body)

describe('GET /api/admin/orders', () => {
  it('exige sesión', async () => {
    const response = await request(ctx.app()).get('/api/admin/orders')
    expect(response.status).toBe(401)
    expect(errorOf(response.body).code).toBe('UNAUTHENTICATED')
  })

  it('lista los pedidos del más nuevo al más antiguo, con el resumen del tablero', async () => {
    const { app, cookie } = await staffSession()
    await placeOrder(app, pickupOrder)
    await placeOrder(app, deliveryOrder)

    const response = await request(app).get('/api/admin/orders').set('Cookie', cookie)
    expect(response.status).toBe(200)
    const list = ordersListResponseSchema.parse(response.body)
    expect(list).toMatchObject({ page: 1, pageSize: 50, total: 2 })
    expect(list.orders.map((order) => order.code)).toEqual(['RYS-0002', 'RYS-0001'])
    expect(list.orders[0]).toMatchObject({
      status: 'pending',
      fulfillment: 'delivery',
      zoneName: 'Islita',
      customerName: 'Ana Rojas',
      total: 41000,
      itemCount: 3,
    })
    // El tablero no necesita el teléfono ni la dirección.
    expect(JSON.stringify(list)).not.toMatch(/987654321|Aromos/)
  })

  it('filtra por estado, por fechas y por código o nombre, y pagina', async () => {
    const { app, cookie } = await staffSession()
    for (let i = 0; i < 3; i += 1) await placeOrder(app, pickupOrder)
    await placeOrder(app, deliveryOrder)
    await changeStatus(app, cookie, 'RYS-0001', { status: 'confirmed' })
    await ctx.db.update(orders).set({ createdAt: new Date('2026-11-01T15:00:00Z') }).where(eq(orders.code, 'RYS-0002'))

    const get = async (query: string) =>
      ordersListResponseSchema.parse((await request(app).get(`/api/admin/orders?${query}`).set('Cookie', cookie)).body)

    expect((await get('status=confirmed')).orders.map((o) => o.code)).toEqual(['RYS-0001'])
    expect((await get('status=pending,confirmed')).total).toBe(4)
    expect((await get('q=ana')).orders.map((o) => o.code)).toEqual(['RYS-0004'])
    expect((await get('q=rys-0003')).orders.map((o) => o.code)).toEqual(['RYS-0003'])
    // Un % en la búsqueda se busca tal cual, no como comodín.
    expect((await get('q=%25')).total).toBe(0)
    expect((await get(`to=${encodeURIComponent('2026-11-02T00:00:00.000Z')}`)).orders.map((o) => o.code)).toEqual(['RYS-0002'])
    expect((await get(`from=${encodeURIComponent('2026-11-02T00:00:00.000Z')}`)).total).toBe(3)

    const page = await get('pageSize=2&page=2')
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 4 })
    expect(page.orders).toHaveLength(2)
  })

  it('rechaza filtros inválidos', async () => {
    const { app, cookie } = await staffSession()
    const response = await request(app).get('/api/admin/orders?status=perdido&pageSize=500').set('Cookie', cookie)
    expect(response.status).toBe(400)
    expect(Object.keys(errorOf(response.body).details)).toEqual(expect.arrayContaining(['status', 'pageSize']))
  })
})

describe('GET /api/admin/orders/:code', () => {
  it('devuelve el detalle con líneas, cliente, totales, historial y lo que se puede hacer', async () => {
    const { app, cookie } = await staffSession()
    const code = await placeOrder(app, deliveryOrder)
    const response = await request(app).get(`/api/admin/orders/${code}`).set('Cookie', cookie)

    expect(response.status).toBe(200)
    const detail = adminOrderDetailSchema.parse(response.body)
    expect(detail).toMatchObject({
      code: 'RYS-0001',
      payment: 'transfer',
      customerPhone: '56987654321',
      address: 'Los Aromos 123',
      notes: 'timbre malo',
      subtotal: 39000,
      deliveryFee: 2000,
      total: 41000,
      nextStatuses: ['confirmed', 'cancelled'],
    })
    expect(detail.lines[1]).toMatchObject({
      name: 'Arma tu pizza',
      ingredients: [
        { id: 'tocino', name: 'Tocino', price: 1500, included: true },
        { id: 'choclo', name: 'Choclo', price: 1500, included: true },
      ],
    })
    expect(detail.history).toEqual([
      { fromStatus: null, toStatus: 'pending', changedBy: null, reason: null, createdAt: expect.any(String) },
    ])
  })

  it('responde 404 si el pedido no existe', async () => {
    const { app, cookie } = await staffSession()
    const response = await request(app).get('/api/admin/orders/RYS-9999').set('Cookie', cookie)
    expect(response.status).toBe(404)
    expect(errorOf(response.body)).toMatchObject({ code: 'NOT_FOUND', message: 'No existe el pedido RYS-9999.' })
  })
})

describe('PATCH /api/admin/orders/:code/status', () => {
  it('sigue la tabla de transiciones y deja cada cambio en el historial con el usuario', async () => {
    const { app, cookie, user } = await staffSession()
    const code = await placeOrder(app, pickupOrder)

    for (const status of ['confirmed', 'preparing', 'ready_for_pickup', 'delivered']) {
      const response = await changeStatus(app, cookie, code, { status })
      expect(response.status, status).toBe(200)
      expect(response.body.status).toBe(status)
    }

    const detail = adminOrderDetailSchema.parse((await request(app).get(`/api/admin/orders/${code}`).set('Cookie', cookie)).body)
    expect(detail.history.map((entry) => [entry.fromStatus, entry.toStatus, entry.changedBy?.name ?? null])).toEqual([
      [null, 'pending', null],
      ['pending', 'confirmed', 'Caja'],
      ['confirmed', 'preparing', 'Caja'],
      ['preparing', 'ready_for_pickup', 'Caja'],
      ['ready_for_pickup', 'delivered', 'Caja'],
    ])
    expect(detail.history[1].changedBy?.id).toBe(user.id)
    expect(detail.nextStatuses).toEqual([])
  })

  it('rechaza transiciones inválidas con 409 INVALID_TRANSITION, sin cambiar nada', async () => {
    const { app, cookie } = await staffSession()
    const pickupCode = await placeOrder(app, pickupOrder)
    const deliveryCode = await placeOrder(app, deliveryOrder)

    const skip = await changeStatus(app, cookie, pickupCode, { status: 'delivered' })
    expect(skip.status).toBe(409)
    expect(errorOf(skip.body)).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'Un pedido "Pendiente" no puede pasar a "Entregado".',
    })

    // "Listo para retiro" no existe para un despacho.
    await changeStatus(app, cookie, deliveryCode, { status: 'confirmed' })
    await changeStatus(app, cookie, deliveryCode, { status: 'preparing' })
    expect((await changeStatus(app, cookie, deliveryCode, { status: 'ready_for_pickup' })).status).toBe(409)

    const [row] = await ctx.db.select().from(orders).where(eq(orders.code, pickupCode))
    expect(row?.status).toBe('pending')
    expect(await ctx.db.$count(orderStatusHistory, eq(orderStatusHistory.orderId, row?.id ?? ''))).toBe(1)
  })

  it('cancelar exige un motivo; con motivo queda en el historial', async () => {
    const { app, cookie } = await staffSession()
    const code = await placeOrder(app, pickupOrder)

    for (const body of [{ status: 'cancelled' }, { status: 'cancelled', reason: '   ' }]) {
      const response = await changeStatus(app, cookie, code, body)
      expect(response.status).toBe(400)
      expect(errorOf(response.body)).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { reason: 'Indica el motivo de la cancelación.' },
      })
    }

    const cancelled = await changeStatus(app, cookie, code, { status: 'cancelled', reason: ' Se acabó la masa ' })
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.history.at(-1)).toMatchObject({ toStatus: 'cancelled', reason: 'Se acabó la masa' })
    // Cancelado es final.
    expect((await changeStatus(app, cookie, code, { status: 'pending' })).status).toBe(409)
  })

  it('si dos personas aprietan Confirmar a la vez, solo una lo cambia y la otra recibe 409', async () => {
    const { app, cookie } = await staffSession()
    const code = await placeOrder(app, pickupOrder)
    const results = await Promise.all([
      changeStatus(app, cookie, code, { status: 'confirmed' }),
      changeStatus(app, cookie, code, { status: 'confirmed' }),
    ])
    expect(results.map((response) => response.status).sort()).toEqual([200, 409])
    const [row] = await ctx.db.select().from(orders).where(eq(orders.code, code))
    expect(await ctx.db.$count(orderStatusHistory, eq(orderStatusHistory.orderId, row?.id ?? ''))).toBe(2)
  })

  it('desde un origen ajeno responde 403 INVALID_ORIGIN y no cambia nada', async () => {
    const { app, cookie } = await staffSession()
    const code = await placeOrder(app, pickupOrder)
    const response = await changeStatus(app, cookie, code, { status: 'confirmed' }, 'https://ajeno.example')
    expect(response.status).toBe(403)
    expect(errorOf(response.body).code).toBe('INVALID_ORIGIN')
    const [row] = await ctx.db.select().from(orders).where(eq(orders.code, code))
    expect(row?.status).toBe('pending')
  })

  it('valida el body y exige sesión', async () => {
    const { app, cookie } = await staffSession()
    const code = await placeOrder(app, pickupOrder)
    expect((await changeStatus(app, cookie, code, { status: 'perdido' })).status).toBe(400)
    expect((await changeStatus(app, '', code, { status: 'confirmed' })).status).toBe(401)
    expect((await changeStatus(app, cookie, 'RYS-9999', { status: 'confirmed' })).status).toBe(404)
  })
})

describe('GET /api/admin/orders/stream (SSE)', () => {
  /** Abre el stream contra un servidor de verdad y junta lo que llega. */
  async function openStream(app: Parameters<typeof request>[0] & { listen: (port: number) => import('node:http').Server }, cookie: string) {
    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    const abort = new AbortController()
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/orders/stream`, {
      headers: { Cookie: cookie },
      signal: abort.signal,
    })
    let text = ''
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    const pump = (async () => {
      try {
        for (;;) {
          const chunk = await reader?.read()
          if (!chunk || chunk.done) return
          text += decoder.decode(chunk.value, { stream: true })
        }
      } catch {
        // Se cerró al terminar el test.
      }
    })()
    const waitFor = async (predicate: (text: string) => boolean) => {
      const start = Date.now()
      while (!predicate(text)) {
        if (Date.now() - start > 5000) throw new Error(`No llegó lo esperado. Llegó:\n${text}`)
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }
    const close = async () => {
      abort.abort()
      await pump
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    return { response, waitFor, close, text: () => text }
  }

  const events = (text: string) =>
    [...text.matchAll(/event: (.+)\ndata: (.+)\n\n/g)].map(([, event, data]) => ({ event, data: orderStreamEventSchema.parse(JSON.parse(data)) }))

  it('manda order.created al llegar un pedido y order.updated al cambiar de estado, con heartbeat', async () => {
    const { app, cookie } = await staffSession({ heartbeatMs: 50 })
    const stream = await openStream(app, cookie)
    try {
      expect(stream.response.status).toBe(200)
      expect(stream.response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
      await stream.waitFor((text) => text.startsWith('retry: 3000\n\n'))

      const code = await placeOrder(app, pickupOrder)
      await stream.waitFor((text) => text.includes('event: order.created'))
      await changeStatus(app, cookie, code, { status: 'confirmed' })
      await stream.waitFor((text) => text.includes('event: order.updated'))
      await stream.waitFor((text) => text.includes(': ping\n\n'))

      expect(events(stream.text())).toEqual([
        { event: 'order.created', data: { code: 'RYS-0001', status: 'pending', fulfillment: 'pickup', total: 13000, createdAt: expect.any(String) } },
        { event: 'order.updated', data: expect.objectContaining({ code: 'RYS-0001', status: 'confirmed' }) },
      ])
      // Solo el resumen: nada del cliente.
      expect(stream.text()).not.toMatch(/Juan|912345678/)
    } finally {
      await stream.close()
    }
  })

  it('exige sesión', async () => {
    const response = await request(ctx.app()).get('/api/admin/orders/stream')
    expect(response.status).toBe(401)
  })

  it('al cerrarse la conexión deja de escuchar el bus', async () => {
    const { app, bus, cookie } = await staffSession()
    const stream = await openStream(app, cookie)
    await stream.waitFor((text) => text.includes('retry:'))
    const listeners = () => (bus as unknown as { emitter: { listenerCount: (event: string) => number } }).emitter.listenerCount('order.created')
    expect(listeners()).toBe(1)
    await stream.close()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(listeners()).toBe(0)
  })
})

describe('OrderRepository.transition', () => {
  it('no cambia nada si el pedido ya no está en el estado que se leyó (compare-and-set)', async () => {
    const { app, user } = await staffSession()
    const code = await placeOrder(app, pickupOrder)
    const [row] = await ctx.db.select().from(orders).where(eq(orders.code, code))
    const repository = new OrderRepository(ctx.db)
    const change = { orderId: row?.id ?? '', changedBy: user.id, reason: null, now: new Date() }

    expect(await repository.transition({ ...change, from: 'pending', to: 'confirmed' })).toBe(true)
    // Otro usuario leyó "pendiente" antes del cambio: su intento ya no aplica.
    expect(await repository.transition({ ...change, from: 'pending', to: 'cancelled' })).toBe(false)
    const [after] = await ctx.db.select().from(orders).where(eq(orders.code, code))
    expect(after?.status).toBe('confirmed')
    expect(await ctx.db.$count(orderStatusHistory, eq(orderStatusHistory.orderId, row?.id ?? ''))).toBe(2)
  })
})
