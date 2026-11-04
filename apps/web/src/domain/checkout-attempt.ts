// Intento de checkout contra la API (docs/BACKEND-SPEC.md → Cambios en la web). Cada intento lleva un
// Idempotency-Key que se guarda en sessionStorage hasta que el pedido se crea: si se cae la red y el cliente
// reintenta con los mismos datos, se reusa la clave y la API no duplica el pedido. Si cambian los datos, es otro
// intento y lleva otra clave. Solo se guarda la clave y una huella del body: nunca datos del cliente.

export const CHECKOUT_ATTEMPT_STORAGE_KEY = 'rys.checkout.v1'

export interface CheckoutAttempt {
  key: string
  /** Huella del body enviado con esa clave. */
  fingerprint: string
}

/** JSON con las claves ordenadas, para que el mismo body dé siempre la misma huella. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Huella del body (FNV-1a de 32 bits, dos veces con semillas distintas): alcanza para distinguir intentos y no
 * permite reconstruir los datos del cliente.
 */
export function requestFingerprint(body: unknown): string {
  const text = canonicalJson(body)
  const hash = (seed: number) => {
    let value = seed
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index)
      value = Math.imul(value, 0x01000193)
    }
    return (value >>> 0).toString(16).padStart(8, '0')
  }
  return `${hash(0x811c9dc5)}${hash(0x01000193)}`
}

/**
 * uuid v4 con crypto.getRandomValues. No usa crypto.randomUUID porque solo existe en contextos seguros (HTTPS o
 * localhost), y en la demo el celular abre la web por la IP del notebook, con HTTP.
 */
export function newIdempotencyKey(
  fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => {
    crypto.getRandomValues(bytes)
  },
): string {
  const bytes = new Uint8Array(16)
  fillRandom(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** La clave para este body: la guardada si el body es el mismo; si no, una nueva. */
export function attemptFor(body: unknown, stored: CheckoutAttempt | null, createKey = newIdempotencyKey): CheckoutAttempt {
  const fingerprint = requestFingerprint(body)
  return stored?.fingerprint === fingerprint ? stored : { key: createKey(), fingerprint }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function serializeAttempt(attempt: CheckoutAttempt): string {
  return JSON.stringify(attempt)
}

/** Lee el intento guardado. Devuelve null si falta o no es válido. Nunca lanza errores. */
export function parseAttempt(raw: string | null): CheckoutAttempt | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const { key, fingerprint } = data as Record<string, unknown>
    if (typeof key !== 'string' || !UUID_PATTERN.test(key)) return null
    if (typeof fingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(fingerprint)) return null
    return { key, fingerprint }
  } catch {
    return null
  }
}
