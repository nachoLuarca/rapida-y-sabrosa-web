import { createHealthController, type HealthController } from './controllers/health-controller.ts'
import { createMenuController, type MenuController } from './controllers/menu-controller.ts'
import { createOrderController, type OrderController } from './controllers/order-controller.ts'
import type { Database } from './db/client.ts'
import { EventBus } from './events/event-bus.ts'
import { CatalogRepository } from './repositories/catalog-repository.ts'
import { HealthRepository } from './repositories/health-repository.ts'
import { OrderRepository } from './repositories/order-repository.ts'
import { SettingsRepository } from './repositories/settings-repository.ts'
import { CatalogService, type Clock } from './services/catalog-service.ts'
import { HealthService } from './services/health-service.ts'
import { OrderService } from './services/order-service.ts'

// Arma repositorios, servicios y controladores a mano (inyección por constructor, sin framework de DI).

export interface Controllers {
  health: HealthController
  menu: MenuController
  orders: OrderController
}

export interface ContainerOptions {
  database: Database
  /** Reloj inyectable: los tests fijan la hora para probar el horario. */
  clock?: Clock
  /** DEMO_MODE: los pedidos se guardan, pero sin enlace de WhatsApp. */
  demoMode?: boolean
  /** Bus de eventos; los tests pasan el suyo para escuchar lo que se publica. */
  bus?: EventBus
}

export interface Container {
  controllers: Controllers
  bus: EventBus
}

export function createContainer({
  database,
  clock = () => new Date(),
  demoMode = false,
  bus = new EventBus(),
}: ContainerOptions): Container {
  const catalogRepository = new CatalogRepository(database.db)
  const settingsRepository = new SettingsRepository(database.db)
  const orderRepository = new OrderRepository(database.db)
  const healthRepository = new HealthRepository(database)

  const catalogService = new CatalogService(catalogRepository, settingsRepository, clock)
  const healthService = new HealthService(healthRepository)
  const orderService = new OrderService(
    { catalog: catalogRepository, settings: settingsRepository, orders: orderRepository },
    bus,
    clock,
    { demoMode },
  )

  return {
    bus,
    controllers: {
      health: createHealthController(healthService),
      menu: createMenuController(catalogService),
      orders: createOrderController(orderService),
    },
  }
}
