import {
  adminIngredientSchema,
  adminProductSchema,
  adminSettingsSchema,
  adminVariantSchema,
  adminZoneSchema,
  errorResponseSchema,
  menuResponseSchema,
  zonesListResponseSchema,
  type MenuResponse,
} from '@rys/contracts'
import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { deliveryZones, ingredients, products, productVariants, settings } from '../src/db/schema/index.ts'
import { createUser, login, PANEL_ORIGIN, pickupOrder, placeOrder } from './admin-helpers.ts'
import { reseed, truncateAll, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

beforeEach(async () => {
  await truncateAll(ctx.database)
  await reseed(ctx.database)
})

const errorOf = (body: unknown) => errorResponseSchema.parse(body).error

type Session = { app: Express; cookie: string }

/** API con una sesión de administración y otra de caja. */
async function sessions(options: Parameters<typeof ctx.app>[0] = {}) {
  const app = ctx.app(options)
  const admin = await createUser(ctx.db, 'admin', 'admin@local.test')
  const staff = await createUser(ctx.db, 'staff', 'caja@local.test')
  return {
    app,
    admin: { app, cookie: await login(app, admin.email) } satisfies Session,
    staff: { app, cookie: await login(app, staff.email) } satisfies Session,
  }
}

const send = (method: 'patch' | 'post', { app, cookie }: Session, path: string, body: object, origin: string | null = PANEL_ORIGIN) => {
  const call = request(app)[method](`/api/admin${path}`).set('Cookie', cookie)
  return (origin ? call.set('Origin', origin) : call).send(body)
}
const patch = (session: Session, path: string, body: object) => send('patch', session, path, body)
const post = (session: Session, path: string, body: object) => send('post', session, path, body)
const get = ({ app, cookie }: Session, path: string) => request(app).get(`/api/admin${path}`).set('Cookie', cookie)

async function menuOf(app: Express): Promise<{ menu: MenuResponse; etag: string }> {
  const response = await request(app).get('/api/menu')
  return { menu: menuResponseSchema.parse(response.body), etag: response.headers.etag }
}

const productOf = (menu: MenuResponse, id: string) =>
  menu.categories.flatMap((category) => category.products).find((product) => product.id === id)

/** Hace el cambio y comprueba que el ETag del menú ya no es el de antes (el viejo ya no da 304). */
async function expectEtagChange(app: Express, change: () => Promise<unknown>): Promise<MenuResponse> {
  const before = await menuOf(app)
  await change()
  const after = await request(app).get('/api/menu').set('If-None-Match', before.etag)
  expect(after.status).toBe(200)
  expect(after.headers.etag).not.toBe(before.etag)
  return menuResponseSchema.parse(after.body)
}

const ROUTES: ['patch' | 'post', string, object][] = [
  ['patch', '/products/suprema', { available: false }],
  ['patch', '/variants/jugo-mango-500', { price: 3600 }],
  ['patch', '/ingredients/tocino', { available: false }],
  ['post', '/zones', { name: 'Naltahua', fee: 3000 }],
  ['patch', '/zones/islita', { fee: 2500 }],
  ['patch', '/settings', { ordersPaused: true }],
]

describe('gestión: sesión y Origin', () => {
  it.each(ROUTES)('%s %s exige sesión', async (method, path, body) => {
    const response = await request(ctx.app())[method](`/api/admin${path}`).set('Origin', PANEL_ORIGIN).send(body)
    expect(response.status).toBe(401)
    expect(errorOf(response.body).code).toBe('UNAUTHENTICATED')
  })

  it.each(['/zones', '/settings'])('GET %s exige sesión', async (path) => {
    const response = await request(ctx.app()).get(`/api/admin${path}`)
    expect(response.status).toBe(401)
  })

  it.each(ROUTES)('%s %s rechaza un Origin ajeno o ausente, sin cambiar nada', async (method, path, body) => {
    const { app, admin } = await sessions()
    const before = await menuOf(app)
    for (const origin of ['https://sitio-malo.example', null]) {
      const response = await send(method, admin, path, body, origin)
      expect(response.status).toBe(403)
      expect(errorOf(response.body).code).toBe('INVALID_ORIGIN')
    }
    expect((await menuOf(app)).etag).toBe(before.etag)
    expect(await ctx.db.select().from(deliveryZones)).toHaveLength(13)
  })
})

describe('PATCH /api/admin/products/:id', () => {
  it('caja puede marcar un producto como agotado y la carta lo refleja', async () => {
    const { app, staff } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(staff, '/products/suprema', { available: false })
      expect(response.status).toBe(200)
      expect(adminProductSchema.parse(response.body)).toMatchObject({ id: 'suprema', available: false, price: 13000 })
    })
    expect(productOf(menu, 'suprema')?.available).toBe(false)

    // Y ya no se puede pedir.
    const order = await request(app).post('/api/orders').set('Idempotency-Key', crypto.randomUUID()).send(pickupOrder)
    expect(order.status).toBe(409)
    expect(errorOf(order.body).code).toBe('PRODUCT_UNAVAILABLE')
  })

  it.each([{ price: 100 }, { name: 'Otra' }, { description: 'x' }, { available: false, price: 100 }])(
    'caja no puede cambiar %o: 403 y no se aplica nada',
    async (body) => {
      const { staff } = await sessions()
      const response = await patch(staff, '/products/suprema', body)
      expect(response.status).toBe(403)
      expect(errorOf(response.body).code).toBe('FORBIDDEN')
      const [row] = await ctx.db.select().from(products).where(eq(products.id, 'suprema'))
      expect(row).toMatchObject({ name: 'Suprema', price: 13000, available: true })
    },
  )

  it('administración cambia nombre, descripción, precio y disponibilidad', async () => {
    const { app, admin } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(admin, '/products/suprema', { name: ' Suprema XL ', description: '', price: 14500, available: false })
      expect(response.status).toBe(200)
      expect(adminProductSchema.parse(response.body)).toEqual({
        id: 'suprema',
        name: 'Suprema XL',
        description: null,
        price: 14500,
        variants: [],
        available: false,
      })
    })
    expect(productOf(menu, 'suprema')).toMatchObject({ name: 'Suprema XL', description: null, price: 14500, available: false })
  })

  it('con el precio nuevo, un pedido con el total viejo recibe PRICE_CHANGED', async () => {
    const { app, admin } = await sessions()
    await patch(admin, '/products/suprema', { price: 14500 })
    const order = await request(app).post('/api/orders').set('Idempotency-Key', crypto.randomUUID()).send(pickupOrder)
    expect(order.status).toBe(409)
    expect(errorOf(order.body)).toMatchObject({ code: 'PRICE_CHANGED', details: { quote: { total: 14500 } } })
  })

  it('un pedido ya hecho conserva su precio aunque después cambie la carta', async () => {
    const { app, admin } = await sessions()
    const code = await placeOrder(app)
    await patch(admin, '/products/suprema', { price: 14500, name: 'Suprema XL' })
    const detail = await get(admin, `/orders/${code}`)
    expect(detail.body).toMatchObject({ total: 13000, lines: [{ name: 'Suprema', unitPrice: 13000 }] })
  })

  it.each([
    [{ price: -1 }, 'price'],
    [{ price: 1_000_001 }, 'price'],
    [{ price: 12.5 }, 'price'],
    [{ price: '13000' }, 'price'],
    [{ price: null }, 'price'],
    [{ name: '   ' }, 'name'],
    [{ name: 'x'.repeat(81) }, 'name'],
    [{ description: 'x'.repeat(301) }, 'description'],
    [{ available: 'si' }, 'available'],
    [{ categoryId: 'bebidas' }, '_'],
    [{}, '_'],
  ])('rechaza %o con un error en %s', async (body, field) => {
    const { admin } = await sessions()
    const response = await patch(admin, '/products/suprema', body)
    expect(response.status).toBe(400)
    const error = errorOf(response.body)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(error.details)).toEqual([field])
  })

  it('acepta los precios de los extremos: 0 y 1.000.000', async () => {
    const { admin } = await sessions()
    expect((await patch(admin, '/products/suprema', { price: 0 })).body.price).toBe(0)
    expect((await patch(admin, '/products/suprema', { price: 1_000_000 })).body.price).toBe(1_000_000)
  })

  it('el precio de un producto con variantes se cambia en las variantes', async () => {
    const { admin } = await sessions()
    const response = await patch(admin, '/products/jugo-mango', { price: 4000 })
    expect(response.status).toBe(400)
    expect(errorOf(response.body).details).toEqual({ price: 'Este producto tiene variantes: cambia el precio en cada una.' })
    const [row] = await ctx.db.select().from(products).where(eq(products.id, 'jugo-mango'))
    expect(row.price).toBeNull()
  })

  it('Arma tu pizza se puede agotar y renombrar, pero su precio está en los ajustes', async () => {
    const { app, admin, staff } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(staff, '/products/arma-tu-pizza', { available: false })
      expect(response.status).toBe(200)
      expect(adminProductSchema.parse(response.body)).toMatchObject({ id: 'arma-tu-pizza', price: null, variants: [] })
    })
    expect(menu.buildPizza.available).toBe(false)

    const price = await patch(admin, '/products/arma-tu-pizza', { price: 9000 })
    expect(price.status).toBe(400)
    expect(errorOf(price.body).details).toEqual({ price: 'El precio de este producto se cambia en Ajustes.' })
  })

  it('un producto que no existe es 404', async () => {
    const { admin } = await sessions()
    const response = await patch(admin, '/products/no-existe', { available: false })
    expect(response.status).toBe(404)
    expect(errorOf(response.body).code).toBe('NOT_FOUND')
  })
})

describe('PATCH /api/admin/variants/:id', () => {
  it('caja no puede cambiar variantes', async () => {
    const { staff } = await sessions()
    const response = await patch(staff, '/variants/jugo-mango-500', { price: 3600 })
    expect(response.status).toBe(403)
    expect(errorOf(response.body).code).toBe('FORBIDDEN')
    const [row] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, 'jugo-mango-500'))
    expect(row.price).toBe(3500)
  })

  it('administración cambia la etiqueta y el precio, y la carta lo refleja', async () => {
    const { app, admin } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(admin, '/variants/jugo-mango-500', { label: '½ litro', price: 3600 })
      expect(response.status).toBe(200)
      expect(adminVariantSchema.parse(response.body)).toEqual({ id: 'jugo-mango-500', label: '½ litro', price: 3600 })
    })
    expect(productOf(menu, 'jugo-mango')?.variants[0]).toEqual({ id: 'jugo-mango-500', label: '½ litro', price: 3600 })
  })

  it.each([
    [{ price: 1_000_001 }, 'price'],
    [{ label: '' }, 'label'],
    [{ available: false }, '_'],
    [{}, '_'],
  ])('rechaza %o con un error en %s', async (body, field) => {
    const { admin } = await sessions()
    const response = await patch(admin, '/variants/jugo-mango-500', body)
    expect(response.status).toBe(400)
    expect(Object.keys(errorOf(response.body).details)).toEqual([field])
  })

  it('una variante que no existe es 404', async () => {
    const { admin } = await sessions()
    expect((await patch(admin, '/variants/no-existe', { price: 100 })).status).toBe(404)
  })
})

describe('PATCH /api/admin/ingredients/:id', () => {
  it('caja puede agotar un ingrediente, pero no cambiarle el precio ni el nombre', async () => {
    const { app, staff } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(staff, '/ingredients/tocino', { available: false })
      expect(response.status).toBe(200)
      expect(adminIngredientSchema.parse(response.body)).toMatchObject({ id: 'tocino', available: false })
    })
    expect(menu.ingredients.find((ingredient) => ingredient.id === 'tocino')?.available).toBe(false)

    for (const body of [{ price: 100 }, { name: 'Panceta' }]) {
      const response = await patch(staff, '/ingredients/tocino', body)
      expect(response.status).toBe(403)
      expect(errorOf(response.body).code).toBe('FORBIDDEN')
    }
    const [row] = await ctx.db.select().from(ingredients).where(eq(ingredients.id, 'tocino'))
    expect(row).toMatchObject({ name: 'Tocino', available: false })
  })

  it('administración cambia nombre y precio', async () => {
    const { app, admin } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(admin, '/ingredients/tocino', { name: 'Tocino ahumado', price: 1800 })
      expect(response.status).toBe(200)
    })
    expect(menu.ingredients.find((ingredient) => ingredient.id === 'tocino')).toEqual({
      id: 'tocino',
      name: 'Tocino ahumado',
      price: 1800,
      available: true,
    })
  })

  it('valida el precio y avisa si el ingrediente no existe', async () => {
    const { admin } = await sessions()
    const invalid = await patch(admin, '/ingredients/tocino', { price: 2_000_000 })
    expect(invalid.status).toBe(400)
    expect(errorOf(invalid.body).details).toEqual({ price: 'Ingresa un precio entre $0 y $1.000.000, sin decimales.' })
    expect((await patch(admin, '/ingredients/no-existe', { available: false })).status).toBe(404)
  })
})

describe('/api/admin/zones', () => {
  it('caja no puede ver, crear ni editar zonas', async () => {
    const { staff } = await sessions()
    for (const response of [
      await get(staff, '/zones'),
      await post(staff, '/zones', { name: 'Naltahua', fee: 3000 }),
      await patch(staff, '/zones/islita', { active: false }),
    ]) {
      expect(response.status).toBe(403)
      expect(errorOf(response.body).code).toBe('FORBIDDEN')
    }
    expect(await ctx.db.select().from(deliveryZones)).toHaveLength(13)
  })

  it('lista todas las zonas en orden, también las desactivadas', async () => {
    const { admin } = await sessions()
    await ctx.db.update(deliveryZones).set({ active: false }).where(eq(deliveryZones.id, 'islita'))
    const response = await get(admin, '/zones')
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    const { zones } = zonesListResponseSchema.parse(response.body)
    expect(zones).toHaveLength(13)
    expect(zones.slice(0, 2)).toEqual([
      { id: 'isla-centro', name: 'Isla Centro', fee: 2000, active: true },
      { id: 'islita', name: 'Islita', fee: 2000, active: false },
    ])
  })

  it('crea una zona con el id armado desde el nombre, al final de la lista y visible en la carta', async () => {
    const { app, admin } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await post(admin, '/zones', { name: ' Villa Ñandú (norte) ', fee: 4000 })
      expect(response.status).toBe(201)
      expect(adminZoneSchema.parse(response.body)).toEqual({ id: 'villa-nandu-norte', name: 'Villa Ñandú (norte)', fee: 4000, active: true })
    })
    expect(menu.zones.at(-1)).toEqual({ id: 'villa-nandu-norte', name: 'Villa Ñandú (norte)', fee: 4000 })
  })

  it('si el id ya existe le agrega un número', async () => {
    const { admin } = await sessions()
    // Mismo slug que "islita", con otro nombre.
    await ctx.db.update(deliveryZones).set({ name: 'La Islita' }).where(eq(deliveryZones.id, 'islita'))
    const response = await post(admin, '/zones', { name: 'Islita', fee: 2000 })
    expect(response.status).toBe(201)
    expect(response.body.id).toBe('islita-2')
  })

  it('una zona creada como inactiva no llega a la carta', async () => {
    const { app, admin } = await sessions()
    const before = await menuOf(app)
    expect((await post(admin, '/zones', { name: 'Naltahua', fee: 3000, active: false })).status).toBe(201)
    const after = await menuOf(app)
    expect(after.menu.zones).toHaveLength(13)
    expect(after.etag).toBe(before.etag)
  })

  it.each([
    [{ fee: 3000 }, 'name'],
    [{ name: 'Naltahua' }, 'fee'],
    [{ name: 'Naltahua', fee: -1 }, 'fee'],
    [{ name: 'Naltahua', fee: 1_000_001 }, 'fee'],
    [{ name: '¡¡!!', fee: 1000 }, 'name'],
    [{ name: 'ISLITA', fee: 1000 }, 'name'],
    [{ name: 'Gacitua', fee: 1000 }, 'name'],
    [{ id: 'mi-id', name: 'Naltahua', fee: 1000 }, '_'],
  ])('no crea la zona %o: error en %s', async (body, field) => {
    const { admin } = await sessions()
    const response = await post(admin, '/zones', body)
    expect(response.status).toBe(400)
    expect(Object.keys(errorOf(response.body).details)).toEqual([field])
    expect(await ctx.db.select().from(deliveryZones)).toHaveLength(13)
  })

  it('edita nombre y costo, y al desactivarla sale de la carta', async () => {
    const { app, admin } = await sessions()
    const edited = await expectEtagChange(app, async () => {
      const response = await patch(admin, '/zones/islita', { name: 'La Islita', fee: 2500 })
      expect(response.status).toBe(200)
      expect(adminZoneSchema.parse(response.body)).toEqual({ id: 'islita', name: 'La Islita', fee: 2500, active: true })
    })
    expect(edited.zones.find((zone) => zone.id === 'islita')).toEqual({ id: 'islita', name: 'La Islita', fee: 2500 })

    const off = await expectEtagChange(app, async () => {
      expect((await patch(admin, '/zones/islita', { active: false })).status).toBe(200)
    })
    expect(off.zones.map((zone) => zone.id)).not.toContain('islita')

    const on = await expectEtagChange(app, async () => {
      expect((await patch(admin, '/zones/islita', { active: true })).status).toBe(200)
    })
    expect(on.zones.map((zone) => zone.id)).toContain('islita')
  })

  it('no deja dos zonas con el mismo nombre, pero sí guardar una con su propio nombre', async () => {
    const { admin } = await sessions()
    const duplicated = await patch(admin, '/zones/islita', { name: 'isla centro' })
    expect(duplicated.status).toBe(400)
    expect(errorOf(duplicated.body).details).toEqual({ name: 'Ya existe una zona con ese nombre.' })
    expect((await patch(admin, '/zones/islita', { name: 'Islita', fee: 2100 })).status).toBe(200)
  })

  it('una zona que no existe es 404, y no hay ruta para borrarlas', async () => {
    const { app, admin } = await sessions()
    expect((await patch(admin, '/zones/no-existe', { fee: 100 })).status).toBe(404)
    const response = await request(app).delete('/api/admin/zones/islita').set('Cookie', admin.cookie).set('Origin', PANEL_ORIGIN)
    expect(response.status).toBe(404)
    expect(await ctx.db.select().from(deliveryZones)).toHaveLength(13)
  })
})

describe('/api/admin/settings', () => {
  it('ambos roles leen los ajustes', async () => {
    const { admin, staff } = await sessions()
    for (const session of [admin, staff]) {
      const response = await get(session, '/settings')
      expect(response.status).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(adminSettingsSchema.parse(response.body)).toMatchObject({
        whatsappNumber: '56974314602',
        pickupAddress: null,
        openingHours: null,
        timezone: 'America/Santiago',
        ordersPaused: false,
        buildPizzaBasePrice: 10900,
        buildPizzaPromoPrice: 13000,
        buildPizzaPromoIncluded: 3,
      })
    }
  })

  it('caja puede pausar y reanudar los pedidos: la carta lo avisa y los pedidos se rechazan', async () => {
    const now = new Date('2026-11-03T19:00:00Z')
    const { app, staff } = await sessions({ clock: () => now })
    const paused = await expectEtagChange(app, async () => {
      const response = await patch(staff, '/settings', { ordersPaused: true })
      expect(response.status).toBe(200)
      expect(adminSettingsSchema.parse(response.body)).toMatchObject({ ordersPaused: true, updatedAt: now.toISOString() })
    })
    expect(paused.business.ordersPaused).toBe(true)

    const order = await request(app).post('/api/orders').set('Idempotency-Key', crypto.randomUUID()).send(pickupOrder)
    expect(order.status).toBe(409)
    expect(errorOf(order.body).code).toBe('ORDERS_PAUSED')

    const resumed = await expectEtagChange(app, () => patch(staff, '/settings', { ordersPaused: false }))
    expect(resumed.business.ordersPaused).toBe(false)
    await expect(placeOrder(app)).resolves.toMatch(/^RYS-/)
  })

  it.each([
    { whatsappNumber: '912345678' },
    { pickupAddress: 'Balmaceda 308' },
    { openingHours: null },
    { buildPizzaBasePrice: 9000 },
    { buildPizzaPromoPrice: 9000 },
    { buildPizzaPromoIncluded: 2 },
    { ordersPaused: true, buildPizzaBasePrice: 9000 },
  ])('caja no puede cambiar %o: 403 y no se aplica nada', async (body) => {
    const { staff } = await sessions()
    const response = await patch(staff, '/settings', body)
    expect(response.status).toBe(403)
    expect(errorOf(response.body).code).toBe('FORBIDDEN')
    const [row] = await ctx.db.select().from(settings)
    expect(row).toMatchObject({ whatsappNumber: '56974314602', pickupAddress: null, ordersPaused: false, buildPizzaBasePrice: 10900 })
  })

  it('administración define el horario por día con varios rangos, y la carta calcula si está abierto', async () => {
    const openingHours = {
      mon: [],
      tue: [['12:00', '15:30'], ['19:00', '01:00']],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    }
    // Martes 3 de noviembre de 2026, 16:00 en Santiago: entre los dos rangos.
    const { app, admin } = await sessions({ clock: () => new Date('2026-11-03T19:00:00Z') })
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(admin, '/settings', { openingHours })
      expect(response.status).toBe(200)
      expect(adminSettingsSchema.parse(response.body).openingHours).toEqual(openingHours)
    })
    expect(menu.business).toMatchObject({ openingHours, isOpen: false, nextOpening: '2026-11-03T22:00:00.000Z' })

    const order = await request(app).post('/api/orders').set('Idempotency-Key', crypto.randomUUID()).send(pickupOrder)
    expect(errorOf(order.body).code).toBe('STORE_CLOSED')

    // Volver a "sin horario definido" quita la restricción.
    const open = await expectEtagChange(app, () => patch(admin, '/settings', { openingHours: null }))
    expect(open.business).toMatchObject({ openingHours: null, isOpen: true, nextOpening: null })
  })

  it.each([
    [{ openingHours: { mon: [['25:00', '26:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } }, 'openingHours.mon.0.0'],
    [{ openingHours: { mon: [['9:00', '13:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } }, 'openingHours.mon.0.0'],
    [{ openingHours: { mon: [['19:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } }, 'openingHours.mon.0'],
    [{ openingHours: { mon: [] } }, 'openingHours.tue'],
    [{ openingHours: 'siempre' }, 'openingHours'],
    [{ whatsappNumber: '22334455' }, 'whatsappNumber'],
    [{ whatsappNumber: 56974314602 }, 'whatsappNumber'],
    [{ pickupAddress: 'x'.repeat(201) }, 'pickupAddress'],
    [{ buildPizzaBasePrice: 1_000_001 }, 'buildPizzaBasePrice'],
    [{ buildPizzaPromoPrice: 10.5 }, 'buildPizzaPromoPrice'],
    [{ buildPizzaPromoIncluded: 31 }, 'buildPizzaPromoIncluded'],
    [{ ordersPaused: 'si' }, 'ordersPaused'],
    [{ timezone: 'UTC' }, '_'],
    [{ businessName: 'Otra pizzería' }, '_'],
    [{}, '_'],
  ])('rechaza %o con un error en %s', async (body, field) => {
    const { app, admin } = await sessions()
    const before = await menuOf(app)
    const response = await patch(admin, '/settings', body)
    expect(response.status).toBe(400)
    const error = errorOf(response.body)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(error.details)[0]).toBe(field)
    expect((await menuOf(app)).etag).toBe(before.etag)
  })

  it('administración cambia el número (normalizado), la dirección de retiro y los precios de Arma tu pizza', async () => {
    const { app, admin } = await sessions()
    const menu = await expectEtagChange(app, async () => {
      const response = await patch(admin, '/settings', {
        whatsappNumber: '+56 9 1234 5678',
        pickupAddress: ' Balmaceda 308 ',
        buildPizzaBasePrice: 11500,
        buildPizzaPromoPrice: 13900,
        buildPizzaPromoIncluded: 4,
      })
      expect(response.status).toBe(200)
      expect(adminSettingsSchema.parse(response.body)).toMatchObject({
        whatsappNumber: '56912345678',
        pickupAddress: 'Balmaceda 308',
        buildPizzaBasePrice: 11500,
      })
    })
    expect(menu.business).toMatchObject({ whatsappNumber: '56912345678', pickupAddress: 'Balmaceda 308' })
    expect(menu.buildPizza).toMatchObject({ basePrice: 11500, promoPrice: 13900, includedInPromo: 4 })

    // El pedido siguiente sale con el número nuevo.
    const order = await request(app).post('/api/orders').set('Idempotency-Key', crypto.randomUUID()).send(pickupOrder)
    expect(order.status).toBe(201)
    expect(order.body.whatsappUrl).toContain('wa.me/56912345678')

    // Una dirección vacía vuelve a null: la web la omite.
    const cleared = await expectEtagChange(app, () => patch(admin, '/settings', { pickupAddress: '  ' }))
    expect(cleared.business.pickupAddress).toBeNull()
  })

  it('cambiar solo un campo no toca los demás', async () => {
    const { admin } = await sessions()
    await patch(admin, '/settings', { pickupAddress: 'Balmaceda 308' })
    await patch(admin, '/settings', { ordersPaused: true })
    const [row] = await ctx.db.select().from(settings)
    expect(row).toMatchObject({ pickupAddress: 'Balmaceda 308', ordersPaused: true, whatsappNumber: '56974314602', businessName: 'Rápida y Sabrosa' })
  })
})
