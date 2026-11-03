// npm run db:migrate: aplica las migraciones pendientes de src/db/migrations a DATABASE_URL.
import { describeDatabaseUrl, runMigrations } from '../db/client.ts'
import { runScript } from './run-script.ts'

await runScript(async ({ env, database }) => {
  await runMigrations(database.db)
  return `Migraciones al día en ${describeDatabaseUrl(env.DATABASE_URL)}.`
})
