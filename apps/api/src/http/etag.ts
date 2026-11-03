import { createHash } from 'node:crypto'

/** ETag fuerte a partir del contenido: cambia si cambia cualquier byte de la respuesta. */
export function etagFor(body: string): string {
  return `"${createHash('sha256').update(body).digest('base64url')}"`
}

/**
 * ¿El If-None-Match del cliente coincide con el ETag actual? Acepta una lista separada por comas, `*` y la
 * forma débil `W/"…"` (la comparación de If-None-Match es débil según RFC 9110).
 */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false
  const current = etag.replace(/^W\//, '')
  return header
    .split(',')
    .map((tag) => tag.trim())
    .some((tag) => tag === '*' || tag.replace(/^W\//, '') === current)
}
