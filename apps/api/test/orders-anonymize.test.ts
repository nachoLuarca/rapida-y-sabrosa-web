import { adminOrderDetailSchema } from '@rys/contracts'
import { eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { orderLines, orders, orderStatusHistory } from '../src/db/schema/index.ts'
import { OrderRepository } from '../src/repositories/order-repository.ts'
import { ANONYMIZED, OrderPrivacyService } from '../src/services/order-privacy-service.ts'
import { createUser, deliveryOrder, login, pickupOrder, placeOrder } from './admin-helpers.ts'
import { reseed, truncateAll, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

const NOW = new Date('2026-11-11T15:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

beforeEach(async () => {
  await truncateAll(ctx.database)
  await reseed(ctx.database)
})

const service = () => new OrderPrivacyService(new OrderRepository(ctx.db), () => NOW)
const backdate = (code: string, date: Date) => ctx.db.update(orders).set({ createdAt: date }).where(eq(orders.code, code))
const orderByCode = async (code: string) => (await ctx.db.select().from(orders).where(eq(orders.code, code)))[0]

/** Tres pedidos: un despacho de hace 120 días, un retiro de hace 91 y un retiro de hace 10. */
async function threeOrders() {
  const app = ctx.app()
  await placeOrder(app, deliveryOrder)
  await placeOrder(app, pickupOrder)
  await placeOrder(app, pickupOrder)
  await backdate('RYS-0001', daysAgo(120))
  await backdate('RYS-0002', daysAgo(91))
  await backdate('RYS-0003', daysAgo(10))
  return app
}

describe('orders:anonymize', () => {
  it('reemplaza nombre, celular, dirección y comentario de los pedidos antiguos', async () => {
    await threeOrders()
    const result = await service().anonymizeOlderThan(90)
    expect(result).toEqual({ cutoff: daysAgo(90), count: 2 })

    const delivery = await orderByCode('RYS-0001')
    expect(delivery).toMatchObject({
      customerName: ANONYMIZED.customerName,
      customerPhone: '',
      // Un despacho siempre tiene dirección.
      address: ANONYMIZED.deliveryAddress,
      notes: null,
      requestHash: ANONYMIZED.requestHash,
      anonymizedAt: NOW,
    })
    expect(await orderByCode('RYS-0002')).toMatchObject({ customerName: ANONYMIZED.customerName, address: null, notes: null })

    // No queda ningún dato del cliente en esos pedidos.
    const stored = JSON.stringify(await ctx.db.select().from(orders).where(inArray(orders.code, ['RYS-0001', 'RYS-0002'])))
    expect(stored).not.toMatch(/Ana Rojas|Juan Pérez|987654321|912345678|Aromos|timbre/)
  })

  it('conserva montos, productos, zona y estados para las estadísticas', async () => {
    await threeOrders()
    const before = await orderByCode('RYS-0001')
    const linesBefore = await ctx.db.select().from(orderLines).where(eq(orderLines.orderId, before.id))
    await service().anonymizeOlderThan(90)

    const after = await orderByCode('RYS-0001')
    const keep = ({ code, status, fulfillment, zoneId, zoneName, deliveryFee, subtotal, total, payment, createdAt }: typeof before) => ({
      code,
      status,
      fulfillment,
      zoneId,
      zoneName,
      deliveryFee,
      subtotal,
      total,
      payment,
      createdAt,
    })
    expect(keep(after)).toEqual(keep(before))
    expect(await ctx.db.select().from(orderLines).where(eq(orderLines.orderId, after.id))).toEqual(linesBefore)
    expect(await ctx.db.$count(orderStatusHistory, eq(orderStatusHistory.orderId, after.id))).toBe(1)
  })

  it('no toca los pedidos más nuevos', async () => {
    await threeOrders()
    const recent = await orderByCode('RYS-0003')
    await service().anonymizeOlderThan(90)
    expect(await orderByCode('RYS-0003')).toEqual(recent)
  })

  it('correrlo de nuevo no cambia nada: cada pedido se anonimiza una sola vez', async () => {
    await threeOrders()
    await service().anonymizeOlderThan(90)
    const first = await orderByCode('RYS-0001')
    const later = new OrderPrivacyService(new OrderRepository(ctx.db), () => new Date(NOW.getTime() + 60_000))
    expect((await later.anonymizeOlderThan(90)).count).toBe(0)
    expect((await orderByCode('RYS-0001')).anonymizedAt).toEqual(first.anonymizedAt)
  })

  it('con dryRun solo cuenta', async () => {
    await threeOrders()
    const before = await ctx.db.select().from(orders)
    expect((await service().anonymizeOlderThan(30, { dryRun: true })).count).toBe(2)
    expect((await service().anonymizeOlderThan(5, { dryRun: true })).count).toBe(3)
    expect(await ctx.db.select().from(orders)).toEqual(before)
  })

  it('exige al menos un día', async () => {
    await expect(service().anonymizeOlderThan(0)).rejects.toThrow(RangeError)
  })

  it('el panel muestra el pedido anonimizado con sus montos y sin celular', async () => {
    const app = await threeOrders()
    await service().anonymizeOlderThan(90)
    const user = await createUser(ctx.db, 'staff', 'caja@local.test')
    const cookie = await login(app, user.email)
    const detail = adminOrderDetailSchema.parse((await request(app).get('/api/admin/orders/RYS-0001').set('Cookie', cookie)).body)
    expect(detail).toMatchObject({
      customerName: ANONYMIZED.customerName,
      customerPhone: '',
      total: 41000,
      anonymizedAt: NOW.toISOString(),
    })
    expect(detail.lines.map((line) => line.name)).toEqual(['Suprema', 'Arma tu pizza'])
    const recent = adminOrderDetailSchema.parse((await request(app).get('/api/admin/orders/RYS-0003').set('Cookie', cookie)).body)
    expect(recent.anonymizedAt).toBeNull()
  })
})
