import { EnvError, loadEnvFile, parseEnv, type Env } from '../config/env.ts'
import { createDatabase, describeDatabaseUrl, type Database } from '../db/client.ts'

/** Mensaje para cuando PostgreSQL no responde: qué pasó y qué hacer, sin stack trace. */
export function databaseUnreachableMessage(url: string): string {
  return [
    `No se pudo conectar a PostgreSQL en ${describeDatabaseUrl(url)}.`,
    'Levanta la base desde la raíz del repositorio con `npm run db:up` (necesita Docker corriendo) y vuelve a intentar.',
  ].join('\n')
}

/**
 * Corre un comando de consola de la API (migrar, sembrar…): carga apps/api/.env, valida el entorno, abre la
 * base y la cierra al final. Los errores esperables se muestran como un mensaje claro, sin stack trace.
 */
export async function runScript(main: (context: { env: Env; database: Database }) => Promise<string>): Promise<void> {
  loadEnvFile()
  let env: Env
  try {
    env = parseEnv()
  } catch (error) {
    if (!(error instanceof EnvError)) throw error
    console.error(error.message)
    process.exitCode = 1
    return
  }

  const database = createDatabase(env.DATABASE_URL)
  try {
    await database.ping()
  } catch {
    console.error(databaseUnreachableMessage(env.DATABASE_URL))
    process.exitCode = 1
    await database.close()
    return
  }

  try {
    console.log(await main({ env, database }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await database.close()
  }
}
