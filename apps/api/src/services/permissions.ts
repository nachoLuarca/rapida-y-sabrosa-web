import type { SessionUser } from '@rys/contracts'
import { AppError } from '../errors/app-error.ts'

/**
 * Permisos por campo (docs/BACKEND-SPEC.md → Roles): administración cambia todo; caja (staff), solo los campos de
 * `staffFields` (la disponibilidad y la pausa). Si el cambio trae algo más, no se aplica nada.
 */
export function assertCanChange(user: SessionUser, changes: object, staffFields: readonly string[]): void {
  if (user.role === 'admin') return
  const denied = Object.keys(changes).filter((field) => !staffFields.includes(field))
  if (denied.length > 0) {
    throw new AppError('FORBIDDEN', 'Tu usuario no tiene permiso para hacer este cambio.', { fields: denied })
  }
}
