import { describe, expect, it } from 'vitest'
import { business, parseDemoFlag, parseWhatsappNumber } from './business'

describe('parseWhatsappNumber', () => {
  it('acepta un número chileno con código país', () => {
    expect(parseWhatsappNumber('56912345678')).toBe('56912345678')
    expect(parseWhatsappNumber(' 56912345678 ')).toBe('56912345678')
  })

  it('usa el número del local si falta o no es válido', () => {
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

describe('entorno de los tests', () => {
  // vite.config.ts fija las variables: un .env local con VITE_DEMO=true no debe cambiar el resultado.
  it('corre en modo normal y con el número del local, sin importar los .env locales', () => {
    expect(business.isDemo).toBe(false)
    expect(business.whatsappNumber).toBe('56974314602')
  })
})
