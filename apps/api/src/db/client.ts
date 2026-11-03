import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import * as schema from './schema/index.ts'

export type Db = NodePgDatabase<typeof schema>

export interface Database {
  db: Db
  /** SELECT 1: lanza si la base no responde. */
  ping(): Promise<void>
  close(): Promise<void>
}

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))

export function createDatabase(url: string): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    // Si la base no está arriba, que falle rápido y con un mensaje claro en vez de quedarse esperando.
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  })
  // Un cliente inactivo que se cae (p. ej. al reiniciar PostgreSQL) no debe tumbar la API.
  pool.on('error', () => {})

  const db = drizzle({ client: pool, schema })
  return {
    db,
    async ping() {
      await db.execute(sql`select 1`)
    },
    async close() {
      await pool.end()
    },
  }
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}

export type DatabaseState = 'ok' | 'unreachable' | 'not-migrated' | 'not-seeded'

/** Para avisar con claridad al arrancar: ¿la base responde, tiene las tablas y tiene los ajustes del local? */
export async function checkDatabase(database: Database): Promise<DatabaseState> {
  try {
    await database.ping()
  } catch {
    return 'unreachable'
  }
  const result = await database.db.execute<{ exists: boolean }>(
    sql`select to_regclass('public.settings') is not null as exists`,
  )
  if (!result.rows[0]?.exists) return 'not-migrated'
  const rows = await database.db.select({ id: schema.settings.id }).from(schema.settings).limit(1)
  return rows.length === 0 ? 'not-seeded' : 'ok'
}

/** "postgres://rys:***@localhost:5432/rys" → "localhost:5432/rys", sin credenciales, para los mensajes. */
export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`
  } catch {
    return 'la URL de DATABASE_URL'
  }
}
