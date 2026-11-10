/** Minúsculas, sin tildes ni espacios repetidos: "Champiñón  Mechada" → "champinon mechada". */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * true si cada palabra de la búsqueda aparece en alguno de los textos, sin distinguir tildes ni
 * mayúsculas. Una búsqueda vacía coincide con todo.
 */
export function matchesSearch(query: string, ...texts: (string | undefined)[]): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeForSearch(texts.filter(Boolean).join(' '))
  return words.every((word) => haystack.includes(word))
}

/**
 * Id de catálogo a partir de un nombre: "Villa Las Mercedes (norte)" → "villa-las-mercedes-norte". Devuelve ''
 * si el nombre no tiene letras ni números.
 */
export function slugify(text: string): string {
  return normalizeForSearch(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
