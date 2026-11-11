import type { SessionUser } from '@rys/contracts'
import { sql } from 'drizzle-orm'
import type { Db } from './client.ts'
import { orderCodeSequence, orders, sessions } from './schema/index.ts'
import { seedDemoUsers } from './seed-demo-users.ts'
import { seedDatabase, type SeedData, type SeedSummary } from './seed.ts'

export interface DemoResetSummary {
  /** Pedidos borrados (con sus líneas y su historial). */
  orders: number
  /** Sesiones del panel cerradas. */
  sessions: number
  catalog: SeedSummary
  users: SessionUser[]
}

/**
 * npm run demo:reset (docs/BACKEND-SPEC.md → Modo demo): deja la base lista para empezar otra demo.
 * - Borra todos los pedidos (con sus líneas y su historial) y vuelve a numerarlos desde RYS-0001.
 * - Cierra todas las sesiones del panel.
 * - Deja la carta, las zonas y los ajustes como en docs/data (el modo 'reset' del seed), incluida la pausa.
 * - Deja los usuarios de demo activos y con la contraseña de DEMO_PASSWORD.
 * No toca lo que no viene de docs/data (una zona creada en el panel) ni los demás usuarios.
 */
export async function resetDemo(db: Db, data: SeedData, demoPassword: string): Promise<DemoResetSummary> {
  const counts = await db.transaction(async (tx) => {
    const removed = { orders: await tx.$count(orders), sessions: await tx.$count(sessions) }
    // CASCADE alcanza a order_lines y order_status_history, que apuntan a orders.
    await tx.execute(sql`truncate table ${orders}, ${sessions} cascade`)
    await tx.execute(sql.raw(`alter sequence "${orderCodeSequence.seqName}" restart`))
    return removed
  })
  const catalog = await seedDatabase(db, data, 'reset')
  const users = await seedDemoUsers(db, demoPassword, 'reset')
  return { ...counts, catalog, users }
}
