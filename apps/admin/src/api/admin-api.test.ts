import { describe, expect, it, vi } from 'vitest'
import { ApiError, createAdminApi } from './admin-api'

const json = (status: number, body?: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response

const error = (status: number, code: string, message: string, details = {}) =>
  json(status, { error: { code, message, details, requestId: 'test' } })

describe('createAdminApi', () => {
  it('me devuelve el usuario, o null si no hay sesión', async () => {
    const user = { id: '3f0e0b8c-6d3f-4a51-9c5e-2b1b5a1f8a10', email: 'caja@demo.local', name: 'Caja', role: 'staff' }
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(200, { user })).mockResolvedValueOnce(error(401, 'UNAUTHENTICATED', 'Inicia sesión.'))
    const api = createAdminApi(fetchImpl)
    expect(await api.me()).toEqual(user)
    expect(await api.me()).toBeNull()
    expect(fetchImpl).toHaveBeenCalledWith('/api/admin/me', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }))
  })

  it('los errores de la API llegan como ApiError con su código, mensaje y detalles', async () => {
    const api = createAdminApi(vi.fn().mockResolvedValue(error(409, 'INVALID_TRANSITION', 'No se puede.', { to: 'delivered' })))
    const caught = await api.changeStatus('RYS-0001', { status: 'delivered' }).catch((e: unknown) => e)
    expect(caught).toBeInstanceOf(ApiError)
    expect(caught).toMatchObject({ code: 'INVALID_TRANSITION', message: 'No se puede.', status: 409, details: { to: 'delivered' } })
  })

  it('sin red, avisa que no hay conexión', async () => {
    const api = createAdminApi(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.listOrders({})).rejects.toMatchObject({ code: 'NETWORK', status: 0 })
  })

  it('arma los filtros del listado y manda el cambio de estado como JSON', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { orders: [], page: 1, pageSize: 100, total: 0 }))
      .mockResolvedValueOnce(json(204))
    const api = createAdminApi(fetchImpl)
    await api.listOrders({ status: ['pending', 'confirmed'], from: '2026-11-03T03:00:00.000Z', pageSize: 100 })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      '/api/admin/orders?status=pending%2Cconfirmed&from=2026-11-03T03%3A00%3A00.000Z&pageSize=100',
    )
    await api.logout()
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'DELETE' })
  })

  it('la gestión usa las rutas del panel y la carta sale de /api/menu', async () => {
    const product = { id: 'suprema', name: 'Suprema', description: null, price: 13500, variants: [], available: true }
    const zone = { id: 'islita', name: 'Islita', fee: 2000, active: true }
    const settings = {
      whatsappNumber: '56974314602',
      pickupAddress: null,
      openingHours: null,
      timezone: 'America/Santiago',
      ordersPaused: true,
      buildPizzaBasePrice: 10900,
      buildPizzaPromoPrice: 13000,
      buildPizzaPromoIncluded: 3,
      updatedAt: '2026-11-03T22:00:00.000Z',
    }
    const menu = {
      categories: [],
      ingredients: [],
      zones: [],
      buildPizza: { productId: 'arma-tu-pizza', name: 'Arma tu pizza', description: null, basePrice: 1, promoPrice: 1, includedInPromo: 3, available: true },
      business: { name: 'Rápida y Sabrosa', whatsappNumber: '56974314602', pickupAddress: null, openingHours: null, isOpen: true, nextOpening: null, ordersPaused: false },
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, menu))
      .mockResolvedValueOnce(json(200, product))
      .mockResolvedValueOnce(json(200, { id: 'jugo-mango-500', label: '500 cc', price: 3600 }))
      .mockResolvedValueOnce(json(200, { id: 'tocino', name: 'Tocino', price: 1500, available: false }))
      .mockResolvedValueOnce(json(200, { zones: [zone] }))
      .mockResolvedValueOnce(json(201, zone))
      .mockResolvedValueOnce(json(200, zone))
      .mockResolvedValueOnce(json(200, settings))
      .mockResolvedValueOnce(json(200, settings))
    const api = createAdminApi(fetchImpl)

    await api.getMenu()
    expect(await api.updateProduct('suprema', { price: 13500 })).toEqual(product)
    await api.updateVariant('jugo-mango-500', { price: 3600 })
    await api.updateIngredient('tocino', { available: false })
    expect(await api.listZones()).toEqual([zone])
    await api.createZone({ name: 'Islita', fee: 2000 })
    await api.updateZone('islita', { active: true })
    await api.getSettings()
    expect((await api.updateSettings({ ordersPaused: true })).ordersPaused).toBe(true)

    expect(fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'GET /api/menu',
      'PATCH /api/admin/products/suprema',
      'PATCH /api/admin/variants/jugo-mango-500',
      'PATCH /api/admin/ingredients/tocino',
      'GET /api/admin/zones',
      'POST /api/admin/zones',
      'PATCH /api/admin/zones/islita',
      'GET /api/admin/settings',
      'PATCH /api/admin/settings',
    ])
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ price: 13500 })
  })

  it('una respuesta que no cumple el contrato no se deja pasar', async () => {
    const api = createAdminApi(vi.fn().mockResolvedValue(json(200, { zones: [{ id: 'islita', name: 'Islita' }] })))
    await expect(api.listZones()).rejects.toThrow()
  })
})
