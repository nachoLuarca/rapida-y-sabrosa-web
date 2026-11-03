import type { HealthResponse } from '@rys/contracts'
import type { HealthRepository } from '../repositories/health-repository.ts'

export class HealthService {
  private readonly health: HealthRepository

  constructor(health: HealthRepository) {
    this.health = health
  }

  async check(): Promise<HealthResponse> {
    const dbUp = await this.health.isDatabaseUp()
    return dbUp ? { status: 'ok', db: 'ok' } : { status: 'error', db: 'error' }
  }
}
