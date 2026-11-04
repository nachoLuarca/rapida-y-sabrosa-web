import { describeNextOpening } from '@rys/domain'
import type { StoreStatus } from '../data-source/menu-data'

/**
 * Por qué no se puede pedir ahora, en una frase, o null si se puede. La pausa manda sobre el horario.
 * "Estamos cerrados. Abrimos hoy a las 19:00." / "Por ahora no estamos recibiendo pedidos."
 */
export function storeBlockMessage(store: StoreStatus): string | null {
  if (store.ordersPaused) return 'Por ahora no estamos recibiendo pedidos. Vuelve a intentarlo en un rato.'
  if (store.isOpen) return null
  return store.nextOpening
    ? `Estamos cerrados. Abrimos ${describeNextOpening(store.nextOpening, store.asOf)}.`
    : 'Estamos cerrados por ahora.'
}
