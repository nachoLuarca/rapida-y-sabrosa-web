import { normalizeChileanMobile } from '@rys/domain'
import { z } from 'zod'
import { MAX_PRICE, MAX_PROMO_INCLUDED, priceSchema, slugSchema, whatsappNumberSchema } from './common.ts'
import { ingredientSchema, openingHoursSchema, variantSchema } from './menu.ts'

// Gestión del panel (docs/BACKEND-SPEC.md → Panel): productos, variantes, ingredientes, zonas y ajustes.
// Todos los PATCH son parciales: solo cambia lo que viene. Un campo desconocido o un body vacío es un
// VALIDATION_ERROR. Qué puede cambiar cada rol lo decide la API (STAFF_*_FIELDS).

const PRICE_MESSAGE = 'Ingresa un precio entre $0 y $1.000.000, sin decimales.'
const EMPTY_PATCH_MESSAGE = 'Indica al menos un cambio.'

export const NAME_MAX_LENGTH = 80
export const DESCRIPTION_MAX_LENGTH = 300
export const PICKUP_ADDRESS_MAX_LENGTH = 200

/** Precio que escribe el local: entero entre 0 y 1.000.000, con un mensaje para mostrar junto al campo. */
export const panelPriceSchema = z
  .number({ error: PRICE_MESSAGE })
  .int({ error: PRICE_MESSAGE })
  .min(0, { error: PRICE_MESSAGE })
  .max(MAX_PRICE, { error: PRICE_MESSAGE })

const nameSchema = (empty: string) =>
  z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(NAME_MAX_LENGTH, { error: `Puede tener hasta ${NAME_MAX_LENGTH} caracteres.` })

/** Texto opcional: recortado, y vacío es lo mismo que null (la web lo omite). */
const optionalText = (max: number) =>
  z
    .string({ error: 'Escribe un texto.' })
    .trim()
    .max(max, { error: `Puede tener hasta ${max} caracteres.` })
    .transform((value) => (value === '' ? null : value))
    .nullable()

const flag = z.boolean({ error: 'Debe ser verdadero o falso.' })

/** Objeto parcial y estricto: avisa en español de los campos que no existen y de un body sin cambios. */
function patchSchema<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .strictObject(shape, {
      error: (issue) =>
        issue.code === 'unrecognized_keys' ? `Estos campos no se pueden cambiar: ${issue.keys.join(', ')}.` : undefined,
    })
    .refine((patch) => Object.keys(patch).length > 0, { error: EMPTY_PATCH_MESSAGE })
}

/** PATCH /api/admin/products/:id. El precio solo se cambia aquí si el producto no tiene variantes. */
export const productPatchSchema = patchSchema({
  name: nameSchema('Ingresa el nombre del producto.').optional(),
  description: optionalText(DESCRIPTION_MAX_LENGTH).optional(),
  price: panelPriceSchema.optional(),
  available: flag.optional(),
})

/** PATCH /api/admin/variants/:id. */
export const variantPatchSchema = patchSchema({
  label: nameSchema('Ingresa el nombre de la variante.').optional(),
  price: panelPriceSchema.optional(),
})

/** PATCH /api/admin/ingredients/:id. */
export const ingredientPatchSchema = patchSchema({
  name: nameSchema('Ingresa el nombre del ingrediente.').optional(),
  price: panelPriceSchema.optional(),
  available: flag.optional(),
})

/** Una zona en el panel: también las desactivadas (la web solo recibe las activas). */
export const adminZoneSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  fee: priceSchema,
  active: z.boolean(),
})

export const zonesListResponseSchema = z.object({ zones: z.array(adminZoneSchema) })

/** POST /api/admin/zones. El id se arma desde el nombre. */
export const zoneCreateSchema = z.strictObject({
  name: nameSchema('Ingresa el nombre de la zona.'),
  fee: panelPriceSchema,
  active: flag.default(true),
})

/** PATCH /api/admin/zones/:id. Las zonas no se borran: se desactivan con `active: false`. */
export const zonePatchSchema = patchSchema({
  name: nameSchema('Ingresa el nombre de la zona.').optional(),
  fee: panelPriceSchema.optional(),
  active: flag.optional(),
})

const WHATSAPP_MESSAGE = 'Ingresa un celular chileno de 9 dígitos, por ejemplo 9 1234 5678.'

/** Acepta el número como lo escribiría el local ("+56 9 1234 5678") y lo deja como 569XXXXXXXX. */
const whatsappInputSchema = z.string({ error: WHATSAPP_MESSAGE }).transform((value, ctx) => {
  const normalized = normalizeChileanMobile(value)
  if (normalized) return normalized
  ctx.addIssue({ code: 'custom', message: WHATSAPP_MESSAGE })
  return z.NEVER
})

const promoIncludedSchema = z
  .number({ error: `Ingresa un número entre 0 y ${MAX_PROMO_INCLUDED}.` })
  .int({ error: `Ingresa un número entre 0 y ${MAX_PROMO_INCLUDED}.` })
  .min(0, { error: `Ingresa un número entre 0 y ${MAX_PROMO_INCLUDED}.` })
  .max(MAX_PROMO_INCLUDED, { error: `Ingresa un número entre 0 y ${MAX_PROMO_INCLUDED}.` })

/** GET /api/admin/settings y la respuesta del PATCH. */
export const adminSettingsSchema = z.object({
  whatsappNumber: whatsappNumberSchema,
  pickupAddress: z.string().nullable(),
  /** null: sin horario definido. */
  openingHours: openingHoursSchema.nullable(),
  timezone: z.string(),
  ordersPaused: z.boolean(),
  buildPizzaBasePrice: priceSchema,
  buildPizzaPromoPrice: priceSchema,
  buildPizzaPromoIncluded: z.number().int().min(0).max(MAX_PROMO_INCLUDED),
  updatedAt: z.iso.datetime({ offset: true }),
})

/** PATCH /api/admin/settings. */
export const settingsPatchSchema = patchSchema({
  ordersPaused: flag.optional(),
  whatsappNumber: whatsappInputSchema.optional(),
  pickupAddress: optionalText(PICKUP_ADDRESS_MAX_LENGTH).optional(),
  openingHours: openingHoursSchema.nullable().optional(),
  buildPizzaBasePrice: panelPriceSchema.optional(),
  buildPizzaPromoPrice: panelPriceSchema.optional(),
  buildPizzaPromoIncluded: promoIncludedSchema.optional(),
})

/** Lo único que caja (staff) puede cambiar en cada recurso; administración cambia todo. */
export const STAFF_PRODUCT_FIELDS = ['available'] as const
export const STAFF_INGREDIENT_FIELDS = ['available'] as const
export const STAFF_SETTINGS_FIELDS = ['ordersPaused'] as const

/**
 * Respuestas de los PATCH de la carta. El producto es como el de la carta, pero sin la regla "precio o variantes":
 * Arma tu pizza no tiene ninguno de los dos (su precio está en los ajustes).
 */
export const adminProductSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  price: priceSchema.nullable(),
  variants: z.array(variantSchema),
  available: z.boolean(),
})
export const adminVariantSchema = variantSchema
export const adminIngredientSchema = ingredientSchema

export type AdminProduct = z.infer<typeof adminProductSchema>
export type ProductPatch = z.infer<typeof productPatchSchema>
export type VariantPatch = z.infer<typeof variantPatchSchema>
export type IngredientPatch = z.infer<typeof ingredientPatchSchema>
export type AdminZone = z.infer<typeof adminZoneSchema>
export type ZonesListResponse = z.infer<typeof zonesListResponseSchema>
export type ZoneCreate = z.infer<typeof zoneCreateSchema>
export type ZoneCreateInput = z.input<typeof zoneCreateSchema>
export type ZonePatch = z.infer<typeof zonePatchSchema>
export type AdminSettings = z.infer<typeof adminSettingsSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export type SettingsPatchInput = z.input<typeof settingsPatchSchema>
