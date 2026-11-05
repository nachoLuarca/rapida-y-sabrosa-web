import { createHash, randomBytes } from 'node:crypto'
import type { SessionUser } from '@rys/contracts'
import { AppError } from '../errors/app-error.ts'
import type { SessionRepository } from '../repositories/session-repository.ts'
import type { UserRepository, UserRow } from '../repositories/user-repository.ts'
import type { Clock } from './catalog-service.ts'
import { dummyPasswordHash, verifyPassword } from './password.ts'

/** Una sesión renovada no vuelve a escribir en la base antes de este tiempo: cada request del panel no es un UPDATE. */
const RENEW_AFTER_MS = 60_000

export const INVALID_CREDENTIALS_MESSAGE = 'El email o la contraseña no son correctos.'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function toSessionUser(user: UserRow): SessionUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

export interface AuthenticatedSession {
  user: SessionUser
  /** Nuevo vencimiento si se renovó en este request (para volver a mandar la cookie), o null. */
  renewedUntil: Date | null
}

/**
 * Sesiones del panel (ADR-004): token opaco aleatorio de 32 bytes en una cookie; en la base, solo su SHA-256. Dura
 * SESSION_TTL_HOURS y se renueva con el uso. El logout y desactivar un usuario la invalidan al instante.
 */
export class AuthService {
  private readonly users: UserRepository
  private readonly sessions: SessionRepository
  private readonly now: Clock
  private readonly ttlMs: number

  constructor(repositories: { users: UserRepository; sessions: SessionRepository }, now: Clock, ttlHours: number) {
    this.users = repositories.users
    this.sessions = repositories.sessions
    this.now = now
    this.ttlMs = ttlHours * 60 * 60 * 1000
  }

  /** Error siempre igual: no dice si el email existe, si la contraseña está mala o si el usuario está desactivado. */
  async login(email: string, password: string): Promise<{ user: SessionUser; token: string; expiresAt: Date }> {
    const user = await this.users.findByEmail(email)
    const valid = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), password)
    if (!user || !valid || !user.active) throw new AppError('INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)

    const now = this.now()
    await this.sessions.deleteExpired(user.id, now)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + this.ttlMs)
    await this.sessions.create({ userId: user.id, tokenHash: hashToken(token), expiresAt, now })
    return { user: toSessionUser(user), token, expiresAt }
  }

  /** null si el token no existe, venció o es de un usuario desactivado (en ese caso borra todas sus sesiones). */
  async authenticate(token: string): Promise<AuthenticatedSession | null> {
    const tokenHash = hashToken(token)
    const found = await this.sessions.findWithUser(tokenHash)
    if (!found) return null

    const { session, user } = found
    const now = this.now()
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.sessions.deleteByTokenHash(tokenHash)
      return null
    }
    if (!user.active) {
      await this.sessions.deleteByUser(user.id)
      return null
    }

    let renewedUntil: Date | null = null
    if (now.getTime() - session.lastSeenAt.getTime() >= RENEW_AFTER_MS) {
      renewedUntil = new Date(now.getTime() + this.ttlMs)
      await this.sessions.touch(session.id, now, renewedUntil)
    }
    return { user: toSessionUser(user), renewedUntil }
  }

  async logout(token: string): Promise<void> {
    await this.sessions.deleteByTokenHash(hashToken(token))
  }
}
