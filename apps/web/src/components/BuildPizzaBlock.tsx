import type { MouseEvent } from 'react'
import { formatClp, type BuildPizzaConfig, type Category } from '@rys/domain'

interface BuildPizzaBlockProps {
  category: Category
  buildPizza: BuildPizzaConfig
  onChooseIngredients: (event: MouseEvent<HTMLElement>) => void
}

export function BuildPizzaBlock({ category, buildPizza, onChooseIngredients }: BuildPizzaBlockProps) {
  const titleId = `${category.id}-titulo`
  const soldOut = buildPizza.available === false

  return (
    <section id={category.id} aria-labelledby={titleId} className="border-t border-linea py-10">
      <div className="grid gap-8 rounded-[2rem] bg-carbon p-6 text-white sm:p-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <h3 id={titleId} className="display text-6xl text-queso sm:text-7xl">
            {category.name}
          </h3>
          {category.description && <p className="mt-4 max-w-xl text-lg">{category.description}</p>}
          <p className="mt-2 max-w-xl text-white/80">Todas parten con: {buildPizza.description.toLowerCase()}</p>
          <dl className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/20 p-4">
              <dt className="font-semibold text-queso">Promoción</dt>
              <dd className="mt-1">
                <span className="font-bold tabular-nums">{formatClp(buildPizza.promoPrice)}</span> con{' '}
                {buildPizza.includedInPromo} ingredientes incluidos. Desde el cuarto, cada uno a su valor.
              </dd>
            </div>
            <div className="rounded-xl border border-white/20 p-4">
              <dt className="font-semibold text-queso">Base</dt>
              <dd className="mt-1">
                <span className="font-bold tabular-nums">{formatClp(buildPizza.basePrice)}</span> más el valor de
                cada ingrediente. Siempre te cobramos la opción más barata.
              </dd>
            </div>
          </dl>
        </div>
        {soldOut ? (
          <p className="rounded-full border border-white/40 px-6 py-3 text-center font-bold">
            Agotada por ahora
          </p>
        ) : (
          <button
            type="button"
            onClick={onChooseIngredients}
            className="inline-flex h-12 items-center justify-center rounded-full bg-queso px-6 font-bold text-carbon transition-colors hover:bg-white"
          >
            Elegir ingredientes
          </button>
        )}
      </div>
    </section>
  )
}
