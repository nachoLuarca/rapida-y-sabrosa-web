import {
  CHECKOUT_ATTEMPT_STORAGE_KEY,
  parseAttempt,
  serializeAttempt,
  type CheckoutAttempt,
} from '../domain/checkout-attempt'

/** Lee el intento de checkout en curso. Si sessionStorage no está disponible, no hay intento guardado. */
export function loadAttempt(): CheckoutAttempt | null {
  try {
    return parseAttempt(window.sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Guarda el intento, o lo borra con null (al crearse el pedido). Si no se puede, vale mientras la página siga abierta. */
export function saveAttempt(attempt: CheckoutAttempt | null): void {
  try {
    if (attempt) window.sessionStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, serializeAttempt(attempt))
    else window.sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY)
  } catch {
    // Sin sessionStorage, un reintento después de recargar llevaría otra clave; mientras tanto se sigue igual.
  }
}
