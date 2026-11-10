import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from './openapi.ts'

const doc = buildOpenApiDocument() as {
  openapi: string
  paths: Record<string, Record<string, { responses: Record<string, unknown>; parameters?: { name: string }[] }>>
  components: { schemas: Record<string, { type?: string; required?: string[]; properties?: Record<string, unknown> }> }
}

describe('buildOpenApiDocument', () => {
  it('describe las rutas públicas de la API en OpenAPI 3.1', () => {
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/health', '/api/menu', '/api/orders', '/api/admin/session', '/api/admin/orders/{code}/status']),
    )
    expect(Object.keys(doc.paths['/api/orders'].post.responses)).toEqual(
      expect.arrayContaining(['200', '201', '400', '409', '422', '429']),
    )
    expect(doc.paths['/api/orders'].post.parameters?.map((p) => p.name)).toEqual(['Idempotency-Key'])
  })

  it('genera los esquemas desde Zod: el body del pedido como entrada y la carta como salida', () => {
    const { OrderRequest, MenuResponse, ErrorResponse } = doc.components.schemas
    // El body es una unión (despacho o retiro), con las líneas y el total que vio el cliente.
    expect(JSON.stringify(OrderRequest)).toContain('"expectedTotal"')
    expect(JSON.stringify(OrderRequest)).toContain('"website"')
    expect(MenuResponse.required).toEqual(['categories', 'ingredients', 'zones', 'buildPizza', 'business'])
    expect(JSON.stringify(ErrorResponse)).toContain('PRODUCT_UNAVAILABLE')
  })

  it('describe la gestión del panel: productos, variantes, ingredientes, zonas y ajustes', () => {
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/admin/products/{id}',
        '/api/admin/variants/{id}',
        '/api/admin/ingredients/{id}',
        '/api/admin/zones',
        '/api/admin/zones/{id}',
        '/api/admin/settings',
      ]),
    )
    expect(Object.keys(doc.paths['/api/admin/zones'])).toEqual(['get', 'post'])
    expect(Object.keys(doc.components.schemas.SettingsPatch.properties ?? {})).toEqual(
      expect.arrayContaining(['ordersPaused', 'openingHours', 'whatsappNumber', 'pickupAddress', 'buildPizzaBasePrice']),
    )
  })

  it('cada $ref apunta a un esquema que existe', () => {
    const refs = [...JSON.stringify(doc).matchAll(/"#\/components\/schemas\/(\w+)"/g)].map((match) => match[1])
    expect(refs.length).toBeGreaterThan(0)
    for (const name of refs) expect(doc.components.schemas[name], name).toBeDefined()
  })
})
