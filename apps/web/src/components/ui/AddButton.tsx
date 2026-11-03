import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

interface AddButtonProps {
  /** Nombre del producto para el texto accesible. */
  itemName: string
  onClick: () => void
  /** Contenido visible; por defecto "Agregar". */
  children?: ReactNode
}

export function AddButton({ itemName, onClick, children = 'Agregar' }: AddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-rojo pr-4 pl-3 font-semibold text-white transition-colors hover:bg-rojo-oscuro"
    >
      <Plus className="size-4" aria-hidden="true" />
      {children}{' '}
      <span className="sr-only">{itemName}</span>
    </button>
  )
}
