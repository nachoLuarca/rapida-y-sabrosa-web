// npm run user:create -- --email ... --name ... --role admin|staff: crea un usuario del panel. La contraseña se pide
// por consola (dos veces, sin mostrarla) y se guarda con argon2id.
import { UserRepository } from '../repositories/user-repository.ts'
import { PASSWORD_MIN_LENGTH } from '../services/password.ts'
import { UserService } from '../services/user-service.ts'
import { promptPassword } from './prompt-password.ts'
import { runScript } from './run-script.ts'
import { parseUserArgs } from './user-args.ts'

await runScript(async ({ database }) => {
  const args = parseUserArgs(process.argv.slice(2))
  const password = await promptPassword(`Contraseña para ${args.email} (mínimo ${PASSWORD_MIN_LENGTH} caracteres): `)
  if (process.stdin.isTTY) {
    const again = await promptPassword('Repítela: ')
    if (again !== password) throw new Error('Las contraseñas no coinciden. No se creó el usuario.')
  }
  const user = await new UserService(new UserRepository(database.db)).create({ ...args, password })
  return `Usuario creado: ${user.name} <${user.email}>, rol ${user.role}.`
})
