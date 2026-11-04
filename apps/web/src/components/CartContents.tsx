import { ShoppingBag } from 'lucide-react'
import { formatClp, lineTotal } from '@rys/domain'
import { storeBlockMessage } from '../domain/store-messages'
import { useCart } from '../store/use-cart'
import { useMenu } from '../store/use-menu'
import { SoldOutTag } from './ProductRow'
import { QuantityControl } from './ui/QuantityControl'

interface CartContentsProps {
  onClose: () => void
  onContinue: () => void
}

/** Paso 1 del panel: las líneas del pedido o el estado vacío. */
export function CartContents({ onClose, onContinue }: CartContentsProps) {
  const { lines, totals, unavailableKeys, setQuantity, removeLine } = useCart()
  const { menu } = useMenu()

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <ShoppingBag className="size-12 text-tinta" aria-hidden="true" />
        <p className="text-lg font-semibold">Tu pedido está vacío.</p>
        <p className="text-tinta">Elige tus pizzas y lo que quieras acompañar desde la carta.</p>
        <a
          href="#carta"
          onClick={onClose}
          className="mt-2 inline-flex h-12 items-center rounded-full bg-rojo px-6 font-semibold text-white transition-colors hover:bg-rojo-oscuro"
        >
          Ver la carta
        </a>
      </div>
    )
  }

  const blocked = menu ? storeBlockMessage(menu.store) : null
  const soldOutCount = unavailableKeys.length
  // Lo que impide seguir, en orden: primero lo que el cliente puede arreglar.
  const reason =
    soldOutCount > 0
      ? soldOutCount === 1
        ? 'Un producto de tu pedido se agotó. Quítalo para continuar.'
        : `${soldOutCount} productos de tu pedido se agotaron. Quítalos para continuar.`
      : blocked

  return (
    <>
      <ul className="min-h-0 flex-1 divide-y divide-linea overflow-y-auto px-5">
        {lines.map((line) => {
          const itemName = line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name
          const soldOut = unavailableKeys.includes(line.key)
          return (
            <li key={line.key} className="py-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="flex flex-wrap items-baseline gap-2 font-semibold">
                  {itemName}
                  {soldOut && <SoldOutTag />}
                </p>
                <p className="font-bold whitespace-nowrap tabular-nums">{formatClp(lineTotal(line))}</p>
              </div>
              {line.ingredientNames && (
                <p className="mt-1 text-sm text-tinta">
                  {line.ingredientNames.length > 0
                    ? `Ingredientes: ${line.ingredientNames.join(', ')}`
                    : 'Sin ingredientes extra'}
                </p>
              )}
              {soldOut ? (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-rojo">Ya no está disponible.</p>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="inline-flex h-10 items-center rounded-full border-2 border-carbon px-4 font-semibold transition-colors hover:bg-carbon hover:text-white"
                  >
                    Quitar <span className="sr-only">{itemName}</span>
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-sm text-tinta tabular-nums">{formatClp(line.unitPrice)} c/u</p>
                  <QuantityControl
                    quantity={line.quantity}
                    itemName={itemName}
                    onChange={(quantity) => setQuantity(line.key, quantity)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="shrink-0 border-t border-linea px-5 py-4">
        <div className="flex items-baseline justify-between text-lg">
          <span className="font-semibold">Subtotal</span>
          <span className="font-bold tabular-nums">{formatClp(totals.subtotal)}</span>
        </div>
        <p className="mt-1 text-sm text-tinta">El despacho se calcula con tu sector en el siguiente paso.</p>
        {reason && (
          <p id="pedido-bloqueado" className="mt-3 rounded-xl bg-queso-claro px-4 py-2 text-sm font-semibold">
            {reason}
          </p>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={reason !== null}
          aria-describedby={reason ? 'pedido-bloqueado' : undefined}
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-rojo px-6 font-semibold text-white transition-colors hover:bg-rojo-oscuro disabled:cursor-not-allowed disabled:bg-tinta"
        >
          Continuar con mis datos
        </button>
      </div>
    </>
  )
}
