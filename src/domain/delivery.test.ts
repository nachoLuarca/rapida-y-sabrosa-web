import { describe, expect, it } from 'vitest'
import { groupZonesByFee, minDeliveryFee } from './delivery'

const zones = [
  { id: 'c', name: 'C', fee: 3000 },
  { id: 'a', name: 'A', fee: 2000 },
  { id: 'b', name: 'B', fee: 3000 },
  { id: 'd', name: 'D', fee: 2000 },
]

describe('groupZonesByFee', () => {
  it('agrupa por costo, de menor a mayor, conservando el orden de las zonas', () => {
    expect(groupZonesByFee(zones)).toEqual([
      { fee: 2000, zones: [zones[1], zones[3]] },
      { fee: 3000, zones: [zones[0], zones[2]] },
    ])
    expect(groupZonesByFee([])).toEqual([])
  })
})

describe('minDeliveryFee', () => {
  it('devuelve el despacho más barato o null sin zonas', () => {
    expect(minDeliveryFee(zones)).toBe(2000)
    expect(minDeliveryFee([])).toBeNull()
  })
})
