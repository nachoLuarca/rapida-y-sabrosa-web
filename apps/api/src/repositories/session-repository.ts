import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { adminUsers, sessions } from '../db/schema/index.ts'
import type { UserRow } from './user-repository.ts'

export type SessionRow = typeof sessions.$inferSelect

/** Único lugar que lee y escribe sesiones. Solo conoce el hash del token, nunca el token. */
export class SessionRepository {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async create(session: { userId: string; tokenHash: string; expiresAt: Date; now: Date }): Promise<SessionRow> {
    const { now, ...values } = session
    // Las fechas salen del reloj del servicio, no de la base: así se comparan siempre con la misma hora.
    const [row] = await this.db.insert(sessions).values({ ...values, createdAt: now, lastSeenAt: now }).returning()
    if (!row) throw new Error('La sesión no se guardó.')
    return row
  }

  async findWithUser(tokenHash: string): Promise<{ session: SessionRow; user: UserRow } | null> {
    const [row] = await this.db
      .select({ session: sessions, user: adminUsers })
      .from(sessions)
      .innerJoin(adminUsers, eq(adminUsers.id, sessions.userId))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)
    return row ?? null
  }

  /** Renueva la sesión con el uso. */
  async touch(sessionId: string, now: Date, expiresAt: Date): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, sessionId))
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId))
  }

  /** Borra las sesiones vencidas de un usuario (al iniciar sesión, para que no se acumulen). */
  async deleteExpired(userId: string, now: Date): Promise<void> {
    await this.db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)))
  }
}
