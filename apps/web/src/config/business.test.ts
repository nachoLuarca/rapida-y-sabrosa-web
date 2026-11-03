import { DAY_KEYS, isValidTime, type PaymentMethod } from '@rys/domain'
import { describe, expect, it } from 'vitest'
import { business, businessData, parseDemoFlag, parseWhatsappNumber } from './business'

describe('parseWhatsappNumber', () => {
  it('acepta un número chileno con código país', () => {
    expect(parseWhatsappNumber('56912345678')).toBe('56912345678')
    expect(parseWhatsappNumber(' 56912345678 ')).toBe('56912345678')
  })

  it('usa el número del local (docs/data/business.json) si falta o no es válido', () => {
    expect(businessData.whatsappNumber).toBe('56974314602')
    expect(parseWhatsappNumber(undefined)).toBe('56974314602')
    expect(parseWhatsappNumber('')).toBe('56974314602')
    expect(parseWhatsappNumber('+56 9 1234 5678')).toBe('56974314602')
    expect(parseWhatsappNumber('912345678')).toBe('56974314602')
  })
})

describe('parseDemoFlag', () => {
  it('solo activa el modo demo con "true"', () => {
    expect(parseDemoFlag('true')).toBe(true)
    expect(parseDemoFlag('TRUE')).toBe(true)
    expect(parseDemoFlag('false')).toBe(false)
    expect(parseDemoFlag('1')).toBe(false)
    expect(parseDemoFlag(undefined)).toBe(false)
  })
})

describe('docs/data/business.json', () => {
  // El seed de la API lo valida con Zod al sembrar; esto lo revisa también desde la web.
  const PAYMENT_METHODS: PaymentMethod[] = ['Efectivo', 'Transferencia', 'Tarjeta']

  it('tiene nombre, sucursal, ciudad, Instagram y un número 56 + 9 dígitos', () => {
    for (const text of [businessData.name, businessData.branch, businessData.city, businessData.instagram.handle]) {
      expect(text.trim()).not.toBe('')
    }
    expect(businessData.whatsappNumber).toMatch(/^56\d{9}$/)
    expect(businessData.instagram.url).toBe(`https://www.instagram.com/${businessData.instagram.handle}/`)
  })

  it('deja en null lo pendiente o trae un valor con el formato correcto', () => {
    const { pickupAddress, openingHours } = businessData
    if (pickupAddress !== null) expect(pickupAddress.trim()).not.toBe('')
    if (openingHours !== null) {
      expect(Object.keys(openingHours).sort()).toEqual([...DAY_KEYS].sort())
      for (const ranges of Object.values(openingHours)) {
        for (const [start, end] of ranges ?? []) expect(isValidTime(start) && isValidTime(end)).toBe(true)
      }
    }
  })

  it('tiene una zona horaria válida y formas de pago conocidas, sin repetir', () => {
    expect(() => new Intl.DateTimeFormat('es-CL', { timeZone: businessData.timezone })).not.toThrow()
    expect(businessData.paymentMethods.length).toBeGreaterThan(0)
    expect(businessData.paymentMethods.every((method) => PAYMENT_METHODS.includes(method))).toBe(true)
    expect(new Set(businessData.paymentMethods).size).toBe(businessData.paymentMethods.length)
  })

  it('es lo que usa la web', () => {
    expect(business).toMatchObject({
      name: businessData.name,
      branch: businessData.branch,
      city: businessData.city,
      instagram: businessData.instagram,
      pickupAddress: businessData.pickupAddress,
      paymentMethods: businessData.paymentMethods,
    })
    expect(business.openingHours === null).toBe(businessData.openingHours === null)
  })
})

describe('entorno de los tests', () => {
  // vite.config.ts fija las variables: un .env local con VITE_DEMO=true no debe cambiar el resultado.
  it('corre en modo normal y con el número del local, sin importar los .env locales', () => {
    expect(business.isDemo).toBe(false)
    expect(business.whatsappNumber).toBe('56974314602')
  })
})
