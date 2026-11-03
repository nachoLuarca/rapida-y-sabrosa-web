import { describe, expect, it } from 'vitest'
import { formatChileanMobile, formatClp, normalizeChileanMobile } from './format'

describe('formatClp', () => {
  it('usa punto de miles y signo peso, sin decimales', () => {
    expect(formatClp(12900)).toBe('$12.900')
    expect(formatClp(0)).toBe('$0')
    expect(formatClp(1500000)).toBe('$1.500.000')
  })
})

describe('normalizeChileanMobile', () => {
  it.each([
    '912345678',
    '9 1234 5678',
    '+56 9 1234-5678',
    '+56912345678',
    '56912345678',
    ' 9.1234.5678 ',
    '(9) 1234 5678',
  ])('acepta %j', (input) => {
    expect(normalizeChileanMobile(input)).toBe('56912345678')
  })

  it.each([
    '',
    '12345678',
    '812345678',
    '91234567',
    '9123456789',
    '+57 9 1234 5678',
    '226789012',
    '9 1234 567a',
    '++56912345678',
  ])('rechaza %j', (input) => {
    expect(normalizeChileanMobile(input)).toBeNull()
  })
})

describe('formatChileanMobile', () => {
  it('muestra el celular con código país y espacios', () => {
    expect(formatChileanMobile('56912345678')).toBe('+56 9 1234 5678')
    expect(formatChileanMobile('9 1234 5678')).toBe('+56 9 1234 5678')
  })

  it('deja tal cual lo que no es un celular válido', () => {
    expect(formatChileanMobile(' 1234 ')).toBe('1234')
  })
})
