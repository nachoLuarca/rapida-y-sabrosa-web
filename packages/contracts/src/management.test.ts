import { describe, expect, it } from 'vitest'
import { validationDetails } from './errors.ts'
import {
  ingredientPatchSchema,
  productPatchSchema,
  settingsPatchSchema,
  variantPatchSchema,
  zoneCreateSchema,
  zonePatchSchema,
} from './management.ts'

const detailsOf = (result: { success: boolean; error?: Parameters<typeof validationDetails>[0] }) => {
  expect(result.success).toBe(false)
  return validationDetails(result.error!)
}

describe('productPatchSchema', () => {
  it('acepta cambios parciales, recorta los textos y deja la descripción vacía en null', () => {
    expect(productPatchSchema.parse({ name: '  Suprema  ', description: '   ', price: 13500, available: false })).toEqual({
      name: 'Suprema',
      description: null,
      price: 13500,
      available: false,
    })
    expect(productPatchSchema.parse({ available: true })).toEqual({ available: true })
    expect(productPatchSchema.parse({ description: null })).toEqual({ description: null })
  })

  it('rechaza un body sin cambios y los campos que no existen, con mensajes en español', () => {
    expect(detailsOf(productPatchSchema.safeParse({}))).toEqual({ _: 'Indica al menos un cambio.' })
    expect(detailsOf(productPatchSchema.safeParse({ categoryId: 'bebidas', id: 'x' }))).toEqual({
      _: 'Estos campos no se pueden cambiar: categoryId, id.',
    })
  })

  it.each([-1, 1_000_001, 12.5, '13000', null])('rechaza el precio %s', (price) => {
    expect(detailsOf(productPatchSchema.safeParse({ price }))).toEqual({
      price: 'Ingresa un precio entre $0 y $1.000.000, sin decimales.',
    })
  })

  it('acepta los precios de los extremos', () => {
    expect(productPatchSchema.parse({ price: 0 }).price).toBe(0)
    expect(productPatchSchema.parse({ price: 1_000_000 }).price).toBe(1_000_000)
  })

  it('exige un nombre con contenido y de hasta 80 caracteres', () => {
    expect(detailsOf(productPatchSchema.safeParse({ name: '  ' }))).toEqual({ name: 'Ingresa el nombre del producto.' })
    expect(detailsOf(productPatchSchema.safeParse({ name: 'x'.repeat(81) }))).toEqual({
      name: 'Puede tener hasta 80 caracteres.',
    })
  })
})

describe('variantPatchSchema e ingredientPatchSchema', () => {
  it('validan sus campos', () => {
    expect(variantPatchSchema.parse({ label: ' 1 L ', price: 3000 })).toEqual({ label: '1 L', price: 3000 })
    expect(detailsOf(variantPatchSchema.safeParse({ available: false }))._).toMatch(/available/)
    expect(ingredientPatchSchema.parse({ name: 'Tocino', price: 1500, available: false })).toEqual({
      name: 'Tocino',
      price: 1500,
      available: false,
    })
    expect(detailsOf(ingredientPatchSchema.safeParse({ available: 'no' }))).toEqual({
      available: 'Debe ser verdadero o falso.',
    })
  })
})

describe('zonas', () => {
  it('una zona nueva queda activa si no se dice otra cosa', () => {
    expect(zoneCreateSchema.parse({ name: ' Naltahua ', fee: 3000 })).toEqual({ name: 'Naltahua', fee: 3000, active: true })
  })

  it('una zona nueva exige nombre y costo', () => {
    expect(detailsOf(zoneCreateSchema.safeParse({}))).toEqual({
      name: 'Ingresa el nombre de la zona.',
      fee: 'Ingresa un precio entre $0 y $1.000.000, sin decimales.',
    })
  })

  it('el PATCH no deja cambiar el id', () => {
    expect(zonePatchSchema.parse({ active: false })).toEqual({ active: false })
    expect(zonePatchSchema.safeParse({ id: 'otra' }).success).toBe(false)
  })
})

describe('settingsPatchSchema', () => {
  it('normaliza el número de WhatsApp con la regla del dominio', () => {
    expect(settingsPatchSchema.parse({ whatsappNumber: '+56 9 7431 4602' })).toEqual({ whatsappNumber: '56974314602' })
    expect(settingsPatchSchema.parse({ whatsappNumber: '974314602' })).toEqual({ whatsappNumber: '56974314602' })
    expect(detailsOf(settingsPatchSchema.safeParse({ whatsappNumber: '22334455' }))).toEqual({
      whatsappNumber: 'Ingresa un celular chileno de 9 dígitos, por ejemplo 9 1234 5678.',
    })
  })

  it('la dirección de retiro vacía queda en null', () => {
    expect(settingsPatchSchema.parse({ pickupAddress: '  ' })).toEqual({ pickupAddress: null })
    expect(settingsPatchSchema.parse({ pickupAddress: ' Balmaceda 308 ' })).toEqual({ pickupAddress: 'Balmaceda 308' })
  })

  it('el horario trae los siete días con rangos HH:MM, o null para dejarlo sin horario', () => {
    const openingHours = { mon: [], tue: [['12:00', '15:30'], ['19:00', '01:00']], wed: [], thu: [], fri: [], sat: [], sun: [] }
    expect(settingsPatchSchema.parse({ openingHours })).toEqual({ openingHours })
    expect(settingsPatchSchema.parse({ openingHours: null })).toEqual({ openingHours: null })

    const badTime = { ...openingHours, tue: [['12:00', '25:00']] }
    expect(detailsOf(settingsPatchSchema.safeParse({ openingHours: badTime }))).toEqual({
      'openingHours.tue.0.1': 'Usa una hora HH:MM, por ejemplo 19:30.',
    })
    const { sun: _sun, ...sixDays } = openingHours
    expect(settingsPatchSchema.safeParse({ openingHours: sixDays }).success).toBe(false)
  })

  it('valida los precios y los ingredientes incluidos de Arma tu pizza', () => {
    expect(settingsPatchSchema.parse({ buildPizzaBasePrice: 9000, buildPizzaPromoPrice: 12000, buildPizzaPromoIncluded: 3 })).toEqual({
      buildPizzaBasePrice: 9000,
      buildPizzaPromoPrice: 12000,
      buildPizzaPromoIncluded: 3,
    })
    expect(detailsOf(settingsPatchSchema.safeParse({ buildPizzaPromoIncluded: 31, buildPizzaBasePrice: -5 }))).toEqual({
      buildPizzaPromoIncluded: 'Ingresa un número entre 0 y 30.',
      buildPizzaBasePrice: 'Ingresa un precio entre $0 y $1.000.000, sin decimales.',
    })
  })

  it('no deja cambiar el nombre del local ni la zona horaria', () => {
    expect(settingsPatchSchema.safeParse({ timezone: 'UTC' }).success).toBe(false)
  })
})
