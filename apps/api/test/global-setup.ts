import type { TestProject } from 'vitest/node'
import { loadEnvFile } from '../src/config/env.ts'
import { createDatabase, describeDatabaseUrl, runMigrations } from '../src/db/client.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

/** La de docker-compose.yml. En CI llega por DATABASE_URL_TEST. */
const DEFAULT_TEST_URL = 'postgres://rys:rys@localhost:5432/rys_test'

/** Una vez antes de todos los tests: comprueba que la base de tests responde y le aplica las migraciones. */
export default async function setup(project: TestProject) {
  loadEnvFile()
  const url = process.env.DATABASE_URL_TEST || DEFAULT_TEST_URL
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`DATABASE_URL_TEST debe apuntar a una base *_test (los tests la vacían): ${describeDatabaseUrl(url)}`)
  }

  const database = createDatabase(url)
  try {
    await database.ping()
  } catch {
    await database.close()
    throw new Error(
      `Los tests de la API necesitan PostgreSQL en ${describeDatabaseUrl(url)}. ` +
        'Levántalo con `npm run db:up` desde la raíz y vuelve a correr los tests.',
    )
  }
  try {
    await runMigrations(database.db)
  } finally {
    await database.close()
  }
  project.provide('databaseUrl', url)
}
