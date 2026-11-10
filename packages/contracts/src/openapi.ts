import { z } from 'zod'
import {
  adminOrderDetailSchema,
  loginRequestSchema,
  meResponseSchema,
  ordersListResponseSchema,
  orderStreamEventSchema,
  SESSION_COOKIE,
  statusChangeRequestSchema,
} from './admin.ts'
import { ERROR_CODES, errorResponseSchema } from './errors.ts'
import { healthResponseSchema } from './health.ts'
import {
  adminIngredientSchema,
  adminProductSchema,
  adminSettingsSchema,
  adminVariantSchema,
  adminZoneSchema,
  ingredientPatchSchema,
  productPatchSchema,
  settingsPatchSchema,
  variantPatchSchema,
  zoneCreateSchema,
  zonePatchSchema,
  zonesListResponseSchema,
} from './management.ts'
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

/** Rutas del panel: cookie de sesión y, en las mutaciones, Origin permitido. */
const session = [{ session: [] }]
const unauthenticated = errorResponse('UNAUTHENTICATED: falta la sesión o venció.')
const invalidOrigin = errorResponse('INVALID_ORIGIN: el header Origin no está en ALLOWED_ORIGINS.')

function adminPaths() {
  const code = { name: 'code', in: 'path', required: true, schema: { type: 'string', example: 'RYS-0042' } }
  return {
    '/api/admin/session': {
      post: {
        summary: 'Inicia sesión (setea la cookie)',
        description: 'Rate limit: 5 intentos fallidos por IP cada 15 minutos. El error es siempre el mismo.',
        requestBody: { required: true, content: json('LoginRequest') },
        responses: {
          200: { description: 'Sesión iniciada.', content: json('MeResponse') },
          401: errorResponse('INVALID_CREDENTIALS.'),
          403: invalidOrigin,
          429: errorResponse('RATE_LIMITED.'),
        },
      },
      delete: {
        summary: 'Cierra la sesión',
        security: session,
        responses: { 204: { description: 'Sesión cerrada.' }, 401: unauthenticated, 403: invalidOrigin },
      },
    },
    '/api/admin/me': {
      get: { summary: 'Usuario actual', security: session, responses: { 200: { description: 'El usuario.', content: json('MeResponse') }, 401: unauthenticated } },
    },
    '/api/admin/orders': {
      get: {
        summary: 'Pedidos, con filtros y paginado',
        security: session,
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Uno o varios, separados por coma.' },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Código o nombre del cliente.' },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: { 200: { description: 'Una página de pedidos.', content: json('OrdersListResponse') }, 401: unauthenticated },
      },
    },
    '/api/admin/orders/stream': {
      get: {
        summary: 'Pedidos en vivo (Server-Sent Events)',
        description: 'Eventos order.created y order.updated con un OrderStreamEvent en data; heartbeat cada 25 s.',
        security: session,
        responses: { 200: { description: 'text/event-stream.' }, 401: unauthenticated },
      },
    },
    '/api/admin/orders/{code}': {
      get: {
        summary: 'Detalle de un pedido, con líneas e historial',
        security: session,
        parameters: [code],
        responses: { 200: { description: 'El pedido.', content: json('AdminOrderDetail') }, 401: unauthenticated, 404: errorResponse('NOT_FOUND.') },
      },
    },
    '/api/admin/orders/{code}/status': {
      patch: {
        summary: 'Cambia el estado de un pedido',
        security: session,
        parameters: [code],
        requestBody: { required: true, content: json('StatusChangeRequest') },
        responses: {
          200: { description: 'El pedido con su estado nuevo.', content: json('AdminOrderDetail') },
          400: errorResponse('VALIDATION_ERROR: por ejemplo, cancelar sin motivo.'),
          401: unauthenticated,
          403: invalidOrigin,
          404: errorResponse('NOT_FOUND.'),
          409: errorResponse('INVALID_TRANSITION.'),
        },
      },
    },
  }
}

/** Gestión de la carta, las zonas y los ajustes (Fase 9). */
function managementPaths() {
  const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'suprema' } }
  const forbidden = errorResponse('FORBIDDEN (el rol no puede hacer ese cambio) o INVALID_ORIGIN.')
  const patch = (summary: string, description: string, body: string, response: string) => ({
    patch: {
      summary,
      description,
      security: session,
      parameters: [id],
      requestBody: { required: true, content: json(body) },
      responses: {
        200: { description: 'El recurso con sus datos nuevos.', content: json(response) },
        400: errorResponse('VALIDATION_ERROR: details trae un mensaje por campo.'),
        401: unauthenticated,
        403: forbidden,
        404: errorResponse('NOT_FOUND.'),
      },
    },
  })
  return {
    '/api/admin/products/{id}': patch(
      'Cambia un producto',
      'Caja (staff) solo puede cambiar available; administración, todo. El precio de un producto con variantes se cambia en cada variante.',
      'ProductPatch',
      'Product',
    ),
    '/api/admin/variants/{id}': patch('Cambia una variante', 'Solo administración.', 'VariantPatch', 'Variant'),
    '/api/admin/ingredients/{id}': patch(
      'Cambia un ingrediente',
      'Caja (staff) solo puede cambiar available; administración, todo.',
      'IngredientPatch',
      'Ingredient',
    ),
    '/api/admin/zones': {
      get: {
        summary: 'Zonas de despacho, también las desactivadas',
        description: 'Solo administración.',
        security: session,
        responses: { 200: { description: 'Las zonas.', content: json('ZonesListResponse') }, 401: unauthenticated, 403: forbidden },
      },
      post: {
        summary: 'Crea una zona',
        description: 'Solo administración. El id se arma desde el nombre.',
        security: session,
        requestBody: { required: true, content: json('ZoneCreate') },
        responses: {
          201: { description: 'La zona creada.', content: json('AdminZone') },
          400: errorResponse('VALIDATION_ERROR: por ejemplo, ya existe una zona con ese nombre.'),
          401: unauthenticated,
          403: forbidden,
        },
      },
    },
    '/api/admin/zones/{id}': patch(
      'Cambia una zona',
      'Solo administración. Las zonas no se borran: se desactivan con active: false.',
      'ZonePatch',
      'AdminZone',
    ),
    '/api/admin/settings': {
      get: {
        summary: 'Ajustes del local',
        security: session,
        responses: { 200: { description: 'Los ajustes.', content: json('AdminSettings') }, 401: unauthenticated },
      },
      patch: {
        summary: 'Cambia los ajustes del local',
        description: 'Caja (staff) solo puede cambiar ordersPaused; administración, todo.',
        security: session,
        requestBody: { required: true, content: json('SettingsPatch') },
        responses: {
          200: { description: 'Los ajustes nuevos.', content: json('AdminSettings') },
          400: errorResponse('VALIDATION_ERROR: details trae un mensaje por campo.'),
          401: unauthenticated,
          403: forbidden,
        },
      },
    },
  }
}

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
      ...adminPaths(),
      ...managementPaths(),
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
      securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } },
      schemas: {
        LoginRequest: toSchema(loginRequestSchema, 'input'),
        MeResponse: toSchema(meResponseSchema, 'output'),
        OrdersListResponse: toSchema(ordersListResponseSchema, 'output'),
        AdminOrderDetail: toSchema(adminOrderDetailSchema, 'output'),
        StatusChangeRequest: toSchema(statusChangeRequestSchema, 'input'),
        OrderStreamEvent: toSchema(orderStreamEventSchema, 'output'),
        ProductPatch: toSchema(productPatchSchema, 'input'),
        Product: toSchema(adminProductSchema, 'output'),
        VariantPatch: toSchema(variantPatchSchema, 'input'),
        Variant: toSchema(adminVariantSchema, 'output'),
        IngredientPatch: toSchema(ingredientPatchSchema, 'input'),
        Ingredient: toSchema(adminIngredientSchema, 'output'),
        ZonesListResponse: toSchema(zonesListResponseSchema, 'output'),
        ZoneCreate: toSchema(zoneCreateSchema, 'input'),
        ZonePatch: toSchema(zonePatchSchema, 'input'),
        AdminZone: toSchema(adminZoneSchema, 'output'),
        AdminSettings: toSchema(adminSettingsSchema, 'output'),
        SettingsPatch: toSchema(settingsPatchSchema, 'input'),
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
