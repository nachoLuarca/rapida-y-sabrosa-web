import { EventEmitter } from 'node:events'
import type { OrderStatus } from '@rys/domain'

// Bus de eventos en memoria (ADR-007). Los servicios publican y, desde la Fase 8, el SSE del panel escucha. Hay
// una sola instancia de la API, así que un EventEmitter alcanza.

/** Resumen del pedido: lo que el panel necesita para mostrarlo en el tablero, sin datos del cliente. */
export interface OrderEventPayload {
  id: string
  code: string
  status: OrderStatus
  fulfillment: 'delivery' | 'pickup'
  total: number
  createdAt: string
}

export interface BusEvents {
  'order.created': OrderEventPayload
}

export type BusEventName = keyof BusEvents

export class EventBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    // Cada panel conectado por SSE es un listener; el límite por defecto (10) se queda corto.
    this.emitter.setMaxListeners(100)
  }

  publish<E extends BusEventName>(event: E, payload: BusEvents[E]): void {
    this.emitter.emit(event, payload)
  }

  /** Devuelve la función para dejar de escuchar. */
  subscribe<E extends BusEventName>(event: E, listener: (payload: BusEvents[E]) => void): () => void {
    this.emitter.on(event, listener)
    return () => {
      this.emitter.off(event, listener)
    }
  }
}
