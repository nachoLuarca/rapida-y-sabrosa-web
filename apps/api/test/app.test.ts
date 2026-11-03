import { errorResponseSchema } from '@rys/contracts'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createContainer } from '../src/container.ts'
import { createDatabase } from '../src/db/client.ts'
import { silentLogger, UNREACHABLE_DATABASE_URL, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

// La misma API, pero contra una base que no existe.
const offline = createDatabase(UNREACHABLE_DATABASE_URL)
const offlineApp = createApp({ ...createContainer({ database: offline }), logger: silentLogger })
afterAll(() => offline.close())

describe('GET /health', () => {
  it('responde ok cuando la base responde', async () => {
    const response = await request(ctx.app()).get('/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', db: 'ok' })
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('responde 503 cuando la base no responde', async () => {
    const response = await request(offlineApp).get('/health')
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ status: 'error', db: 'error' })
  })
})

describe('errores', () => {
  it('una ruta que no existe es un 404 en JSON con el formato de error', async () => {
    const response = await request(ctx.app()).get('/api/no-existe')
    expect(response.status).toBe(404)
    expect(response.type).toBe('application/json')
    const body = errorResponseSchema.parse(response.body)
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', message: 'No encontramos lo que buscas.' })
    // El requestId del error es el mismo del header, para buscarlo en el log.
    expect(body.error.requestId).toBe(response.headers['x-request-id'])
  })

  it('un error inesperado es un 500 sin detalles internos', async () => {
    const response = await request(offlineApp).get('/api/menu')
    expect(response.status).toBe(500)
    expect(errorResponseSchema.parse(response.body).error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
      details: {},
    })
    expect(JSON.stringify(response.body)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|stack/i)
  })

  it('un body que no es JSON es un 400 VALIDATION_ERROR', async () => {
    const response = await request(ctx.app()).post('/api/menu').set('Content-Type', 'application/json').send('{malo')
    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'La solicitud no es un JSON válido.' })
  })

  it('rechaza un body de más de 32 kB', async () => {
    const response = await request(ctx.app())
      .post('/api/menu')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ relleno: 'x'.repeat(33 * 1024) }))
    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { _: 'El body supera los 32 kB.' } })
  })
})

describe('cabeceras', () => {
  it('no delata Express y trae las cabeceras de helmet', async () => {
    const response = await request(ctx.app()).get('/health')
    expect(response.headers['x-powered-by']).toBeUndefined()
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-security-policy']).toBeDefined()
  })

  it('genera un X-Request-Id, o reutiliza el del cliente si es válido', async () => {
    const generated = await request(ctx.app()).get('/health')
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

    const reused = await request(ctx.app()).get('/health').set('X-Request-Id', 'prueba-12345')
    expect(reused.headers['x-request-id']).toBe('prueba-12345')

    const replaced = await request(ctx.app()).get('/health').set('X-Request-Id', '<script>')
    expect(replaced.headers['x-request-id']).not.toBe('<script>')
  })
})
