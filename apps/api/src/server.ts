// Punto de entrada: lee el entorno, revisa la base, arma el container y escucha. `npm run dev` lo corre con
// tsx en modo watch. Los problemas esperables (falta configuración, la base no está arriba o no tiene las
// tablas) se explican en una línea clara, sin stack trace, y el proceso termina con código 1.
import type { Server } from 'node:http'
import { createApp } from './app.ts'
import { EnvError, loadEnvFile, parseEnv, type Env } from './config/env.ts'
import { createContainer } from './container.ts'
import { checkDatabase, createDatabase, databaseUnreachableMessage, describeDatabaseUrl } from './db/client.ts'
import { createLogger } from './logger.ts'

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

loadEnvFile()
let env: Env
try {
  env = parseEnv()
} catch (error) {
  if (error instanceof EnvError) fail(error.message)
  throw error
}

const database = createDatabase(env.DATABASE_URL)
const state = await checkDatabase(database)
if (state !== 'ok') {
  await database.close()
  const where = describeDatabaseUrl(env.DATABASE_URL)
  if (state === 'unreachable') fail(databaseUnreachableMessage(env.DATABASE_URL))
  if (state === 'not-migrated') fail(`La base ${where} no tiene las tablas. Corre \`npm run db:migrate\` desde la raíz.`)
  fail(`La base ${where} está vacía. Corre \`npm run db:seed\` desde la raíz.`)
}

const logger = createLogger(env.LOG_LEVEL)
const { controllers } = createContainer({ database, demoMode: env.DEMO_MODE })
// La documentación OpenAPI (/api/docs) solo se publica en desarrollo.
const app = createApp({ controllers, logger, routes: { docs: env.NODE_ENV === 'development' } })

const server: Server = app.listen(env.PORT)
server.on('listening', () => {
  logger.info(
    { port: env.PORT, nodeEnv: env.NODE_ENV, demo: env.DEMO_MODE, db: describeDatabaseUrl(env.DATABASE_URL) },
    `API escuchando en http://localhost:${env.PORT}`,
  )
})
server.on('error', async (error: NodeJS.ErrnoException) => {
  await database.close()
  if (error.code === 'EADDRINUSE') {
    fail(`El puerto ${env.PORT} ya está en uso. Cierra el otro proceso o cambia PORT en apps/api/.env.`)
  }
  throw error
})

let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  logger.info({ signal }, 'cerrando la API')
  server.close()
  server.closeAllConnections()
  await database.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
