import type { Zone } from './types'

export interface ZoneGroup {
  fee: number
  zones: Zone[]
}

/** Zonas agrupadas por costo de despacho, de menor a mayor, conservando el orden de la lista. */
export function groupZonesByFee(zones: Zone[]): ZoneGroup[] {
  const groups = new Map<number, Zone[]>()
  for (const zone of zones) groups.set(zone.fee, [...(groups.get(zone.fee) ?? []), zone])
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([fee, grouped]) => ({ fee, zones: grouped }))
}

/** Costo de despacho más bajo, o null si no hay zonas. */
export function minDeliveryFee(zones: Zone[]): number | null {
  return zones.length === 0 ? null : Math.min(...zones.map((zone) => zone.fee))
}
