import { createHealthController, type HealthController } from './controllers/health-controller.ts'
import { createMenuController, type MenuController } from './controllers/menu-controller.ts'
import type { Database } from './db/client.ts'
import { CatalogRepository } from './repositories/catalog-repository.ts'
import { HealthRepository } from './repositories/health-repository.ts'
import { SettingsRepository } from './repositories/settings-repository.ts'
import { CatalogService, type Clock } from './services/catalog-service.ts'
import { HealthService } from './services/health-service.ts'

// Arma repositorios, servicios y controladores a mano (inyección por constructor, sin framework de DI).

export interface Controllers {
  health: HealthController
  menu: MenuController
}

export interface ContainerOptions {
  database: Database
  /** Reloj inyectable: los tests fijan la hora para probar el horario. */
  clock?: Clock
}

export function createContainer({ database, clock = () => new Date() }: ContainerOptions): { controllers: Controllers } {
  const catalogRepository = new CatalogRepository(database.db)
  const settingsRepository = new SettingsRepository(database.db)
  const healthRepository = new HealthRepository(database)

  const catalogService = new CatalogService(catalogRepository, settingsRepository, clock)
  const healthService = new HealthService(healthRepository)

  return {
    controllers: {
      health: createHealthController(healthService),
      menu: createMenuController(catalogService),
    },
  }
}
