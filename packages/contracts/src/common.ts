import { z } from 'zod'

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Ids de catálogo: los slugs de docs/data/*.json ("suprema", "jugo-mango-1l"). */
export const slugSchema = z.string().max(100).regex(SLUG_PATTERN, { error: 'Id inválido.' })

/** Pesos chilenos enteros. El tope es el mismo que valida el panel. */
export const MAX_PRICE = 1_000_000

export const priceSchema = z.number().int().min(0).max(MAX_PRICE)

/** Número de WhatsApp: solo dígitos con código país chileno (56 + 9 dígitos). */
export const whatsappNumberSchema = z.string().regex(/^56\d{9}$/)
