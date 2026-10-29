const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

/** 12900 → "$12.900" */
export function formatClp(amount: number): string {
  return clpFormatter.format(amount)
}

/**
 * Acepta un celular chileno escrito como "912345678", "9 1234 5678" o "+56 9 1234-5678"
 * y lo devuelve como "569XXXXXXXX". Si no es un celular válido, devuelve null.
 */
export function normalizeChileanMobile(input: string): string | null {
  const compact = input.trim().replace(/[\s.\-()]/g, '')
  const digits = compact.replace(/^\+/, '')
  if (!/^\d+$/.test(digits)) return null

  const local = digits.length === 11 && digits.startsWith('56') ? digits.slice(2) : digits
  return /^9\d{8}$/.test(local) ? `56${local}` : null
}

/** "56912345678" (o cualquier formato aceptado) → "+56 9 1234 5678". Si no es válido, lo deja tal cual. */
export function formatChileanMobile(input: string): string {
  const normalized = normalizeChileanMobile(input)
  if (!normalized) return input.trim()
  return `+56 9 ${normalized.slice(3, 7)} ${normalized.slice(7)}`
}
