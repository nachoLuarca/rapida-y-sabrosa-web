import type { RequestHandler } from 'express'
import type { HealthService } from '../services/health-service.ts'

export interface HealthController {
  getHealth: RequestHandler
}

/** GET /health: 200 si todo responde, 503 si la base no. Nunca se guarda en caché. */
export function createHealthController(health: HealthService): HealthController {
  return {
    async getHealth(_req, res) {
      const result = await health.check()
      res
        .status(result.status === 'ok' ? 200 : 503)
        .set('Cache-Control', 'no-store')
        .json(result)
    },
  }
}
