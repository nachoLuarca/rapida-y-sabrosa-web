import { Router } from 'express'
import type { Controllers } from '../container.ts'

// URLs y middlewares por módulo, sin lógica. Módulos: catalog (Fase 6); orders, delivery, settings y auth
// llegan en las fases siguientes.

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

export function createRoutes(controllers: Controllers): Router {
  const router = Router()
  router.use(healthRoutes(controllers))
  router.use('/api', catalogRoutes(controllers))
  return router
}
