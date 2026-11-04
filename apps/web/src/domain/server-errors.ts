import type { CheckoutErrors, CheckoutField } from '@rys/domain'

/** Campo del body de POST /api/orders → campo del formulario del checkout. */
const FIELD_BY_PATH: Record<string, CheckoutField> = {
  'customer.name': 'customerName',
  'customer.phone': 'phone',
  zoneId: 'zoneId',
  address: 'address',
  payment: 'payment',
  notes: 'comment',
}

/**
 * Los errores de VALIDATION_ERROR de la API, junto a cada campo como los del navegador. `unmapped` es true si
 * algún error no corresponde a un campo del formulario (por ejemplo, las líneas del pedido).
 */
export function checkoutErrorsFromServer(details: Record<string, unknown>): {
  errors: CheckoutErrors
  unmapped: boolean
} {
  const errors: CheckoutErrors = {}
  let unmapped = false
  for (const [path, message] of Object.entries(details)) {
    const field = FIELD_BY_PATH[path]
    if (field && typeof message === 'string') errors[field] ??= message
    else unmapped = true
  }
  return { errors, unmapped }
}
