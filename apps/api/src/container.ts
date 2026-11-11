import type { RequestHandler } from 'express'
import {
  createAdminCatalogController,
  createAdminSettingsController,
  createAdminZoneController,
  type AdminCatalogController,
  type AdminSettingsController,
  type AdminZoneController,
} from './controllers/admin-management-controller.ts'
import {
  createAdminOrderController,
  HEARTBEAT_MS,
  type AdminOrderController,
} from './controllers/admin-order-controller.ts'
import { createAuthController, type AuthController } from './controllers/auth-controller.ts'
import { createHealthController, type HealthController } from './controllers/health-controller.ts'
import { createMenuController, type MenuController } from './controllers/menu-controller.ts'
import { createOrderController, type OrderController } from './controllers/order-controller.ts'
import type { Database } from './db/client.ts'
import { EventBus } from './events/event-bus.ts'
import { requireSession } from './middlewares/auth.ts'
import { checkOrigin } from './middlewares/check-origin.ts'
import { CatalogRepository } from './repositories/catalog-repository.ts'
import { HealthRepository } from './repositories/health-repository.ts'
import { OrderRepository } from './repositories/order-repository.ts'
import { SessionRepository } from './repositories/session-repository.ts'
import { SettingsRepository } from './repositories/settings-repository.ts'
import { UserRepository } from './repositories/user-repository.ts'
import { AdminOrderService } from './services/admin-order-service.ts'
import { AuthService } from './services/auth-service.ts'
import { CatalogAdminService } from './services/catalog-admin-service.ts'
import { CatalogService, type Clock } from './services/catalog-service.ts'
import { DeliveryService } from './services/delivery-service.ts'
import { HealthService } from './services/health-service.ts'
import { OrderService } from './services/order-service.ts'
import { SettingsService } from './services/settings-service.ts'

// Arma repositorios, servicios y controladores a mano (inyección por constructor, sin framework de DI).

export interface Controllers {
  health: HealthController
  menu: MenuController
  orders: OrderController
  auth: AuthController
  adminOrders: AdminOrderController
  adminCatalog: AdminCatalogController
  adminZones: AdminZoneController
  adminSettings: AdminSettingsController
  /** Middlewares del panel que dependen de servicios o de la configuración. */
  guards: { session: RequestHandler; origin: RequestHandler }
}

export interface ContainerOptions {
  database: Database
  /** Reloj inyectable: los tests fijan la hora para probar el horario y el vencimiento de las sesiones. */
  clock?: Clock
  /** DEMO_MODE: los pedidos se guardan, pero sin enlace de WhatsApp. */
  demoMode?: boolean
  /** Bus de eventos; los tests pasan el suyo para escuchar lo que se publica. */
  bus?: EventBus
  /** SESSION_TTL_HOURS. */
  sessionTtlHours?: number
  /** Orígenes que pueden hacer mutaciones del panel (ALLOWED_ORIGINS). */
  allowedOrigins?: readonly string[]
  /** Cookie Secure: fuera de desarrollo (en desarrollo y en la demo la web va por HTTP). */
  secureCookies?: boolean
  /** Cada cuánto el SSE manda un comentario para mantener viva la conexión. */
  heartbeatMs?: number
}

export interface Container {
  controllers: Controllers
  bus: EventBus
}

export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:5174']

export function createContainer({
  database,
  clock = () => new Date(),
  demoMode = false,
  bus = new EventBus(),
  sessionTtlHours = 12,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  secureCookies = false,
  heartbeatMs = HEARTBEAT_MS,
}: ContainerOptions): Container {
  const catalogRepository = new CatalogRepository(database.db)
  const settingsRepository = new SettingsRepository(database.db)
  const orderRepository = new OrderRepository(database.db)
  const userRepository = new UserRepository(database.db)
  const sessionRepository = new SessionRepository(database.db)
  const healthRepository = new HealthRepository(database)

  const catalogService = new CatalogService(catalogRepository, settingsRepository, clock)
  const healthService = new HealthService(healthRepository)
  const orderService = new OrderService(
    { catalog: catalogRepository, settings: settingsRepository, orders: orderRepository },
    bus,
    clock,
    { demoMode },
  )
  const authService = new AuthService({ users: userRepository, sessions: sessionRepository }, clock, sessionTtlHours)
  const adminOrderService = new AdminOrderService(orderRepository, bus, clock)
  const catalogAdminService = new CatalogAdminService(catalogRepository)
  const deliveryService = new DeliveryService(catalogRepository)
  const settingsService = new SettingsService(settingsRepository, clock)

  return {
    bus,
    controllers: {
      health: createHealthController(healthService),
      menu: createMenuController(catalogService),
      orders: createOrderController(orderService),
      auth: createAuthController(authService, secureCookies),
      adminOrders: createAdminOrderController(adminOrderService, bus, heartbeatMs),
      adminCatalog: createAdminCatalogController(catalogAdminService),
      adminZones: createAdminZoneController(deliveryService),
      adminSettings: createAdminSettingsController(settingsService),
      guards: { session: requireSession(authService, secureCookies), origin: checkOrigin(allowedOrigins, { allowLocalNetwork: demoMode }) },
    },
  }
}
