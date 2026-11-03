import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ERROR_CODES, ERROR_STATUS, errorResponseSchema, validationDetails } from './errors.ts'

describe('errorResponseSchema', () => {
  it('acepta el formato único de error', () => {
    const body = {
      error: { code: 'PRODUCT_UNAVAILABLE', message: 'Un producto se agotó.', details: { ids: ['suprema'] }, requestId: 'abc' },
    }
    expect(errorResponseSchema.parse(body)).toEqual(body)
  })

  it('rechaza códigos que no están en la tabla', () => {
    const body = { error: { code: 'TEAPOT', message: 'x', details: {}, requestId: 'abc' } }
    expect(errorResponseSchema.safeParse(body).success).toBe(false)
  })

  it('cada código tiene el status de la spec', () => {
    expect(ERROR_CODES).toHaveLength(14)
    expect(ERROR_STATUS.VALIDATION_ERROR).toBe(400)
    expect(ERROR_STATUS.PRICE_CHANGED).toBe(409)
    expect(ERROR_STATUS.IDEMPOTENCY_KEY_REUSED).toBe(422)
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429)
  })
})

describe('validationDetails', () => {
  it('deja el primer mensaje de cada campo, con la ruta unida por puntos', () => {
    const schema = z.object({
      customer: z.object({ name: z.string().min(2, { error: 'corto' }).max(1, { error: 'largo' }) }),
      lines: z.array(z.object({ quantity: z.number() })),
    })
    const result = schema.safeParse({ customer: { name: 'a' }, lines: [{ quantity: 'x' }] })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(validationDetails(result.error)).toEqual({
      'customer.name': 'corto',
      'lines.0.quantity': expect.any(String),
    })
  })

  it('usa "_" para los errores de todo el body', () => {
    const result = z.object({}).safeParse('texto')
    if (result.success) throw new Error('se esperaba un error')
    expect(Object.keys(validationDetails(result.error))).toEqual(['_'])
  })
})
