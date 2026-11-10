import { buildOpenApiDocument } from '@rys/contracts'
import { Router } from 'express'
import type { Controllers } from '../container.ts'
import { requireRole } from '../middlewares/auth.ts'
import {
  createRateLimit,
  LOGIN_RATE_LIMIT,
  ORDER_RATE_LIMIT,
  type RateLimitOptions,
} from '../middlewares/rate-limit.ts'

// URLs y middlewares por módulo, sin lógica. Módulos: catalog, orders, auth (con los pedidos del panel), delivery y
// settings.

export interface RouteOptions {
  /** Sirve la documentación OpenAPI en /api/docs. Solo en desarrollo. */
  docs: boolean
  orderRateLimit: RateLimitOptions
  loginRateLimit: RateLimitOptions
}

export const defaultRouteOptions: RouteOptions = {
  docs: false,
  orderRateLimit: ORDER_RATE_LIMIT,
  loginRateLimit: LOGIN_RATE_LIMIT,
}

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
    createRateLimit(options.orderRateLimit, 'Hiciste muchos pedidos seguidos. Espera unos minutos y vuelve a intentarlo.'),
    controllers.orders.createOrder,
  )
  return router
}

/** Panel: todo exige sesión, salvo el login. Las mutaciones exigen además un Origin permitido. */
function adminRoutes(controllers: Controllers, options: RouteOptions): Router {
  const { auth, adminOrders, adminCatalog, adminZones, adminSettings, guards } = controllers
  const adminOnly = requireRole('admin')
  const router = Router()
  router.use(guards.origin)
  router.post(
    '/session',
    createRateLimit(options.loginRateLimit, 'Demasiados intentos. Espera unos minutos antes de volver a intentar.'),
    auth.login,
  )

  router.use(guards.session)
  router.delete('/session', auth.logout)
  router.get('/me', auth.me)
  router.get('/orders', adminOrders.list)
  // Antes de /orders/:code, para que "stream" no se lea como un código.
  router.get('/orders/stream', adminOrders.stream)
  router.get('/orders/:code', adminOrders.detail)
  router.patch('/orders/:code/status', adminOrders.changeStatus)

  // Gestión. Donde caja (staff) puede cambiar solo algunos campos (disponible, pausa), el permiso lo revisa el
  // servicio campo por campo; el resto es solo de administración.
  router.patch('/products/:id', adminCatalog.updateProduct)
  router.patch('/variants/:id', adminOnly, adminCatalog.updateVariant)
  router.patch('/ingredients/:id', adminCatalog.updateIngredient)
  router.get('/zones', adminOnly, adminZones.list)
  router.post('/zones', adminOnly, adminZones.create)
  router.patch('/zones/:id', adminOnly, adminZones.update)
  router.get('/settings', adminSettings.get)
  router.patch('/settings', adminSettings.update)
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
  router.use('/api/admin', adminRoutes(controllers, options))
  if (options.docs) router.use('/api', docsRoutes())
  return router
}
