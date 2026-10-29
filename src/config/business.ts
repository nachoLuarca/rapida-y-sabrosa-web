// Datos del local. Lo que el local podría cambiar se edita aquí, nunca dentro de un componente.
// Lo marcado como `null` está pendiente de confirmar con el local (ver docs/SPEC.md); no se inventa.

/** Número público del local, usado si VITE_WHATSAPP_NUMBER falta o no es válido. */
const DEFAULT_WHATSAPP_NUMBER = '56974314602'

/** Acepta solo dígitos con código país chileno: 56 + 9 dígitos. */
export function parseWhatsappNumber(value: string | undefined): string {
  const digits = value?.trim() ?? ''
  return /^56\d{9}$/.test(digits) ? digits : DEFAULT_WHATSAPP_NUMBER
}

export function parseDemoFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

export interface OpeningHours {
  /** Texto tal como se muestra, p. ej. "Lunes a domingo". */
  days: string
  /** Texto tal como se muestra, p. ej. "18:00 a 23:30". */
  hours: string
}

export const business = {
  name: 'Rápida y Sabrosa',
  branch: 'Espacio 308',
  city: 'Isla de Maipo',
  whatsappNumber: parseWhatsappNumber(import.meta.env.VITE_WHATSAPP_NUMBER),
  instagram: {
    handle: 'espacio_308',
    url: 'https://www.instagram.com/espacio_308/',
  },
  /** Pendiente de confirmar con el local. */
  openingHours: null as OpeningHours[] | null,
  /** Dirección para retiro. Pendiente de confirmar con el local. */
  pickupAddress: null as string | null,
  isDemo: parseDemoFlag(import.meta.env.VITE_DEMO),
} as const
