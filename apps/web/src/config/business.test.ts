import { describe, expect, it } from 'vitest'
import { parseDemoFlag, parseWhatsappNumber } from './business'

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
