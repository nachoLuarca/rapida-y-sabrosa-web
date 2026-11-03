import { sql } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, beforeAll, inject } from 'vitest'
import { createApp } from '../src/app.ts'
import { createContainer, type ContainerOptions } from '../src/container.ts'
import { createDatabase, type Database } from '../src/db/client.ts'
import { loadSeedData, seedDatabase } from '../src/db/seed.ts'

export const silentLogger = pino({ level: 'silent' })

/** Una URL donde no hay ningún PostgreSQL: para probar qué pasa cuando la base no responde. */
export const UNREACHABLE_DATABASE_URL = 'postgres://rys:rys@127.0.0.1:1/rys_test'

/** Vacía todas las tablas de la base de tests (sin tocar las migraciones aplicadas). */
export async function truncateAll(database: Database): Promise<void> {
  const name = await database.db.execute<{ name: string }>(sql`select current_database() as name`)
  if (!name.rows[0]?.name.endsWith('_test')) throw new Error('truncateAll solo corre sobre una base *_test.')
  const tables = await database.db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  )
  if (tables.rows.length === 0) return
  const list = tables.rows.map((row) => `"${row.tablename}"`).join(', ')
  await database.db.execute(sql.raw(`truncate table ${list} restart identity cascade`))
}

/** Deja la carta y los ajustes exactamente como en docs/data (el modo 'reset' del seed). */
export async function reseed(database: Database): Promise<void> {
  await seedDatabase(database.db, loadSeedData(), 'reset')
}

/**
 * Base limpia para un archivo de tests: al empezar la vacía y carga el seed; al terminar cierra la conexión.
 * `app()` arma la API completa (createApp) contra esa base, sin abrir un puerto.
 */
export function useTestDatabase() {
  let database: Database | undefined

  beforeAll(async () => {
    database = createDatabase(inject('databaseUrl'))
    await truncateAll(database)
    await reseed(database)
  })

  afterAll(async () => {
    await database?.close()
  })

  const current = () => {
    if (!database) throw new Error('La base de tests todavía no está lista (usa useTestDatabase en el archivo).')
    return database
  }

  return {
    get database() {
      return current()
    },
    get db() {
      return current().db
    },
    app(options: Omit<ContainerOptions, 'database'> = {}) {
      return createApp({ ...createContainer({ database: current(), ...options }), logger: silentLogger })
    },
  }
}
