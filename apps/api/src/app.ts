import express, { type Express } from 'express'
import helmet from 'helmet'
import type { Controllers } from './container.ts'
import { createRequestLogger, type Logger } from './logger.ts'
import { errorHandler, notFound } from './middlewares/error-handler.ts'
import { createRoutes, defaultRouteOptions, type RouteOptions } from './routes/index.ts'

export interface AppDeps {
  controllers: Controllers
  logger: Logger
  routes?: Partial<RouteOptions>
}

export const BODY_LIMIT = '32kb'

/** Monta la API completa sin abrir un puerto: server.ts la pone a escuchar y los tests la usan con supertest. */
export function createApp({ controllers, logger, routes }: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  // El ETag del menú lo calcula su controlador; el automático de Express no se usa.
  app.set('etag', false)
  // En desarrollo y en la demo los requests llegan por el proxy de Vite (en este mismo computador), que agrega
  // X-Forwarded-For. Solo se le cree a un proxy local: así el rate limit ve la IP real de cada celular.
  app.set('trust proxy', 'loopback')

  app.use(createRequestLogger(logger))
  app.use(helmet())
  app.use(express.json({ limit: BODY_LIMIT }))

  app.use(createRoutes(controllers, { ...defaultRouteOptions, ...routes }))
  app.use(notFound)
  app.use(errorHandler(logger))
  return app
}
