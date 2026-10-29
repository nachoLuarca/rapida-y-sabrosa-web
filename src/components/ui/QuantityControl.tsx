import { Minus, Plus } from 'lucide-react'
import { MAX_LINE_QUANTITY } from '../../domain/cart'

interface QuantityControlProps {
  quantity: number
  /** Nombre del producto para los textos accesibles, p. ej. "Mango (1 litro)". */
  itemName: string
  onChange: (quantity: number) => void
}

/** Control − cantidad +. Con 0 la línea se elimina (lo resuelve el carrito). */
export function QuantityControl({ quantity, itemName, onChange }: QuantityControlProps) {
  const buttonClass =
    'grid size-10 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-40'

  return (
    <div className="inline-flex h-10 items-center rounded-full bg-carbon text-white" role="group" aria-label={itemName}>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity === 1 ? `Quitar ${itemName} del pedido` : `Quitar una unidad de ${itemName}`}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <output className="min-w-7 text-center font-semibold tabular-nums" aria-live="polite">
        {quantity}
        <span className="sr-only"> en el pedido</span>
      </output>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_LINE_QUANTITY}
        aria-label={`Agregar una unidad de ${itemName}`}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
