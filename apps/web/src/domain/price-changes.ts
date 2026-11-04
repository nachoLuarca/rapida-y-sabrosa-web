import type { OrderQuoteDto } from '@rys/contracts'
import { formatClp, type CartLine } from '@rys/domain'

/** "Suprema: $13.000 → $13.500 c/u": lo que cambió entre lo que vio el cliente y la cotización de la API. */
export function priceChanges(before: CartLine[], beforeFee: number, quote: OrderQuoteDto): string[] {
  const changes = quote.lines.flatMap((line, index) => {
    const old = before[index]
    if (!old || old.unitPrice === line.unitPrice) return []
    const name = line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name
    return [`${name}: ${formatClp(old.unitPrice)} → ${formatClp(line.unitPrice)} c/u`]
  })
  if (beforeFee !== quote.deliveryFee) changes.push(`Despacho: ${formatClp(beforeFee)} → ${formatClp(quote.deliveryFee)}`)
  return [...changes, `Total nuevo: ${formatClp(quote.total)}`]
}
