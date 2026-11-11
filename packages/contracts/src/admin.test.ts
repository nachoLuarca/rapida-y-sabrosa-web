import { describe, expect, it } from 'vitest'
import {
  adminOrderDetailSchema,
  loginRequestSchema,
  ordersListQuerySchema,
  statusChangeRequestSchema,
} from './admin.ts'

describe('loginRequestSchema', () => {
  it('normaliza el email a minúsculas y sin espacios', () => {
    expect(loginRequestSchema.parse({ email: '  Admin@Demo.Local ', password: 'x' })).toEqual({
      email: 'admin@demo.local',
      password: 'x',
    })
  })

  it('exige email y contraseña', () => {
    const result = loginRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('ordersListQuerySchema', () => {
  it('acepta varios estados separados por coma, fechas ISO y paginado con valores por defecto', () => {
    expect(
      ordersListQuerySchema.parse({ status: 'pending, confirmed', from: '2026-11-03T03:00:00.000Z', q: ' RYS-0042 ' }),
    ).toEqual({ status: ['pending', 'confirmed'], from: '2026-11-03T03:00:00.000Z', q: 'RYS-0042', page: 1, pageSize: 50 })
    expect(ordersListQuerySchema.parse({ page: '3', pageSize: '20' })).toMatchObject({ page: 3, pageSize: 20 })
  })

  it('rechaza estados desconocidos, fechas sin formato ISO y páginas de más de 100', () => {
    expect(ordersListQuerySchema.safeParse({ status: 'pending,perdido' }).success).toBe(false)
    expect(ordersListQuerySchema.safeParse({ from: 'ayer' }).success).toBe(false)
    expect(ordersListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false)
    expect(ordersListQuerySchema.safeParse({ page: '0' }).success).toBe(false)
  })
})

describe('statusChangeRequestSchema', () => {
  it('acepta un estado conocido con o sin motivo, recortando espacios', () => {
    expect(statusChangeRequestSchema.parse({ status: 'cancelled', reason: '  Sin stock ' })).toEqual({
      status: 'cancelled',
      reason: 'Sin stock',
    })
    expect(statusChangeRequestSchema.safeParse({ status: 'perdido' }).success).toBe(false)
  })
})

describe('adminOrderDetailSchema', () => {
  it('acepta el detalle de un pedido con su historial', () => {
    const detail = {
      code: 'RYS-0042',
      status: 'confirmed',
      fulfillment: 'pickup',
      zoneName: null,
      customerName: 'Ana',
      total: 13000,
      itemCount: 1,
      createdAt: '2026-11-03T22:00:00.000Z',
      updatedAt: '2026-11-03T22:05:00.000Z',
      payment: 'cash',
      customerPhone: '56912345678',
      address: null,
      notes: null,
      subtotal: 13000,
      deliveryFee: 0,
      lines: [],
      history: [
        { fromStatus: null, toStatus: 'pending', changedBy: null, reason: null, createdAt: '2026-11-03T22:00:00.000Z' },
        {
          fromStatus: 'pending',
          toStatus: 'confirmed',
          changedBy: { id: '3f0e0b8c-6d3f-4a51-9c5e-2b1b5a1f8a10', name: 'Caja' },
          reason: null,
          createdAt: '2026-11-03T22:05:00.000Z',
        },
      ],
      nextStatuses: ['preparing', 'cancelled'],
      anonymizedAt: null,
    }
    expect(adminOrderDetailSchema.parse(detail)).toEqual(detail)
    // Un pedido anonimizado trae cuándo se anonimizó.
    const anonymized = { ...detail, customerName: 'Cliente anonimizado', customerPhone: '', anonymizedAt: '2026-11-11T15:00:00.000Z' }
    expect(adminOrderDetailSchema.parse(anonymized)).toEqual(anonymized)
  })
})
