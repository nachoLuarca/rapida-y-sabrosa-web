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
})
