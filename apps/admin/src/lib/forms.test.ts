import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/admin-api'
import {
  emptyWeek,
  fieldErrors,
  parseInteger,
  parsePrice,
  RANGE_ERROR,
  weekErrors,
  weekErrorsFromApi,
  weekFromOpeningHours,
} from './forms'

describe('parsePrice', () => {
  it.each([
    ['13500', 13500],
    ['13.500', 13500],
    ['$13.500', 13500],
    [' 13 500 ', 13500],
    ['0', 0],
    ['1.000.000', 1_000_000],
  ])('%s → %d', (text, price) => {
    expect(parsePrice(text)).toBe(price)
  })

  it.each(['', ' ', '13,5', '-100', 'mil', '1000001', '12e3'])('"%s" no es un precio', (text) => {
    expect(parsePrice(text)).toBeNull()
  })
})

describe('parseInteger', () => {
  it('acepta solo enteros dentro del rango', () => {
    expect(parseInteger(' 3 ', 0, 30)).toBe(3)
    expect(parseInteger('0', 0, 30)).toBe(0)
    expect(parseInteger('31', 0, 30)).toBeNull()
    expect(parseInteger('2.5', 0, 30)).toBeNull()
    expect(parseInteger('', 0, 30)).toBeNull()
  })
})

describe('fieldErrors', () => {
  it('saca los mensajes por campo de un VALIDATION_ERROR y nada de los demás errores', () => {
    const validation = new ApiError('VALIDATION_ERROR', 'Revisa los datos.', 400, { price: 'Precio malo.', otros: 3 })
    expect(fieldErrors(validation)).toEqual({ price: 'Precio malo.' })
    expect(fieldErrors(new ApiError('FORBIDDEN', 'No puedes.', 403, { fields: ['price'] }))).toEqual({})
    expect(fieldErrors(new Error('x'))).toEqual({})
  })
})

describe('horario en edición', () => {
  it('parte del horario guardado, o de una semana vacía si no hay', () => {
    expect(weekFromOpeningHours(null)).toEqual(emptyWeek())
    const week = weekFromOpeningHours({ ...emptyWeek(), tue: [['12:00', '15:30'], ['19:00', '01:00']] })
    expect(week.tue).toEqual([['12:00', '15:30'], ['19:00', '01:00']])
    expect(week.mon).toEqual([])
  })

  it('marca los días con rangos incompletos', () => {
    const week = { ...emptyWeek(), tue: [['12:00', '']] as [string, string][], wed: [['19:00', '01:00']] as [string, string][] }
    expect(weekErrors(week)).toEqual({ tue: RANGE_ERROR })
  })

  it('agrupa por día los errores de la API', () => {
    expect(
      weekErrorsFromApi({ 'openingHours.tue.0.1': 'Usa una hora HH:MM.', 'openingHours.tue.1.0': 'Otra.', pickupAddress: 'x' }),
    ).toEqual({ tue: 'Usa una hora HH:MM.' })
  })
})
