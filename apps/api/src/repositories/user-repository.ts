import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { adminUsers } from '../db/schema/index.ts'

export type UserRow = typeof adminUsers.$inferSelect
export type NewUserRow = Omit<typeof adminUsers.$inferInsert, 'id' | 'createdAt'>

/** Único lugar que lee y escribe usuarios del panel. */
export class UserRepository {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1)
    return row ?? null
  }

  /** Crea el usuario. Devuelve null si el email ya existe. */
  async create(user: NewUserRow): Promise<UserRow | null> {
    const [row] = await this.db.insert(adminUsers).values(user).onConflictDoNothing({ target: adminUsers.email }).returning()
    return row ?? null
  }

  /** Crea el usuario o, si ya existe, le pone estos datos (solo para los usuarios de demo). */
  async upsert(user: NewUserRow): Promise<UserRow> {
    const [row] = await this.db
      .insert(adminUsers)
      .values(user)
      .onConflictDoUpdate({
        target: adminUsers.email,
        set: { name: user.name, passwordHash: user.passwordHash, role: user.role, active: user.active ?? true },
      })
      .returning()
    if (!row) throw new Error(`No se pudo guardar el usuario ${user.email}.`)
    return row
  }
}
