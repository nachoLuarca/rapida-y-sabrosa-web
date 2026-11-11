import type { OrderRepository } from '../repositories/order-repository.ts'
import type { Clock } from './catalog-service.ts'

/** Lo que queda en lugar de los datos del cliente. Montos, productos, zona y estados se conservan. */
export const ANONYMIZED = {
  customerName: 'Cliente anonimizado',
  /** Sin celular: el panel no ofrece escribirle por WhatsApp. */
  customerPhone: '',
  /** Solo en los despachos: un despacho siempre tiene dirección. */
  deliveryAddress: 'Dirección anonimizada',
  /** La huella del body original se calculó con el nombre, el celular y la dirección. */
  requestHash: 'anonimizado',
} as const

const DAY_MS = 24 * 60 * 60 * 1000

export interface AnonymizeResult {
  /** Se anonimizaron los pedidos creados antes de este instante. */
  cutoff: Date
  /** Cuántos pedidos se anonimizaron (o se anonimizarían, con dryRun). */
  count: number
}

/**
 * Datos personales (docs/BACKEND-SPEC.md → Datos personales): reemplaza nombre, celular, dirección y comentario de
 * los pedidos antiguos y conserva lo que sirve para estadísticas.
 */
export class OrderPrivacyService {
  private readonly orders: OrderRepository
  private readonly now: Clock

  constructor(orders: OrderRepository, now: Clock) {
    this.orders = orders
    this.now = now
  }

  async anonymizeOlderThan(days: number, options: { dryRun?: boolean } = {}): Promise<AnonymizeResult> {
    if (!Number.isInteger(days) || days < 1) throw new RangeError('La antigüedad debe ser de al menos 1 día.')
    const now = this.now()
    const cutoff = new Date(now.getTime() - days * DAY_MS)
    const count = options.dryRun
      ? await this.orders.countToAnonymize(cutoff)
      : await this.orders.anonymizeCreatedBefore(cutoff, ANONYMIZED, now)
    return { cutoff, count }
  }
}
