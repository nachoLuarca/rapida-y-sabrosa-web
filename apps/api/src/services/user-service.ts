import type { SessionUser, UserRole } from '@rys/contracts'
import { USER_ROLES } from '@rys/contracts'
import type { UserRepository } from '../repositories/user-repository.ts'
import { toSessionUser } from './auth-service.ts'
import { hashPassword, PASSWORD_MIN_LENGTH } from './password.ts'

export interface NewUserInput {
  email: string
  name: string
  role: UserRole
  password: string
}

export class UserInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserInputError'
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Revisa los datos de un usuario nuevo y los deja normalizados (email en minúsculas, nombre sin espacios de más). */
export function validateNewUser(input: NewUserInput): NewUserInput {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!EMAIL_PATTERN.test(email)) throw new UserInputError(`"${input.email}" no es un email válido.`)
  if (name.length < 2) throw new UserInputError('El nombre debe tener al menos 2 letras.')
  if (!USER_ROLES.includes(input.role)) throw new UserInputError(`El rol debe ser ${USER_ROLES.join(' o ')}.`)
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new UserInputError(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  }
  return { email, name, role: input.role, password: input.password }
}

/** Usuarios del panel: los crea npm run user:create y, en modo demo, el seed. */
export class UserService {
  private readonly users: UserRepository

  constructor(users: UserRepository) {
    this.users = users
  }

  async create(input: NewUserInput): Promise<SessionUser> {
    const user = validateNewUser(input)
    const created = await this.users.create({
      email: user.email,
      name: user.name,
      role: user.role,
      passwordHash: await hashPassword(user.password),
    })
    if (!created) throw new UserInputError(`Ya existe un usuario con el email ${user.email}.`)
    return toSessionUser(created)
  }

  /** Para los usuarios de demo: si ya existen, les deja estos datos y esta contraseña. */
  async upsert(input: NewUserInput): Promise<SessionUser> {
    const user = validateNewUser(input)
    const saved = await this.users.upsert({
      email: user.email,
      name: user.name,
      role: user.role,
      passwordHash: await hashPassword(user.password),
      active: true,
    })
    return toSessionUser(saved)
  }
}
