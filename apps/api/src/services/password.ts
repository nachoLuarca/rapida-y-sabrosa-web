import { hash, verify } from '@node-rs/argon2'

// Contraseñas del panel con argon2id (el algoritmo por defecto de @node-rs/argon2).

export const PASSWORD_MIN_LENGTH = 10

export function hashPassword(password: string): Promise<string> {
  return hash(password)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    // Un hash con otro formato nunca coincide.
    return false
  }
}

let dummyHash: Promise<string> | null = null

/**
 * Hash de una contraseña que no es de nadie. Si el email no existe, igual se verifica contra este: así un login
 * con un email inexistente tarda lo mismo que uno con la contraseña mala y no delata qué emails existen.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword('contraseña-que-no-es-de-nadie')
  return dummyHash
}
