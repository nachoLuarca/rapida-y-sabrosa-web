// npm run db:seed: inserta en DATABASE_URL lo que falte de la carta de docs/data y de los datos del local. No
// pisa nada de lo que ya está en la base (precios, disponibilidad, ajustes); correrlo de nuevo no cambia nada.
// Con DEMO_MODE=true crea además los usuarios de demo del panel (con la contraseña de DEMO_PASSWORD).
import { checkDatabase, describeDatabaseUrl } from '../db/client.ts'
import { DEMO_USERS, seedDemoUsers } from '../db/seed-demo-users.ts'
import { loadSeedData, seedDatabase } from '../db/seed.ts'
import { runScript } from './run-script.ts'

await runScript(async ({ env, database }) => {
  if ((await checkDatabase(database)) === 'not-migrated') {
    throw new Error('La base no tiene las tablas. Corre primero `npm run db:migrate` desde la raíz.')
  }
  const inserted = await seedDatabase(database.db, loadSeedData(), 'missing')
  const where = describeDatabaseUrl(env.DATABASE_URL)
  const total = Object.values(inserted).reduce((sum, count) => sum + count, 0)
  const lines =
    total === 0
      ? [`Seed: ${where} ya tenía todo; no se insertó nada ni se cambió lo existente.`]
      : [
          [
            `Seed en ${where}: se insertó lo que faltaba (lo existente no se tocó):`,
            `${inserted.categories} categorías, ${inserted.products} productos (Arma tu pizza incluida),`,
            `${inserted.variants} variantes, ${inserted.ingredients} ingredientes, ${inserted.zones} zonas`,
            `y ${inserted.settings === 1 ? 'los ajustes del local' : 'ningún ajuste (ya existían)'}.`,
          ].join(' '),
        ]

  // parseEnv ya exige DEMO_PASSWORD cuando DEMO_MODE=true.
  if (env.DEMO_MODE && env.DEMO_PASSWORD) {
    const created = await seedDemoUsers(database.db, env.DEMO_PASSWORD, 'missing')
    const emails = DEMO_USERS.map((user) => user.email).join(' y ')
    lines.push(
      created.length > 0
        ? `Usuarios de demo creados: ${created.map((user) => user.email).join(' y ')} (contraseña: DEMO_PASSWORD).`
        : `Los usuarios de demo (${emails}) ya existían.`,
    )
  }
  return lines.join('\n')
})
