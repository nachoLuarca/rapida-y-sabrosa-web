import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeForSearch } from './search'

describe('normalizeForSearch', () => {
  it('quita tildes, eñes, mayúsculas y espacios repetidos', () => {
    expect(normalizeForSearch('  Champiñón   MECHADA ')).toBe('champinon mechada')
    expect(normalizeForSearch('Camarón ecuatoriano')).toBe('camaron ecuatoriano')
  })
})

describe('matchesSearch', () => {
  const name = 'Mechada champiñón'
  const description = 'Champiñón, carne mechada, mozzarella y salsa de tomate.'

  it('busca sin distinguir tildes ni mayúsculas, en nombre y descripción', () => {
    expect(matchesSearch('champinon', name, description)).toBe(true)
    expect(matchesSearch('CHAMPIÑÓN', name, description)).toBe(true)
    expect(matchesSearch('mozzarella', name, description)).toBe(true)
  })

  it('exige que estén todas las palabras, en cualquier orden', () => {
    expect(matchesSearch('tomate mechada', name, description)).toBe(true)
    expect(matchesSearch('mechada pollo', name, description)).toBe(false)
  })

  it('las palabras pueden estar repartidas entre producto y categoría', () => {
    expect(matchesSearch('JUGO', 'Mango', undefined, 'Jugos naturales')).toBe(true)
    expect(matchesSearch('jugo mango', 'Mango', undefined, 'Jugos naturales')).toBe(true)
    expect(matchesSearch('jugo mango', 'Piña', undefined, 'Jugos naturales')).toBe(false)
  })

  it('una búsqueda vacía coincide con todo y acepta textos opcionales', () => {
    expect(matchesSearch('   ', name)).toBe(true)
    expect(matchesSearch('coca', 'Coca-Cola', undefined)).toBe(true)
  })
})
