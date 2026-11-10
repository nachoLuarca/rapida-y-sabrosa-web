import type { AdminZone, ZoneCreate, ZonePatch } from '@rys/contracts'
import { normalizeForSearch, slugify } from '@rys/domain'
import { AppError } from '../errors/app-error.ts'
import type { CatalogRepository, ZoneRow } from '../repositories/catalog-repository.ts'

const toZone = ({ id, name, fee, active }: ZoneRow): AdminZone => ({ id, name, fee, active })

const DUPLICATED_NAME = 'Ya existe una zona con ese nombre.'

/** Zonas de despacho para el panel. No se borran (los pedidos antiguos las nombran): se desactivan. */
export class DeliveryService {
  private readonly catalog: CatalogRepository

  constructor(catalog: CatalogRepository) {
    this.catalog = catalog
  }

  async list(): Promise<AdminZone[]> {
    return (await this.catalog.listZones()).map(toZone)
  }

  /** El id se arma desde el nombre ("Villa Alegre" → villa-alegre); si ya existe, con un número al final. */
  async create(zone: ZoneCreate): Promise<AdminZone> {
    const existing = await this.catalog.listZones()
    assertUniqueName(existing, zone.name)

    const base = slugify(zone.name).slice(0, 90)
    if (!base) {
      const message = 'El nombre debe tener letras o números.'
      throw new AppError('VALIDATION_ERROR', message, { name: message })
    }
    const taken = new Set(existing.map((row) => row.id))
    let id = base
    for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`

    return toZone(await this.catalog.insertZone({ id, name: zone.name, fee: zone.fee, active: zone.active }))
  }

  async update(id: string, patch: ZonePatch): Promise<AdminZone> {
    if (patch.name !== undefined) {
      const others = (await this.catalog.listZones()).filter((row) => row.id !== id)
      assertUniqueName(others, patch.name)
    }
    const updated = await this.catalog.updateZone(id, patch)
    if (!updated) throw new AppError('NOT_FOUND', `No existe la zona ${id}.`)
    return toZone(updated)
  }
}

/** Dos zonas con el mismo nombre (sin distinguir tildes ni mayúsculas) confundirían al cliente en el checkout. */
function assertUniqueName(zones: ZoneRow[], name: string): void {
  const wanted = normalizeForSearch(name)
  if (zones.some((zone) => normalizeForSearch(zone.name) === wanted)) {
    throw new AppError('VALIDATION_ERROR', DUPLICATED_NAME, { name: DUPLICATED_NAME })
  }
}
