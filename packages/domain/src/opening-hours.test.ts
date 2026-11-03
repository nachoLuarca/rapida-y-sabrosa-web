import { describe, expect, it } from 'vitest'
import { isOpenAt, isValidTime, nextOpening, orderingStatus, type OpeningHours } from './opening-hours.ts'

// Fechas fijas en UTC. En noviembre Chile continental está en UTC-3 (horario de verano) y en julio en UTC-4.
// Cambios de 2026: el sábado 4 de abril a las 24:00 el reloj vuelve a las 23:00 (esa hora se repite) y el
// domingo 6 de septiembre a las 00:00 salta a la 01:00 (esa hora no existe).
const at = (iso: string) => new Date(iso)

const hours: OpeningHours = {
  mon: [],
  tue: [
    ['12:00', '15:30'],
    ['19:00', '23:30'],
  ],
  wed: [['19:00', '23:30']],
  thu: [['19:00', '23:30']],
  fri: [['19:00', '01:00']],
  sat: [['19:00', '01:00']],
  sun: [['13:00', '22:00']],
}

describe('isValidTime', () => {
  it('acepta HH:MM de 00:00 a 23:59', () => {
    expect(['00:00', '09:05', '19:30', '23:59'].every(isValidTime)).toBe(true)
  })

  it('rechaza horas fuera de rango o sin dos dígitos', () => {
    expect(['24:00', '12:60', '9:30', '19.30', '', '19:30:00'].some(isValidTime)).toBe(false)
  })
})

describe('isOpenAt', () => {
  it('sin horario definido (null) siempre está abierto', () => {
    expect(isOpenAt(null, at('2026-11-03T08:00:00Z'))).toBe(true)
  })

  it('usa la hora de Santiago, no la UTC', () => {
    // Martes 3 de noviembre, 19:30 en Santiago = 22:30 UTC.
    expect(isOpenAt(hours, at('2026-11-03T22:30:00Z'))).toBe(true)
    // Martes 16:00 en Santiago (19:00 UTC): entre los dos rangos.
    expect(isOpenAt(hours, at('2026-11-03T19:00:00Z'))).toBe(false)
  })

  it('el inicio del rango es abierto y el fin, cerrado', () => {
    expect(isOpenAt(hours, at('2026-11-03T15:00:00Z'))).toBe(true) // 12:00
    expect(isOpenAt(hours, at('2026-11-03T18:29:00Z'))).toBe(true) // 15:29
    expect(isOpenAt(hours, at('2026-11-03T18:30:00Z'))).toBe(false) // 15:30
  })

  it('un día sin rangos está cerrado todo el día', () => {
    // Lunes 2 de noviembre, 20:00 en Santiago.
    expect(isOpenAt(hours, at('2026-11-02T23:00:00Z'))).toBe(false)
  })

  it('un día ausente cuenta como cerrado', () => {
    expect(isOpenAt({ tue: [['12:00', '15:00']] }, at('2026-11-04T16:00:00Z'))).toBe(false)
  })

  it('un rango que cruza la medianoche sigue abierto al día siguiente hasta su fin', () => {
    // Viernes 6 de noviembre 23:30 → abierto.
    expect(isOpenAt(hours, at('2026-11-07T02:30:00Z'))).toBe(true)
    // Sábado 7 a las 00:30, todavía dentro del rango del viernes.
    expect(isOpenAt(hours, at('2026-11-07T03:30:00Z'))).toBe(true)
    // Sábado 7 a la 01:00: cerró.
    expect(isOpenAt(hours, at('2026-11-07T04:00:00Z'))).toBe(false)
    // Lunes 9 a las 00:30: el domingo cierra a las 22:00 y no cruza.
    expect(isOpenAt(hours, at('2026-11-09T03:30:00Z'))).toBe(false)
  })

  it('un rango que termina a las 00:00 cierra justo a la medianoche', () => {
    const untilMidnight: OpeningHours = { tue: [['19:00', '00:00']] }
    expect(isOpenAt(untilMidnight, at('2026-11-04T02:59:00Z'))).toBe(true) // martes 23:59
    expect(isOpenAt(untilMidnight, at('2026-11-04T03:00:00Z'))).toBe(false) // miércoles 00:00
  })

  it('sigue la hora local en invierno (UTC-4)', () => {
    // Miércoles 1 de julio, 19:30 en Santiago = 23:30 UTC.
    expect(isOpenAt(hours, at('2026-07-01T23:30:00Z'))).toBe(true)
    // 18:30 en Santiago (22:30 UTC): todavía cerrado; con UTC-3 se habría creído abierto.
    expect(isOpenAt(hours, at('2026-07-01T22:30:00Z'))).toBe(false)
  })

  it('en abril, la hora que se repite cuenta las dos veces', () => {
    // Sábado 4 de abril: 23:30 de verano (02:30 UTC) y 23:30 de invierno (03:30 UTC), ambas dentro de 19:00–01:00.
    expect(isOpenAt(hours, at('2026-04-05T02:30:00Z'))).toBe(true)
    expect(isOpenAt(hours, at('2026-04-05T03:30:00Z'))).toBe(true)
    // Domingo 00:59 de invierno (04:59 UTC): abierto; 01:00 (05:00 UTC): cerrado.
    expect(isOpenAt(hours, at('2026-04-05T04:59:00Z'))).toBe(true)
    expect(isOpenAt(hours, at('2026-04-05T05:00:00Z'))).toBe(false)
  })

  it('en septiembre, el rango que cruza la medianoche termina a la 01:00 nueva', () => {
    // Sábado 5, 23:59 de invierno (03:59 UTC): abierto. El reloj salta a la 01:00 del domingo: cerrado.
    expect(isOpenAt(hours, at('2026-09-06T03:59:00Z'))).toBe(true)
    expect(isOpenAt(hours, at('2026-09-06T04:00:00Z'))).toBe(false)
  })
})

describe('nextOpening', () => {
  it('devuelve null sin horario, con el local abierto o si nunca abre', () => {
    expect(nextOpening(null, at('2026-11-03T19:00:00Z'))).toBeNull()
    expect(nextOpening(hours, at('2026-11-03T22:30:00Z'))).toBeNull()
    expect(nextOpening({}, at('2026-11-03T19:00:00Z'))).toBeNull()
    expect(nextOpening({ mon: [], tue: [] }, at('2026-11-03T19:00:00Z'))).toBeNull()
  })

  it('entre dos rangos del mismo día, abre más tarde hoy', () => {
    // Martes 16:00 → martes 19:00 (22:00 UTC).
    expect(nextOpening(hours, at('2026-11-03T19:00:00Z'))).toEqual(at('2026-11-03T22:00:00Z'))
  })

  it('después del último rango, busca el próximo día con horario', () => {
    // Domingo 8, 23:00 → el lunes está cerrado → martes 10 a las 12:00 (15:00 UTC).
    expect(nextOpening(hours, at('2026-11-09T02:00:00Z'))).toEqual(at('2026-11-10T15:00:00Z'))
  })

  it('a la madrugada, después de un rango que cruzó la medianoche, abre ese mismo día', () => {
    // Sábado 7 a las 02:00 → sábado 19:00 (22:00 UTC).
    expect(nextOpening(hours, at('2026-11-07T05:00:00Z'))).toEqual(at('2026-11-07T22:00:00Z'))
  })

  it('ordena los rangos aunque vengan desordenados', () => {
    const unordered: OpeningHours = {
      tue: [
        ['19:00', '23:00'],
        ['12:00', '15:00'],
      ],
    }
    // Martes 09:00 → 12:00.
    expect(nextOpening(unordered, at('2026-11-03T12:00:00Z'))).toEqual(at('2026-11-03T15:00:00Z'))
  })

  it('puede dar la vuelta a la semana completa', () => {
    // Solo abre los martes 12:00. Martes 3 a las 16:00 → martes 10 a las 12:00.
    expect(nextOpening({ tue: [['12:00', '15:00']] }, at('2026-11-03T19:00:00Z'))).toEqual(at('2026-11-10T15:00:00Z'))
  })

  it('usa la diferencia horaria del día en que abre, no la de hoy', () => {
    // Sábado 4 de abril a las 02:00 (verano, UTC-3) → sábado 19:00, todavía UTC-3 = 22:00 UTC.
    expect(nextOpening(hours, at('2026-04-04T05:00:00Z'))).toEqual(at('2026-04-04T22:00:00Z'))
    // Domingo 5 a la 01:30 (ya invierno) → domingo 13:00 UTC-4 = 17:00 UTC.
    expect(nextOpening(hours, at('2026-04-05T05:30:00Z'))).toEqual(at('2026-04-05T17:00:00Z'))
    // Sábado 5 de septiembre a las 10:00 (invierno) → 19:00 del mismo día, todavía UTC-4 = 23:00 UTC.
    expect(nextOpening(hours, at('2026-09-05T14:00:00Z'))).toEqual(at('2026-09-05T23:00:00Z'))
    // Domingo 6 de septiembre a las 02:00 (ya verano) → domingo 13:00 UTC-3 = 16:00 UTC.
    expect(nextOpening(hours, at('2026-09-06T05:00:00Z'))).toEqual(at('2026-09-06T16:00:00Z'))
  })

  it('si la hora de apertura cae en el salto de septiembre, abre a la 01:00 nueva', () => {
    // Abre el domingo a las 00:30, que el 6 de septiembre no existe: abre al saltar el reloj (04:00 UTC).
    const earlySunday: OpeningHours = { sun: [['00:30', '03:00']] }
    expect(nextOpening(earlySunday, at('2026-09-05T20:00:00Z'))).toEqual(at('2026-09-06T04:00:00Z'))
  })

  it('si la hora de apertura se repite en abril, abre la primera vez', () => {
    // Abre el sábado a las 23:30; el 4 de abril esa hora ocurre en verano (02:30 UTC) y otra vez en invierno.
    const lateSaturday: OpeningHours = { sat: [['23:30', '23:45']] }
    expect(nextOpening(lateSaturday, at('2026-04-04T20:00:00Z'))).toEqual(at('2026-04-05T02:30:00Z'))
  })
})

describe('orderingStatus', () => {
  const tuesday1930 = at('2026-11-03T22:30:00Z')
  const tuesday1600 = at('2026-11-03T19:00:00Z')

  it('se puede pedir sin pausa y con el local abierto', () => {
    expect(orderingStatus({ openingHours: hours, ordersPaused: false }, tuesday1930)).toEqual({
      isOpen: true,
      nextOpening: null,
      ordersPaused: false,
      blockedBy: null,
    })
  })

  it('sin horario definido no hay restricción', () => {
    expect(orderingStatus({ openingHours: null, ordersPaused: false }, tuesday1600).blockedBy).toBeNull()
  })

  it('con el local cerrado bloquea con STORE_CLOSED y la próxima apertura', () => {
    expect(orderingStatus({ openingHours: hours, ordersPaused: false }, tuesday1600)).toEqual({
      isOpen: false,
      nextOpening: at('2026-11-03T22:00:00Z'),
      ordersPaused: false,
      blockedBy: 'STORE_CLOSED',
    })
  })

  it('la pausa manda sobre el horario', () => {
    expect(orderingStatus({ openingHours: hours, ordersPaused: true }, tuesday1930).blockedBy).toBe('ORDERS_PAUSED')
    expect(orderingStatus({ openingHours: hours, ordersPaused: true }, tuesday1600).blockedBy).toBe('ORDERS_PAUSED')
    expect(orderingStatus({ openingHours: null, ordersPaused: true }, tuesday1600).blockedBy).toBe('ORDERS_PAUSED')
  })
})
