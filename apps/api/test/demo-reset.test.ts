import { eq } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo } from '../src/db/demo-reset.ts'
import { adminUsers, deliveryZones, orders, orderLines, orderStatusHistory, products, sessions, settings } from '../src/db/schema/index.ts'
import { seedDemoUsers } from '../src/db/seed-demo-users.ts'
import { loadSeedData } from '../src/db/seed.ts'
import { createUser, deliveryOrder, login, PANEL_ORIGIN, pickupOrder, placeOrder } from './admin-helpers.ts'
import { reseed, truncateAll, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()
const DEMO_PASSWORD = 'clave-de-la-demo'

beforeEach(async () => {
  await truncateAll(ctx.database)
  await reseed(ctx.database)
})

/** Una demo ya usada: pedidos, sesiones abiertas y cambios hechos desde el panel. */
async function usedDemo() {
  const app = ctx.app({ demoMode: true })
  await seedDemoUsers(ctx.db, DEMO_PASSWORD)
  const cookie = await login(app, 'admin@demo.local', DEMO_PASSWORD)
  await placeOrder(app, pickupOrder)
  await placeOrder(app, deliveryOrder)
  await request(app).patch('/api/admin/orders/RYS-0001/status').set('Cookie', cookie).set('Origin', PANEL_ORIGIN).send({ status: 'confirmed' })
  await ctx.db.update(products).set({ price: 99_000, available: false }).where(eq(products.id, 'suprema'))
  await ctx.db.update(settings).set({ ordersPaused: true })
  await ctx.db.insert(deliveryZones).values({ id: 'zona-del-panel', name: 'Zona del panel', fee: 4000, sortOrder: 99 })
  await ctx.db.update(adminUsers).set({ active: false }).where(eq(adminUsers.email, 'caja@demo.local'))
  return { app, cookie }
}

describe('resetDemo', () => {
  it('borra pedidos y sesiones, deja la carta como en docs/data y los pedidos vuelven a RYS-0001', async () => {
    const { app, cookie } = await usedDemo()
    const otherUser = await createUser(ctx.db, 'staff', 'otra@local.test')

    const summary = await resetDemo(ctx.db, loadSeedData(), DEMO_PASSWORD)
    expect(summary).toMatchObject({ orders: 2, sessions: 1 })
    expect(summary.users.map((user) => user.email)).toEqual(['admin@demo.local', 'caja@demo.local'])

    for (const table of [orders, orderLines, orderStatusHistory, sessions]) expect(await ctx.db.$count(table)).toBe(0)
    const [suprema] = await ctx.db.select().from(products).where(eq(products.id, 'suprema'))
    expect(suprema).toMatchObject({ price: 13000, available: true })
    expect((await ctx.db.select().from(settings))[0].ordersPaused).toBe(false)
    // Lo que no viene de docs/data no se toca.
    expect(await ctx.db.$count(deliveryZones, eq(deliveryZones.id, 'zona-del-panel'))).toBe(1)
    expect(await ctx.db.$count(adminUsers, eq(adminUsers.email, otherUser.email))).toBe(1)

    // La sesión anterior ya no sirve.
    expect((await request(app).get('/api/admin/me').set('Cookie', cookie)).status).toBe(401)
    // El próximo pedido parte de nuevo en RYS-0001.
    expect(await placeOrder(app, pickupOrder)).toBe('RYS-0001')
  })

  it('deja los usuarios de demo activos y con la contraseña de DEMO_PASSWORD', async () => {
    const { app } = await usedDemo()
    await resetDemo(ctx.db, loadSeedData(), 'otra-clave-nueva')
    await expect(login(app, 'caja@demo.local', 'otra-clave-nueva')).resolves.toMatch(/^rys_session=/)
    await expect(login(app, 'admin@demo.local', DEMO_PASSWORD)).rejects.toThrow(/401/)
  })

  it('sobre una base sin pedidos también funciona', async () => {
    const summary = await resetDemo(ctx.db, loadSeedData(), DEMO_PASSWORD)
    expect(summary).toMatchObject({ orders: 0, sessions: 0 })
    expect(await ctx.db.$count(adminUsers)).toBe(2)
  })
})
