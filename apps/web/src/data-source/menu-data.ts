import { orderingStatus, type Catalog, type Category, type OpeningHours, type Zone } from '@rys/domain'
import { businessData } from '../config/business'
import { ingredients } from '../data/ingredients'
import { buildPizza, categories, products } from '../data/menu'
import { zones } from '../data/zones'

/** ¿Se puede pedir ahora? La pausa manda sobre el horario. */
export interface StoreStatus {
  isOpen: boolean
  /** Próxima apertura si está cerrado; null si está abierto o no hay horario. */
  nextOpening: Date | null
  ordersPaused: boolean
  /** Cuándo se calculó: "hoy" y "mañana" se cuentan desde aquí. */
  asOf: Date
}

/**
 * La carta como la usan los componentes, venga del bundle (static) o de GET /api/menu (api). Es un `Catalog` de
 * @rys/domain más lo que se muestra alrededor: categorías, zonas, retiro, horario y estado del local.
 */
export interface MenuData extends Catalog {
  categories: Category[]
  zones: Zone[]
  pickupAddress: string | null
  openingHours: OpeningHours | null
  store: StoreStatus
}

/** La carta del bundle (docs/data). El estado del local sale del horario de business.json (hoy sin horario). */
export function staticMenuData(now: Date = new Date()): MenuData {
  const { isOpen, nextOpening, ordersPaused } = orderingStatus(
    { openingHours: businessData.openingHours, ordersPaused: false, timezone: businessData.timezone },
    now,
  )
  return {
    categories,
    products,
    buildPizza,
    ingredients,
    zones,
    pickupAddress: businessData.pickupAddress,
    openingHours: businessData.openingHours,
    store: { isOpen, nextOpening, ordersPaused, asOf: now },
  }
}
