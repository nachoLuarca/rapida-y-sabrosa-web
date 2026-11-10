import { MAX_PRICE, type OpeningHoursDto } from '@rys/contracts'
import { DAY_KEYS, isValidTime, type DayKey } from '@rys/domain'
import { ApiError } from '../api/admin-api'

// Lógica pura de los formularios de gestión: lo que el local escribe → lo que se manda a la API.

export const PRICE_ERROR = 'Ingresa un precio entre $0 y $1.000.000, sin decimales.'
export const NAME_ERROR = 'Ingresa un nombre.'

/** "13.500", "$13500" o " 13 500 " → 13500. null si no es un precio entero entre 0 y 1.000.000. */
export function parsePrice(text: string): number | null {
  const digits = text.replace(/[$.\s]/g, '')
  if (!/^\d{1,7}$/.test(digits)) return null
  const price = Number(digits)
  return price <= MAX_PRICE ? price : null
}

/** "3" → 3. null si no es un entero entre min y max. */
export function parseInteger(text: string, min: number, max: number): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,9}$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value >= min && value <= max ? value : null
}

/** Los errores por campo de un VALIDATION_ERROR de la API ({ price: 'Ingresa…' }). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {}
  return Object.fromEntries(
    Object.entries(error.details).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/** El horario en edición: cada rango puede estar a medio escribir ('' en una hora). */
export type WeekDraft = Record<DayKey, [string, string][]>

export const MAX_RANGES_PER_DAY = 6

export const emptyWeek = (): WeekDraft => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] })

export function weekFromOpeningHours(openingHours: OpeningHoursDto | null): WeekDraft {
  const week = emptyWeek()
  if (!openingHours) return week
  for (const day of DAY_KEYS) week[day] = openingHours[day].map(([start, end]) => [start, end])
  return week
}

export const RANGE_ERROR = 'Completa la hora de apertura y la de cierre de cada rango.'

/** Un mensaje por cada día con un rango incompleto o con una hora que no es HH:MM. */
export function weekErrors(week: WeekDraft): Partial<Record<DayKey, string>> {
  const errors: Partial<Record<DayKey, string>> = {}
  for (const day of DAY_KEYS) {
    if (week[day].some(([start, end]) => !isValidTime(start) || !isValidTime(end))) errors[day] = RANGE_ERROR
  }
  return errors
}

/** Los errores de la API sobre el horario ("openingHours.tue.0.1") agrupados por día. */
export function weekErrorsFromApi(details: Record<string, string>): Partial<Record<DayKey, string>> {
  const errors: Partial<Record<DayKey, string>> = {}
  for (const [field, message] of Object.entries(details)) {
    const day = /^openingHours\.(\w+)/.exec(field)?.[1]
    if (day && (DAY_KEYS as readonly string[]).includes(day)) errors[day as DayKey] ??= message
  }
  return errors
}
