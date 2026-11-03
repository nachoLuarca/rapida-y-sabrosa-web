import { isValidTime, type DayKey } from '@rys/domain'
import { z } from 'zod'
import { priceSchema, slugSchema, whatsappNumberSchema } from './common.ts'

// GET /api/menu (docs/BACKEND-SPEC.md → API). Lo que el local no ha confirmado viaja como null.

export const timeSchema = z.string().refine(isValidTime, { error: 'Usa una hora HH:MM, por ejemplo 19:30.' })

/** ["19:00", "01:00"]: si el fin es menor o igual al inicio, el rango cruza la medianoche. */
export const timeRangeSchema = z.tuple([timeSchema, timeSchema])

const dayRangesSchema = z.array(timeRangeSchema).max(6)

/** Rangos de cada día de la semana (los `DayKey` del dominio); un día sin rangos es un día cerrado. */
export const openingHoursSchema = z.strictObject({
  mon: dayRangesSchema,
  tue: dayRangesSchema,
  wed: dayRangesSchema,
  thu: dayRangesSchema,
  fri: dayRangesSchema,
  sat: dayRangesSchema,
  sun: dayRangesSchema,
}) satisfies z.ZodType<Record<DayKey, unknown>>

export const variantSchema = z.object({
  id: slugSchema,
  label: z.string().min(1),
  price: priceSchema,
})

/** Un producto tiene precio o variantes, nunca ambos ni ninguno. Los agotados vienen con `available: false`. */
export const productSchema = z
  .object({
    id: slugSchema,
    name: z.string().min(1),
    description: z.string().nullable(),
    price: priceSchema.nullable(),
    variants: z.array(variantSchema),
    tags: z.array(z.string()),
    imageUrl: z.string().nullable(),
    available: z.boolean(),
  })
  .refine((product) => (product.price === null) !== (product.variants.length === 0), {
    error: 'Un producto tiene precio o variantes, nunca ambos ni ninguno.',
  })

export const CATEGORY_KINDS = ['regular', 'build_pizza'] as const

/** La categoría `build_pizza` no trae productos: su configuración viene en `buildPizza`. */
export const categorySchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  kind: z.enum(CATEGORY_KINDS),
  products: z.array(productSchema),
})

export const ingredientSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  price: priceSchema,
  available: z.boolean(),
})

/** Solo zonas activas. */
export const zoneSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  fee: priceSchema,
})

export const buildPizzaSchema = z.object({
  productId: slugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  basePrice: priceSchema,
  promoPrice: priceSchema,
  includedInPromo: z.number().int().min(0).max(30),
  available: z.boolean(),
})

export const businessSchema = z.object({
  name: z.string().min(1),
  whatsappNumber: whatsappNumberSchema,
  pickupAddress: z.string().nullable(),
  /** `null`: sin horario definido, no hay restricción y la web no muestra horario. */
  openingHours: openingHoursSchema.nullable(),
  isOpen: z.boolean(),
  /** Próxima apertura (ISO 8601 con zona) si está cerrado; `null` si está abierto o no hay horario. */
  nextOpening: z.iso.datetime({ offset: true }).nullable(),
  ordersPaused: z.boolean(),
})

export const menuResponseSchema = z.object({
  categories: z.array(categorySchema),
  ingredients: z.array(ingredientSchema),
  zones: z.array(zoneSchema),
  buildPizza: buildPizzaSchema,
  business: businessSchema,
})

export type OpeningHoursDto = z.infer<typeof openingHoursSchema>
export type VariantDto = z.infer<typeof variantSchema>
export type ProductDto = z.infer<typeof productSchema>
export type CategoryKind = (typeof CATEGORY_KINDS)[number]
export type CategoryDto = z.infer<typeof categorySchema>
export type IngredientDto = z.infer<typeof ingredientSchema>
export type ZoneDto = z.infer<typeof zoneSchema>
export type BuildPizzaDto = z.infer<typeof buildPizzaSchema>
export type BusinessDto = z.infer<typeof businessSchema>
export type MenuResponse = z.infer<typeof menuResponseSchema>
