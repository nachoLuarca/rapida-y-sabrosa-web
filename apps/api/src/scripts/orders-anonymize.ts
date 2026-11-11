// npm run orders:anonymize -- --older-than 90d: reemplaza nombre, celular, dirección y comentario de los pedidos con
// más de esa antigüedad y conserva montos, productos, zona y estados para estadísticas. No se puede deshacer; con
// --dry-run solo dice cuántos pedidos cambiaría.
import { checkDatabase, describeDatabaseUrl } from '../db/client.ts'
import { OrderRepository } from '../repositories/order-repository.ts'
import { OrderPrivacyService } from '../services/order-privacy-service.ts'
import { parseAnonymizeArgs } from './anonymize-args.ts'
import { runScript } from './run-script.ts'

const dateFormat = new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Santiago' })

await runScript(async ({ env, database }) => {
  const args = parseAnonymizeArgs(process.argv.slice(2))
  if ((await checkDatabase(database)) === 'not-migrated') {
    throw new Error('La base no tiene las tablas. Corre primero `npm run db:migrate` desde la raíz.')
  }
  const service = new OrderPrivacyService(new OrderRepository(database.db), () => new Date())
  const { cutoff, count } = await service.anonymizeOlderThan(args.days, { dryRun: args.dryRun })
  const orders = count === 1 ? '1 pedido' : `${count} pedidos`
  const before = `anteriores al ${dateFormat.format(cutoff)}`
  const where = describeDatabaseUrl(env.DATABASE_URL)
  return args.dryRun
    ? `Prueba (--dry-run) en ${where}: se anonimizarían ${orders} ${before}. No se cambió nada.`
    : `Se anonimizaron ${orders} ${before} en ${where}. Montos y productos se conservan.`
})
