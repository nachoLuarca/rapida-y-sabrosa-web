import type { SessionUser } from '@rys/contracts'
import { UserRepository } from '../repositories/user-repository.ts'
import { UserService, type NewUserInput } from '../services/user-service.ts'
import type { Db } from './client.ts'
import type { SeedMode } from './seed.ts'

/** Usuarios del panel en modo demo (docs/BACKEND-SPEC.md → Autenticación). La contraseña es DEMO_PASSWORD. */
export const DEMO_USERS: readonly Omit<NewUserInput, 'password'>[] = [
  { email: 'admin@demo.local', name: 'Administración', role: 'admin' },
  { email: 'caja@demo.local', name: 'Caja', role: 'staff' },
]

/**
 * 'missing': crea los que falten y no toca los que ya existen. 'reset' (demo:reset): los deja con estos datos, la
 * contraseña de DEMO_PASSWORD y activos.
 */
export async function seedDemoUsers(db: Db, password: string, mode: SeedMode = 'missing'): Promise<SessionUser[]> {
  const repository = new UserRepository(db)
  const service = new UserService(repository)
  const saved: SessionUser[] = []
  for (const user of DEMO_USERS) {
    if (mode === 'reset') {
      saved.push(await service.upsert({ ...user, password }))
    } else if (!(await repository.findByEmail(user.email))) {
      saved.push(await service.create({ ...user, password }))
    }
  }
  return saved
}
