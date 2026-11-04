import { buildOpenApiDocument } from '@rys/contracts'
import { Router } from 'express'
import type { Controllers } from '../container.ts'
import { createRateLimit, ORDER_RATE_LIMIT, type RateLimitOptions } from '../middlewares/rate-limit.ts'

// URLs y middlewares por módulo, sin lógica. Módulos: catalog y orders; delivery, settings y auth llegan con el
// panel (Fases 8 y 9).

export interface RouteOptions {
  /** Sirve la documentación OpenAPI en /api/docs. Solo en desarrollo. */
  docs: boolean
  orderRateLimit: RateLimitOptions
}

export const defaultRouteOptions: RouteOptions = { docs: false, orderRateLimit: ORDER_RATE_LIMIT }

function healthRoutes(controllers: Controllers): Router {
  const router = Router()
  router.get('/health', controllers.health.getHealth)
  return router
}

function catalogRoutes(controllers: Controllers): Router {
  const router = Router()
  router.get('/menu', controllers.menu.getMenu)
  return router
}

function orderRoutes(controllers: Controllers, options: RouteOptions): Router {
  const router = Router()
  router.post(
    '/orders',
    createRateLimit(
      options.orderRateLimit,
      'Hiciste muchos pedidos seguidos. Espera unos minutos y vuelve a intentarlo.',
    ),
    controllers.orders.createOrder,
  )
  return router
}

function docsRoutes(): Router {
  const router = Router()
  const document = buildOpenApiDocument()
  router.get('/docs', (_req, res) => {
    res.json(document)
  })
  return router
}

export function createRoutes(controllers: Controllers, options: RouteOptions = defaultRouteOptions): Router {
  const router = Router()
  router.use(healthRoutes(controllers))
  router.use('/api', catalogRoutes(controllers))
  router.use('/api', orderRoutes(controllers, options))
  if (options.docs) router.use('/api', docsRoutes())
  return router
}
