import { z } from 'zod'
import { ERROR_CODES, errorResponseSchema } from './errors.ts'
import { healthResponseSchema } from './health.ts'
import { menuResponseSchema } from './menu.ts'
import {
  IDEMPOTENCY_KEY_HEADER,
  orderRequestSchema,
  orderResponseSchema,
  priceChangedDetailsSchema,
  productUnavailableDetailsSchema,
  storeBlockedDetailsSchema,
} from './orders.ts'

// Documentación OpenAPI 3.1 de la API, generada desde los mismos esquemas Zod con que la API valida. La sirve
// la API en /api/docs, solo en desarrollo.

type JsonSchema = Record<string, unknown>

/** Lo que el cliente envía se describe como entrada (antes de transformar); lo que responde la API, como salida. */
const toSchema = (schema: z.ZodType, io: 'input' | 'output'): JsonSchema => {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonSchema
  return json
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (name: string) => ({ 'application/json': { schema: ref(name) } })
const errorResponse = (description: string) => ({ description, content: json('ErrorResponse') })

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'API de Rápida y Sabrosa',
      version: '1.0.0',
      description:
        'Carta y pedidos de Rápida y Sabrosa (Espacio 308). Todas las respuestas son JSON; los errores usan el ' +
        `formato ErrorResponse con uno de estos códigos: ${ERROR_CODES.join(', ')}.`,
    },
    paths: {
      '/health': {
        get: {
          summary: 'Estado de la API y de la base',
          responses: {
            200: { description: 'Todo responde.', content: json('HealthResponse') },
            503: { description: 'La base no responde.', content: json('HealthResponse') },
          },
        },
      },
      '/api/menu': {
        get: {
          summary: 'Carta completa para la web',
          description: 'Con ETag y Cache-Control: no-cache. Los agotados vienen con available: false.',
          parameters: [{ name: 'If-None-Match', in: 'header', required: false, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'La carta.',
              headers: { ETag: { schema: { type: 'string' } } },
              content: json('MenuResponse'),
            },
            304: { description: 'La carta no cambió desde ese ETag.' },
            500: errorResponse('Error inesperado.'),
          },
        },
      },
      '/api/orders': {
        post: {
          summary: 'Crea un pedido',
          description:
            'El servidor recalcula todo con @rys/domain. Con el mismo Idempotency-Key y el mismo body responde 200 ' +
            'con el mismo pedido. Rate limit: 10 por IP cada 10 minutos.',
          parameters: [
            {
              name: IDEMPOTENCY_KEY_HEADER,
              in: 'header',
              required: true,
              description: 'Un uuid nuevo por cada intento de checkout.',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: { required: true, content: json('OrderRequest') },
          responses: {
            201: { description: 'Pedido creado.', content: json('OrderResponse') },
            200: { description: 'Ya existía un pedido con esa clave y el mismo body.', content: json('OrderResponse') },
            400: errorResponse('VALIDATION_ERROR: datos inválidos (details trae un mensaje por campo).'),
            409: errorResponse(
              'STORE_CLOSED / ORDERS_PAUSED (details: StoreBlockedDetails), PRODUCT_UNAVAILABLE ' +
                '(details: ProductUnavailableDetails) o PRICE_CHANGED (details: PriceChangedDetails).',
            ),
            422: errorResponse('IDEMPOTENCY_KEY_REUSED: la clave ya se usó con otro body.'),
            429: errorResponse('RATE_LIMITED: demasiados pedidos. Ver el header Retry-After.'),
            500: errorResponse('Error inesperado.'),
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: toSchema(healthResponseSchema, 'output'),
        MenuResponse: toSchema(menuResponseSchema, 'output'),
        OrderRequest: toSchema(orderRequestSchema, 'input'),
        OrderResponse: toSchema(orderResponseSchema, 'output'),
        ErrorResponse: toSchema(errorResponseSchema, 'output'),
        PriceChangedDetails: toSchema(priceChangedDetailsSchema, 'output'),
        ProductUnavailableDetails: toSchema(productUnavailableDetailsSchema, 'output'),
        StoreBlockedDetails: toSchema(storeBlockedDetailsSchema, 'output'),
      },
    },
  }
}
