// Horario del local (docs/BACKEND-SPEC.md → Horario). Todo se calcula en la zona horaria del local
// (America/Santiago), con Intl: así los cambios de horario de Chile salen solos, sin tablas de fechas.

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export type DayKey = (typeof DAY_KEYS)[number]

/** Rango "HH:MM"–"HH:MM". Si el fin es menor o igual al inicio, cruza la medianoche: ["19:00", "01:00"]. */
export type TimeRange = readonly [start: string, end: string]

/** Rangos por día. Un día sin rangos (o ausente) es un día cerrado. */
export type OpeningHours = Partial<Record<DayKey, readonly TimeRange[]>>

export const DEFAULT_TIMEZONE = 'America/Santiago'

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** "09:30" → true; "9:30", "24:00" o "12:60" → false. */
export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value)
}

/** "19:30" → 1170 (minutos desde la medianoche). */
function toMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time)
  if (!match) throw new RangeError(`Hora inválida: "${time}". Usa HH:MM.`)
  return Number(match[1]) * 60 + Number(match[2])
}

interface LocalTime {
  /** Día de la semana local. */
  day: DayKey
  /** Fecha local comparable como número: 20261103. */
  dateKey: number
  year: number
  month: number
  dayOfMonth: number
  /** Minutos desde la medianoche local. */
  minutes: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
    formatters.set(timezone, formatter)
  }
  return formatter
}

const WEEKDAYS: Record<string, DayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
}

function localTime(date: Date, timezone: string): LocalTime {
  const parts = Object.fromEntries(formatterFor(timezone).formatToParts(date).map((part) => [part.type, part.value]))
  const year = Number(parts.year)
  const month = Number(parts.month)
  const dayOfMonth = Number(parts.day)
  const day = WEEKDAYS[parts.weekday ?? '']
  if (!day) throw new RangeError(`No se pudo leer la fecha en la zona horaria ${timezone}.`)
  return {
    day,
    year,
    month,
    dayOfMonth,
    dateKey: year * 10_000 + month * 100 + dayOfMonth,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const crossesMidnight = (start: number, end: number) => end <= start

/**
 * ¿Está abierto el local en ese instante? `null` es "sin horario definido": no hay restricción.
 * Un rango que cruza la medianoche se cuenta en el día en que empieza: ["19:00","01:00"] del viernes
 * cubre el viernes desde las 19:00 y el sábado hasta la 01:00.
 */
export function isOpenAt(openingHours: OpeningHours | null, date: Date, timezone: string = DEFAULT_TIMEZONE): boolean {
  if (openingHours === null) return true
  const now = localTime(date, timezone)

  const today = openingHours[now.day] ?? []
  for (const [startText, endText] of today) {
    const start = toMinutes(startText)
    const end = toMinutes(endText)
    if (crossesMidnight(start, end) ? now.minutes >= start : now.minutes >= start && now.minutes < end) return true
  }

  const yesterday = openingHours[previousDay(now.day)] ?? []
  for (const [startText, endText] of yesterday) {
    const start = toMinutes(startText)
    const end = toMinutes(endText)
    if (crossesMidnight(start, end) && now.minutes < end) return true
  }

  return false
}

function previousDay(day: DayKey): DayKey {
  return DAY_KEYS[(DAY_KEYS.indexOf(day) + 6) % 7]
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Diferencia (en ms) entre la hora local y UTC en ese instante. -3 h en verano de Chile, -4 h en invierno. */
function offsetAt(instant: number, timezone: string): number {
  const local = localTime(new Date(instant), timezone)
  const asUtc = Date.UTC(local.year, local.month - 1, local.dayOfMonth) + local.minutes * MINUTE
  const truncated = instant - (((instant % MINUTE) + MINUTE) % MINUTE)
  return asUtc - truncated
}

/**
 * Instante en que el reloj local marca esa fecha y hora. Si esa hora no existe (el salto de septiembre en
 * Chile, de 00:00 a 01:00), devuelve el primer instante después del salto.
 */
function zonedInstant(year: number, month: number, dayOfMonth: number, minutes: number, timezone: string): number {
  const wall = Date.UTC(year, month - 1, dayOfMonth) + minutes * MINUTE
  const first = wall - offsetAt(wall, timezone)
  const second = wall - offsetAt(first, timezone)
  const wanted = year * 10_000 + month * 100 + dayOfMonth
  const reaches = (instant: number) => {
    const local = localTime(new Date(instant), timezone)
    return local.dateKey > wanted || (local.dateKey === wanted && local.minutes >= minutes)
  }

  const candidate = Math.min(first, second)
  if (reaches(candidate) && !reaches(candidate - MINUTE)) return candidate
  const other = Math.max(first, second)
  if (reaches(other) && !reaches(other - MINUTE)) return other

  // La hora cae en el salto: avanza minuto a minuto (a lo más una hora) hasta que el reloj la alcance.
  let instant = candidate
  while (!reaches(instant)) instant += MINUTE
  return instant
}

/**
 * Próxima apertura después de `date`, para mostrar "Abrimos hoy a las 19:00". Devuelve `null` si el local
 * está abierto, si no tiene horario definido o si no abre ningún día.
 */
export function nextOpening(
  openingHours: OpeningHours | null,
  date: Date,
  timezone: string = DEFAULT_TIMEZONE,
): Date | null {
  if (openingHours === null || isOpenAt(openingHours, date, timezone)) return null

  const now = date.getTime()
  const today = localTime(date, timezone)
  // Mediodía UTC del día local de hoy: sumar días desde ahí nunca se salta ni repite una fecha.
  const anchor = Date.UTC(today.year, today.month - 1, today.dayOfMonth, 12)

  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(anchor + offset * DAY)
    const dayKey = DAY_KEYS[(day.getUTCDay() + 6) % 7]
    const starts = (openingHours[dayKey] ?? []).map(([start]) => toMinutes(start)).sort((a, b) => a - b)
    for (const start of starts) {
      const instant = zonedInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), start, timezone)
      if (instant > now) return new Date(instant)
    }
  }
  return null
}

export type OrderingBlock = 'ORDERS_PAUSED' | 'STORE_CLOSED'

export interface OrderingStatus {
  isOpen: boolean
  /** Próxima apertura si está cerrado; `null` si está abierto o no tiene horario. */
  nextOpening: Date | null
  ordersPaused: boolean
  /** Por qué no se puede pedir ahora, o `null` si se puede. La pausa manda sobre el horario. */
  blockedBy: OrderingBlock | null
}

/** Se puede pedir solo si los pedidos no están pausados y (no hay horario o el local está abierto). */
export function orderingStatus(
  settings: { openingHours: OpeningHours | null; ordersPaused: boolean; timezone?: string },
  date: Date,
): OrderingStatus {
  const timezone = settings.timezone ?? DEFAULT_TIMEZONE
  const isOpen = isOpenAt(settings.openingHours, date, timezone)
  return {
    isOpen,
    nextOpening: nextOpening(settings.openingHours, date, timezone),
    ordersPaused: settings.ordersPaused,
    blockedBy: settings.ordersPaused ? 'ORDERS_PAUSED' : isOpen ? null : 'STORE_CLOSED',
  }
}

const DAY_NAMES: Record<DayKey, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

const listFormat = new Intl.ListFormat('es', { type: 'conjunction' })

export interface OpeningHoursLine {
  /** "Martes a jueves", "Viernes y sábado", "Domingo". */
  days: string
  /** "12:00 a 15:30 y 19:00 a 23:30". */
  hours: string
}

/**
 * Horario para mostrar: agrupa los días seguidos (de lunes a domingo) que tienen los mismos rangos y omite los
 * días cerrados. Un rango que cruza la medianoche se muestra tal cual: "19:00 a 01:00".
 */
export function describeOpeningHours(openingHours: OpeningHours): OpeningHoursLine[] {
  const lines: { from: DayKey; to: DayKey; count: number; hours: string }[] = []
  // Texto del día anterior: '' si estuvo cerrado, así un día cerrado corta el grupo.
  let previousHours = ''

  for (const day of DAY_KEYS) {
    const ranges = [...(openingHours[day] ?? [])].sort(([a], [b]) => toMinutes(a) - toMinutes(b))
    const hours = listFormat.format(ranges.map(([start, end]) => `${start} a ${end}`))
    const last = lines.at(-1)
    if (hours !== '' && hours === previousHours && last) {
      last.to = day
      last.count += 1
    } else if (hours !== '') {
      lines.push({ from: day, to: day, count: 1, hours })
    }
    previousHours = hours
  }

  return lines.map(({ from, to, count, hours }) => {
    const first = DAY_NAMES[from]
    const lastName = DAY_NAMES[to].toLowerCase()
    const days = count === 1 ? first : count === 2 ? `${first} y ${lastName}` : `${first} a ${lastName}`
    return { days, hours }
  })
}

const LOWERCASE_DAY_NAMES: Record<DayKey, string> = {
  mon: 'lunes',
  tue: 'martes',
  wed: 'miércoles',
  thu: 'jueves',
  fri: 'viernes',
  sat: 'sábado',
  sun: 'domingo',
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * Cuándo abre, para "Abrimos hoy a las 19:00": "hoy a las 19:00", "mañana a las 12:00", "el martes a las
 * 12:00" (dentro de la semana) o "el martes 10 de noviembre a las 12:00" (el mismo día de la semana siguiente).
 */
export function describeNextOpening(next: Date, now: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const opening = localTime(next, timezone)
  const today = localTime(now, timezone)
  const days = Math.round(
    (Date.UTC(opening.year, opening.month - 1, opening.dayOfMonth) - Date.UTC(today.year, today.month - 1, today.dayOfMonth)) /
      DAY,
  )
  const hour = `${String(Math.floor(opening.minutes / 60)).padStart(2, '0')}:${String(opening.minutes % 60).padStart(2, '0')}`
  // "a la 01:00", pero "a las 19:00".
  const at = `${opening.minutes < 120 && opening.minutes >= 60 ? 'a la' : 'a las'} ${hour}`

  if (days <= 0) return `hoy ${at}`
  if (days === 1) return `mañana ${at}`
  const dayName = LOWERCASE_DAY_NAMES[opening.day]
  if (days < 7) return `el ${dayName} ${at}`
  return `el ${dayName} ${opening.dayOfMonth} de ${MONTH_NAMES[opening.month - 1]} ${at}`
}
