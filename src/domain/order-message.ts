import { business } from '../config/business'
import { cartTotals, lineTotal } from './cart'
import { formatChileanMobile, formatClp } from './format'
import type { CartLine, Fulfillment, OrderDetails } from './types'

export interface OrderTotals {
  subtotal: number
  /** 0 en retiro. */
  deliveryFee: number
  total: number
}

export function orderTotals(lines: CartLine[], fulfillment: Fulfillment): OrderTotals {
  const { subtotal } = cartTotals(lines)
  const deliveryFee = fulfillment.type === 'delivery' ? fulfillment.zone.fee : 0
  return { subtotal, deliveryFee, total: subtotal + deliveryFee }
}

/** Deja el texto del cliente en una sola línea para no romper el formato del mensaje. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

function lineText(line: CartLine): string[] {
  const name = line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name
  const text = [`• ${line.quantity} x ${name} — ${formatClp(lineTotal(line))}`]
  if (line.ingredientNames) {
    text.push(
      line.ingredientNames.length > 0
        ? `   Ingredientes: ${line.ingredientNames.join(', ')}`
        : '   Sin ingredientes extra',
    )
  }
  return text
}

/** Mensaje de WhatsApp con el formato de docs/SPEC.md (negritas con *). */
export function buildOrderMessage(lines: CartLine[], order: OrderDetails): string {
  const { fulfillment } = order
  const totals = orderTotals(lines, fulfillment)
  const comment = oneLine(order.comment ?? '')

  const blocks: string[][] = [
    [`*Nuevo pedido — ${business.name}*`],
    lines.flatMap(lineText),
    [
      `Subtotal: ${formatClp(totals.subtotal)}`,
      ...(fulfillment.type === 'delivery' ? [`Despacho: ${formatClp(totals.deliveryFee)}`] : []),
      `*Total: ${formatClp(totals.total)}*`,
    ],
    [
      ...(fulfillment.type === 'delivery'
        ? [`*Despacho* a ${fulfillment.zone.name}`, `Dirección: ${oneLine(fulfillment.address)}`]
        : ['*Retiro en local*']),
      `Pago: ${order.payment}`,
    ],
    [`Cliente: ${oneLine(order.customerName)}`, `Teléfono: ${formatChileanMobile(order.phone)}`],
  ]
  if (comment) blocks.push([`Comentario: ${comment}`])

  return blocks.map((block) => block.join('\n')).join('\n\n')
}

/** Enlace que abre WhatsApp con el mensaje listo para enviar. */
export function whatsappUrl(phoneNumber: string, message: string): string {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`
}
