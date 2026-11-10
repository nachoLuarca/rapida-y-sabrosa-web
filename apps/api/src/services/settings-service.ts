import { STAFF_SETTINGS_FIELDS, type AdminSettings, type SessionUser, type SettingsPatch } from '@rys/contracts'
import type { SettingsRepository, SettingsRow } from '../repositories/settings-repository.ts'
import type { Clock } from './catalog-service.ts'
import { MissingSeedError } from './missing-seed-error.ts'
import { assertCanChange } from './permissions.ts'

const toSettings = (row: SettingsRow): AdminSettings => ({
  whatsappNumber: row.whatsappNumber,
  pickupAddress: row.pickupAddress,
  openingHours: row.openingHours,
  timezone: row.timezone,
  ordersPaused: row.ordersPaused,
  buildPizzaBasePrice: row.buildPizzaBasePrice,
  buildPizzaPromoPrice: row.buildPizzaPromoPrice,
  buildPizzaPromoIncluded: row.buildPizzaPromoIncluded,
  updatedAt: row.updatedAt.toISOString(),
})

/** Ajustes del local para el panel: pausa (ambos roles), horario, retiro, WhatsApp y precios de Arma tu pizza. */
export class SettingsService {
  private readonly settings: SettingsRepository
  private readonly now: Clock

  constructor(settings: SettingsRepository, now: Clock) {
    this.settings = settings
    this.now = now
  }

  async get(): Promise<AdminSettings> {
    const row = await this.settings.get()
    if (!row) throw new MissingSeedError('Faltan los ajustes del local')
    return toSettings(row)
  }

  async update(patch: SettingsPatch, user: SessionUser): Promise<AdminSettings> {
    assertCanChange(user, patch, STAFF_SETTINGS_FIELDS)
    const row = await this.settings.update(patch, this.now())
    if (!row) throw new MissingSeedError('Faltan los ajustes del local')
    return toSettings(row)
  }
}
