import type { SessionUser } from '@rys/contracts'

// requireSession deja aquí al usuario de la sesión.
declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser
  }
}
