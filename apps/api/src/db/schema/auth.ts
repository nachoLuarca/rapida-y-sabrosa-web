import { sql } from 'drizzle-orm'
import { boolean, check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Usuarios del panel y sus sesiones (docs/BACKEND-SPEC.md → Autenticación y seguridad).

export const userRole = pgEnum('user_role', ['admin', 'staff'])

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Siempre en minúsculas: el login no distingue mayúsculas. */
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    /** argon2id. Nunca la contraseña. */
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    /** Desactivar un usuario invalida sus sesiones; no se borra, por el historial de pedidos. */
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('admin_users_email_lowercase', sql`${table.email} = lower(${table.email})`)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    /** SHA-256 del token de la cookie: si se filtra la base, las sesiones no se pueden usar. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)
