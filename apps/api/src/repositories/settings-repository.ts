import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { settings } from '../db/schema/index.ts'

export type SettingsRow = typeof settings.$inferSelect
export type SettingsChanges = Partial<
  Pick<
    SettingsRow,
    | 'whatsappNumber'
    | 'pickupAddress'
    | 'openingHours'
    | 'ordersPaused'
    | 'buildPizzaBasePrice'
    | 'buildPizzaPromoPrice'
    | 'buildPizzaPromoIncluded'
  >
>

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

  /** null si la base todavía no tiene el seed. */
  async update(changes: SettingsChanges, updatedAt: Date): Promise<SettingsRow | null> {
    const [row] = await this.db.update(settings).set({ ...changes, updatedAt }).where(eq(settings.id, 1)).returning()
    return row ?? null
  }
}
