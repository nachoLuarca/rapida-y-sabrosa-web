/** La base no tiene lo mínimo para armar la carta: falta correr las migraciones o el seed. */
export class MissingSeedError extends Error {
  constructor(what: string) {
    super(`${what}. Corre \`npm run db:seed\` desde la raíz.`)
    this.name = 'MissingSeedError'
  }
}
