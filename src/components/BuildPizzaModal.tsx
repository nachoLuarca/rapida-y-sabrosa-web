import { X } from 'lucide-react'
import { useState } from 'react'
import { ingredients } from '../data/ingredients'
import { buildPizza } from '../data/menu'
import { quoteBuildPizza } from '../domain/build-pizza'
import { formatClp } from '../domain/format'
import type { Ingredient } from '../domain/types'
import { useCart } from '../store/use-cart'
import { Modal } from './ui/Modal'

interface BuildPizzaModalProps {
  open: boolean
  onClose: () => void
  /** Se llama después de agregar la pizza al pedido. */
  onAdded: () => void
}

export function BuildPizzaModal({ open, onClose, onAdded }: BuildPizzaModalProps) {
  const { addItem } = useCart()
  // En el orden en que se eligieron: así salen en el pedido y en el mensaje.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [wasOpen, setWasOpen] = useState(open)

  // Cada vez que se abre, parte de cero.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelectedIds([])
  }

  const selected = selectedIds
    .map((id) => ingredients.find((ingredient) => ingredient.id === id))
    .filter((ingredient): ingredient is Ingredient => ingredient !== undefined)
  const quote = quoteBuildPizza(selected, buildPizza)

  const toggle = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const addToOrder = () => {
    addItem({ productId: buildPizza.productId, ingredientIds: selectedIds })
    onAdded()
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="arma-titulo" variant="center">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-linea px-5 pt-5 pb-4 sm:px-8">
        <div>
          <h2 id="arma-titulo" className="display text-5xl">
            {buildPizza.name}
          </h2>
          <p className="mt-2 text-sm text-tinta">{buildPizza.description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-fondo"
          aria-label="Cerrar Arma tu pizza"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
        <div className="rounded-xl bg-queso-claro p-4 text-sm">
          <p>
            <strong>Base {formatClp(buildPizza.basePrice)}</strong> más el valor de cada ingrediente.
          </p>
          <p className="mt-1">
            <strong>Promoción {formatClp(buildPizza.promoPrice)}</strong> con {buildPizza.includedInPromo} ingredientes
            incluidos (los más caros que elijas); desde el cuarto se cobra cada uno a su valor.
          </p>
          <p className="mt-1">Siempre te cobramos la opción más barata.</p>
        </div>

        <fieldset className="mt-6">
          <legend className="font-bold">Ingredientes</legend>
          <p className="mt-1 text-sm text-tinta" aria-live="polite">
            {quote.includedRemaining > 0
              ? `Te ${quote.includedRemaining === 1 ? 'queda 1 incluido' : `quedan ${quote.includedRemaining} incluidos`} en la promoción.`
              : `Ya tienes los ${buildPizza.includedInPromo} incluidos; los siguientes se cobran a su valor.`}
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {ingredients.map((ingredient) => (
              <li key={ingredient.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-linea px-4 py-2 transition-colors hover:border-carbon has-checked:border-carbon has-checked:bg-carbon has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-queso">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(ingredient.id)}
                    onChange={() => toggle(ingredient.id)}
                    className="size-5 shrink-0 accent-rojo focus-visible:outline-none"
                  />
                  <span className="flex-1">{ingredient.name}</span>{' '}
                  <span className="text-sm tabular-nums">{formatClp(ingredient.price)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-linea px-5 py-4 sm:px-8">
        <p aria-live="polite">
          <span className="block text-2xl font-bold tabular-nums">{formatClp(quote.total)}</span>
          <span className="text-sm text-tinta">
            {quote.label}
            {selected.length > 0 && ` (${selected.length} ${selected.length === 1 ? 'ingrediente' : 'ingredientes'})`}
          </span>
        </p>
        <button
          type="button"
          onClick={addToOrder}
          className="inline-flex h-12 items-center rounded-full bg-rojo px-6 font-semibold text-white transition-colors hover:bg-rojo-oscuro"
        >
          Agregar al pedido
        </button>
      </div>
    </Modal>
  )
}
