// npm run db:seed: carga la carta de docs/data y los datos del local en DATABASE_URL (idempotente).
import { checkDatabase, describeDatabaseUrl } from '../db/client.ts'
import { loadSeedData, seedDatabase } from '../db/seed.ts'
import { runScript } from './run-script.ts'

await runScript(async ({ env, database }) => {
  if ((await checkDatabase(database)) === 'not-migrated') {
    throw new Error('La base no tiene las tablas. Corre primero `npm run db:migrate` desde la raíz.')
  }
  const summary = await seedDatabase(database.db, loadSeedData())
  return [
    `Seed cargado en ${describeDatabaseUrl(env.DATABASE_URL)}:`,
    `${summary.categories} categorías, ${summary.products} productos (incluye Arma tu pizza), ${summary.variants} variantes,`,
    `${summary.ingredients} ingredientes y ${summary.zones} zonas.`,
  ].join(' ')
})
