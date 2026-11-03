import type { MouseEvent } from 'react'
import { formatClp } from '../domain/format'
import { useCart } from '../store/use-cart'

interface FloatingCartBarProps {
  onOpenCart: (event: MouseEvent<HTMLElement>) => void
}

/** Botón fijo abajo, solo en celular y con productos en el pedido. */
export function FloatingCartBar({ onOpenCart }: FloatingCartBarProps) {
  const { totals } = useCart()
  if (totals.itemCount === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 p-3 md:hidden">
      <button
        type="button"
        onClick={onOpenCart}
        className="flex h-14 w-full items-center justify-between gap-3 rounded-full bg-rojo pr-6 pl-3 font-semibold text-white shadow-[0_8px_24px_rgb(28_25_23/0.35)] transition-colors hover:bg-rojo-oscuro"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-white text-rojo tabular-nums">
            {totals.itemCount}
          </span>
          <span>
            Ver pedido
            <span className="sr-only">
              , {totals.itemCount} {totals.itemCount === 1 ? 'producto' : 'productos'},
            </span>
          </span>
        </span>{' '}
        <span className="tabular-nums">{formatClp(totals.subtotal)}</span>
      </button>
    </div>
  )
}
