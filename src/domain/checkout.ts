import { normalizeChileanMobile } from './format'
import type { OrderDetails, PaymentMethod, Zone } from './types'

export const COMMENT_MAX_LENGTH = 300

/** Lo que escribe el cliente en el checkout, tal cual viene del formulario. */
export interface CheckoutForm {
  customerName: string
  phone: string
  fulfillment: 'delivery' | 'pickup'
  zoneId: string
  address: string
  payment: PaymentMethod | ''
  comment: string
}

export type CheckoutField = 'customerName' | 'phone' | 'zoneId' | 'address' | 'payment' | 'comment'

/** Orden de los campos en pantalla: el foco va al primero con error. */
export const CHECKOUT_FIELDS: CheckoutField[] = ['customerName', 'phone', 'zoneId', 'address', 'payment', 'comment']

export type CheckoutErrors = Partial<Record<CheckoutField, string>>

export type CheckoutResult = { ok: true; order: OrderDetails } | { ok: false; errors: CheckoutErrors }

export const emptyCheckoutForm: CheckoutForm = {
  customerName: '',
  phone: '',
  fulfillment: 'delivery',
  zoneId: '',
  address: '',
  payment: '',
  comment: '',
}

/** Valida el checkout (docs/SPEC.md) y, si está bien, arma el pedido con el celular normalizado. */
export function validateCheckout(form: CheckoutForm, zones: Zone[], paymentMethods: PaymentMethod[]): CheckoutResult {
  const errors: CheckoutErrors = {}
  const customerName = form.customerName.trim()
  const address = form.address.trim()
  const comment = form.comment.trim()

  if (customerName.length < 2) errors.customerName = 'Ingresa tu nombre, con al menos 2 letras.'

  const phone = normalizeChileanMobile(form.phone)
  if (!phone) {
    errors.phone =
      form.phone.trim() === ''
        ? 'Ingresa tu celular, por ejemplo 9 1234 5678.'
        : 'Ingresa un celular chileno, por ejemplo 9 1234 5678.'
  }

  const zone = zones.find((z) => z.id === form.zoneId)
  if (form.fulfillment === 'delivery') {
    if (!zone) errors.zoneId = 'Elige tu sector para calcular el despacho.'
    if (address.length < 5) errors.address = 'Ingresa tu dirección con calle y número.'
  }

  const payment = paymentMethods.find((method) => method === form.payment)
  if (!payment) errors.payment = 'Elige cómo vas a pagar.'

  if (comment.length > COMMENT_MAX_LENGTH) {
    errors.comment = `El comentario puede tener hasta ${COMMENT_MAX_LENGTH} caracteres.`
  }

  if (!phone || !payment || Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    order: {
      customerName,
      phone,
      fulfillment: form.fulfillment === 'delivery' && zone ? { type: 'delivery', zone, address } : { type: 'pickup' },
      payment,
      ...(comment ? { comment } : {}),
    },
  }
}

/** Primer campo con error según el orden en pantalla, para mover el foco ahí. */
export function firstErrorField(errors: CheckoutErrors): CheckoutField | null {
  return CHECKOUT_FIELDS.find((field) => errors[field] !== undefined) ?? null
}
