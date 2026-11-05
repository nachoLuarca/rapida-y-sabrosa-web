import { USER_ROLES, type UserRole } from '@rys/contracts'

export interface UserArgs {
  email: string
  name: string
  role: UserRole
}

export const USER_CREATE_USAGE =
  'Uso: npm run user:create -- --email caja@local.cl --name "Caja" --role staff   (rol: admin o staff)'

/** Lee --email, --name y --role (también --email=valor). Lanza un Error con el uso si falta algo. */
export function parseUserArgs(argv: readonly string[]): UserArgs {
  const values: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split(/=(.*)/s, 2)
    const value = inline ?? argv[index + 1]
    if (inline === undefined) index += 1
    if (value === undefined || value.startsWith('--')) throw new Error(`Falta el valor de --${key}.\n${USER_CREATE_USAGE}`)
    values[key] = value
  }

  const missing = ['email', 'name', 'role'].filter((key) => !values[key]?.trim())
  if (missing.length > 0) throw new Error(`Falta ${missing.map((key) => `--${key}`).join(', ')}.\n${USER_CREATE_USAGE}`)
  const role = values.role.trim().toLowerCase()
  if (!USER_ROLES.includes(role as UserRole)) throw new Error(`El rol debe ser admin o staff.\n${USER_CREATE_USAGE}`)
  return { email: values.email, name: values.name, role: role as UserRole }
}
