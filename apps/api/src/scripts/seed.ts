// npm run db:seed: inserta en DATABASE_URL lo que falte de la carta de docs/data y de los datos del local. No
// pisa nada de lo que ya está en la base (precios, disponibilidad, ajustes); correrlo de nuevo no cambia nada.
import { checkDatabase, describeDatabaseUrl } from '../db/client.ts'
import { loadSeedData, seedDatabase } from '../db/seed.ts'
import { runScript } from './run-script.ts'

await runScript(async ({ env, database }) => {
  if ((await checkDatabase(database)) === 'not-migrated') {
    throw new Error('La base no tiene las tablas. Corre primero `npm run db:migrate` desde la raíz.')
  }
  const inserted = await seedDatabase(database.db, loadSeedData(), 'missing')
  const where = describeDatabaseUrl(env.DATABASE_URL)
  const total = Object.values(inserted).reduce((sum, count) => sum + count, 0)
  if (total === 0) return `Seed: ${where} ya tenía todo; no se insertó nada ni se cambió lo existente.`
  return [
    `Seed en ${where}: se insertó lo que faltaba (lo existente no se tocó):`,
    `${inserted.categories} categorías, ${inserted.products} productos (Arma tu pizza incluida),`,
    `${inserted.variants} variantes, ${inserted.ingredients} ingredientes, ${inserted.zones} zonas`,
    `y ${inserted.settings === 1 ? 'los ajustes del local' : 'ningún ajuste (ya existían)'}.`,
  ].join(' ')
})
