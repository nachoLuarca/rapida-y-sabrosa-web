// npm run demo:reset: borra los pedidos y las sesiones, y deja la carta, los ajustes y los usuarios de demo como en
// docs/data. Solo corre con DEMO_MODE=true: en una base de verdad borraría los pedidos del local.
import { checkDatabase, describeDatabaseUrl } from '../db/client.ts'
import { resetDemo } from '../db/demo-reset.ts'
import { loadSeedData } from '../db/seed.ts'
import { runScript } from './run-script.ts'

await runScript(async ({ env, database }) => {
  if (!env.DEMO_MODE || !env.DEMO_PASSWORD) {
    throw new Error(
      'demo:reset borra todos los pedidos, así que solo corre en modo demo. Pon DEMO_MODE=true (y DEMO_PASSWORD) en ' +
        'apps/api/.env y vuelve a intentar. No se borró nada.',
    )
  }
  if ((await checkDatabase(database)) === 'not-migrated') {
    throw new Error('La base no tiene las tablas. Corre primero `npm run db:migrate` desde la raíz.')
  }
  const summary = await resetDemo(database.db, loadSeedData(), env.DEMO_PASSWORD)
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  return [
    `Demo reiniciada en ${describeDatabaseUrl(env.DATABASE_URL)}:`,
    `- Se borraron ${plural(summary.orders, 'pedido', 'pedidos')}; el próximo será RYS-0001.`,
    `- Se cerraron ${plural(summary.sessions, 'sesión', 'sesiones')} del panel.`,
    '- La carta, las zonas y los ajustes quedaron como en docs/data (pedidos sin pausa).',
    `- Usuarios de demo: ${summary.users.map((user) => user.email).join(' y ')}, con la contraseña de DEMO_PASSWORD.`,
    'Si el panel estaba abierto, vuelve a entrar.',
  ].join('\n')
})
