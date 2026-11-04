import type { OpeningHours, PaymentMethod } from '@rys/domain'
import businessJson from '../../../../docs/data/business.json'
// Datos del local. Vienen de docs/data/business.json, la misma fuente que usa el seed de la API: si cambia algo
// del local, se cambia ahí, nunca dentro de un componente. Lo que está en `null` está pendiente de confirmar con
// el local (ver docs/SPEC.md); no se inventa. Un test valida el formato del archivo.

/** Forma de docs/data/business.json. */
export interface BusinessData {
  name: string
  branch: string
  city: string
  /** Número público del local: solo dígitos con código país (56 + 9 dígitos). */
  whatsappNumber: string
  instagram: { handle: string; url: string }
  /** Dirección para retiro. */
  pickupAddress: string | null
  /** Rangos "HH:MM" de cada día (los siete días); `null` = sin horario definido, la web no lo muestra. */
  openingHours: OpeningHours | null
  timezone: string
  /** Se paga al recibir o al retirar. */
  paymentMethods: PaymentMethod[]
}

export const businessData = businessJson as BusinessData

/** Número público del local, usado si VITE_WHATSAPP_NUMBER falta o no es válido. */
const DEFAULT_WHATSAPP_NUMBER = businessData.whatsappNumber

/** Acepta solo dígitos con código país chileno: 56 + 9 dígitos. */
export function parseWhatsappNumber(value: string | undefined): string {
  const digits = value?.trim() ?? ''
  return /^56\d{9}$/.test(digits) ? digits : DEFAULT_WHATSAPP_NUMBER
}

export function parseDemoFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

export const business = {
  name: businessData.name,
  branch: businessData.branch,
  city: businessData.city,
  whatsappNumber: parseWhatsappNumber(import.meta.env.VITE_WHATSAPP_NUMBER),
  instagram: businessData.instagram,
  // El horario y la dirección de retiro llegan con la carta (data-source/menu-data.ts): con la API los define
  // el local desde el panel.
  paymentMethods: businessData.paymentMethods,
  isDemo: parseDemoFlag(import.meta.env.VITE_DEMO),
} as const
