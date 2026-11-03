import type { Database } from '../db/client.ts'

export class HealthRepository {
  private readonly database: Database

  constructor(database: Database) {
    this.database = database
  }

  /** true si la base responde a un SELECT 1. */
  async isDatabaseUp(): Promise<boolean> {
    try {
      await this.database.ping()
      return true
    } catch {
      return false
    }
  }
}
