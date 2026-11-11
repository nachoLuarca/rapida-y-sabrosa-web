export interface AnonymizeArgs {
  /** Se anonimizan los pedidos con más de estos días. */
  days: number
  /** Solo cuenta cuántos se anonimizarían, sin cambiar nada. */
  dryRun: boolean
}

export const ANONYMIZE_USAGE =
  'Uso: npm run orders:anonymize -- --older-than 90d   (agrega --dry-run para ver cuántos serían, sin cambiar nada)'

/** El máximo razonable: unos 10 años. */
const MAX_DAYS = 3650

/** Lee --older-than Nd (también --older-than=Nd) y --dry-run. Lanza un Error con el uso si algo no está bien. */
export function parseAnonymizeArgs(argv: readonly string[]): AnonymizeArgs {
  let olderThan: string | undefined
  let dryRun = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--older-than') {
      olderThan = argv[index + 1]
      index += 1
    } else if (arg.startsWith('--older-than=')) {
      olderThan = arg.slice('--older-than='.length)
    } else {
      throw new Error(`No conozco la opción "${arg}".\n${ANONYMIZE_USAGE}`)
    }
  }

  if (olderThan === undefined) throw new Error(`Falta --older-than.\n${ANONYMIZE_USAGE}`)
  const match = /^(\d{1,5})d$/.exec(olderThan.trim().toLowerCase())
  const days = match ? Number(match[1]) : Number.NaN
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new Error(`--older-than debe ser una cantidad de días entre 1 y ${MAX_DAYS}, por ejemplo 90d.\n${ANONYMIZE_USAGE}`)
  }
  return { days, dryRun }
}
