import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { settings } from '../db/schema/index.ts'

export type SettingsRow = typeof settings.$inferSelect

/** Ajustes del local: una sola fila (id = 1). */
export class SettingsRepository {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  /** null si la base todavía no tiene el seed. */
  async get(): Promise<SettingsRow | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.id, 1)).limit(1)
    return row ?? null
  }
}
