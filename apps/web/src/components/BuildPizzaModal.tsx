import { X } from 'lucide-react'
import { useState } from 'react'
import { formatClp, quoteBuildPizza, type Ingredient } from '@rys/domain'
import { useCart } from '../store/use-cart'
import { useMenu } from '../store/use-menu'
import { Modal } from './ui/Modal'

interface BuildPizzaModalProps {
  open: boolean
  onClose: () => void
  /** Se llama después de agregar la pizza al pedido. */
  onAdded: () => void
}

export function BuildPizzaModal({ open, onClose, onAdded }: BuildPizzaModalProps) {
  const { addItem } = useCart()
  const { menu } = useMenu()
  // En el orden en que se eligieron: así salen en el pedido y en el mensaje.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [wasOpen, setWasOpen] = useState(open)

  // Cada vez que se abre, parte de cero.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelectedIds([])
  }

  // Sin carta (todavía cargando) no hay nada que elegir: el botón que abre este modal está en la carta.
  if (!menu) return null
  const { buildPizza, ingredients } = menu
  const soldOut = buildPizza.available === false

  // Un ingrediente que se agotó mientras el modal estaba abierto deja de contar.
  const selected = selectedIds
    .map((id) => ingredients.find((ingredient) => ingredient.id === id))
    .filter((ingredient): ingredient is Ingredient => ingredient !== undefined && ingredient.available !== false)
  const quote = quoteBuildPizza(selected, buildPizza)

  const toggle = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const addToOrder = () => {
    addItem({ productId: buildPizza.productId, ingredientIds: selected.map((ingredient) => ingredient.id) })
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
            {ingredients.map((ingredient) => {
              const unavailable = ingredient.available === false
              return (
                <li key={ingredient.id}>
                  <label
                    className={`flex min-h-12 items-center gap-3 rounded-xl border border-linea px-4 py-2 transition-colors ${
                      unavailable
                        ? 'cursor-not-allowed bg-fondo text-tinta'
                        : 'cursor-pointer hover:border-carbon has-checked:border-carbon has-checked:bg-carbon has-checked:text-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!unavailable && selectedIds.includes(ingredient.id)}
                      disabled={unavailable}
                      onChange={() => toggle(ingredient.id)}
                      className="size-5 shrink-0 accent-rojo"
                    />
                    <span className="flex-1">{ingredient.name}</span>{' '}
                    <span className="text-sm tabular-nums">{unavailable ? 'Agotado' : formatClp(ingredient.price)}</span>
                  </label>
                </li>
              )
            })}
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
        {soldOut ? (
          <p className="font-semibold">Arma tu pizza está agotada por ahora.</p>
        ) : (
          <button
            type="button"
            onClick={addToOrder}
            className="inline-flex h-12 items-center rounded-full bg-rojo px-6 font-semibold text-white transition-colors hover:bg-rojo-oscuro"
          >
            Agregar al pedido
          </button>
        )}
      </div>
    </Modal>
  )
}
