// Datos del local para el seed. Son los mismos de apps/web/src/config/business.ts (una app no puede importar
// otra, así que se copian): si allá cambian, cambiar aquí también. Lo pendiente de confirmar con el local sigue
// en null y la web lo omite; no se inventa.

export const businessSeed = {
  name: 'Rápida y Sabrosa',
  /** Número público del local (DEFAULT_WHATSAPP_NUMBER de la web). */
  whatsappNumber: '56974314602',
  /** Pendiente de confirmar con el local. */
  pickupAddress: null,
  /** Pendiente de confirmar con el local: sin horario definido, no hay restricción. */
  openingHours: null,
  timezone: 'America/Santiago',
  ordersPaused: false,
} as const
