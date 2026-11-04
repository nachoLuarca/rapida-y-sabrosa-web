import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { matchesSearch } from '@rys/domain'
import type { MenuData } from '../data-source/menu-data'
import { useActiveSection } from '../hooks/use-active-section'
import { useMenu } from '../store/use-menu'
import { BuildPizzaBlock } from './BuildPizzaBlock'
import { CategorySection } from './CategorySection'
import { MenuToolbar } from './MenuToolbar'

interface MenuProps {
  onChooseIngredients: (event: MouseEvent<HTMLElement>) => void
}

const EMPTY_MENU: Pick<MenuData, 'categories' | 'products' | 'buildPizza'> = {
  categories: [],
  products: [],
  buildPizza: { productId: '', name: '', description: '', basePrice: 0, promoPrice: 0, includedInPromo: 0 },
}

/** Mientras llega la carta de la API: filas grises con la forma de la carta. */
function MenuSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
      {[0, 1].map((section) => (
        <div key={section} className="grid gap-6 border-t border-linea py-10 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10">
          <div className="h-10 w-48 rounded-lg bg-fondo" />
          <ul className="divide-y divide-linea">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="flex items-center justify-between gap-4 py-5">
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-40 rounded bg-fondo" />
                  <div className="h-4 w-full max-w-sm rounded bg-fondo" />
                </div>
                <div className="h-10 w-28 rounded-full bg-fondo" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function Menu({ onChooseIngredients }: MenuProps) {
  const { status, menu, reload } = useMenu()
  const { categories, products, buildPizza } = menu ?? EMPTY_MENU
  const [query, setQuery] = useState('')
  const [retrying, setRetrying] = useState(false)
  const searching = query.trim() !== ''

  const sections = useMemo(
    () =>
      categories
        .map((category) => {
          const isBuildPizza = category.id === buildPizza.productId
          const matches = isBuildPizza
            ? matchesSearch(query, buildPizza.name, buildPizza.description, category.name, category.description)
            : false
          return {
            category,
            isBuildPizza,
            products: products.filter(
              (product) =>
                product.categoryId === category.id &&
                matchesSearch(query, product.name, product.description, category.name),
            ),
            visible: isBuildPizza ? matches : undefined,
          }
        })
        .filter((section) => (section.isBuildPizza ? section.visible : section.products.length > 0)),
    [query, categories, products, buildPizza],
  )

  const resultCount = sections.reduce((total, s) => total + (s.isBuildPizza ? 1 : s.products.length), 0)
  const activeId = useActiveSection(sections.map((s) => s.category.id))

  // Si se busca con la carta ya avanzada, vuelve al inicio de los resultados para que se vean.
  const resultsRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!searching) return
    if ((sectionRef.current?.getBoundingClientRect().top ?? 0) < 0) {
      resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
  }, [query, searching])

  return (
    <section ref={sectionRef} id="carta" aria-labelledby="carta-titulo" className="pb-10">
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-6">
        <h2 id="carta-titulo" className="display text-6xl sm:text-7xl">
          La carta
        </h2>
      </div>

      <MenuToolbar
        query={query}
        onQueryChange={setQuery}
        categories={sections.map((s) => s.category)}
        activeId={activeId}
      />

      <div ref={resultsRef} className="mx-auto max-w-6xl px-4" aria-busy={status === 'loading'}>
        {status === 'loading' && (
          <>
            <p className="sr-only" role="status">
              Cargando la carta…
            </p>
            <MenuSkeleton />
          </>
        )}
        {status === 'error' && (
          <div role="alert" className="mt-6 rounded-xl bg-fondo p-6">
            <p className="font-semibold">No pudimos cargar la carta.</p>
            <p className="mt-1 text-tinta">Revisa tu conexión e inténtalo de nuevo.</p>
            <button
              type="button"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true)
                await reload()
                setRetrying(false)
              }}
              className="mt-4 inline-flex h-10 items-center rounded-full bg-rojo px-5 font-semibold text-white transition-colors hover:bg-rojo-oscuro disabled:opacity-60"
            >
              {retrying ? 'Cargando…' : 'Reintentar'}
            </button>
          </div>
        )}
        <div role="status" className={searching ? 'pt-6' : 'sr-only'}>
          {searching &&
            status === 'ready' &&
            (resultCount > 0 ? (
              <p className="font-semibold">
                {resultCount} {resultCount === 1 ? 'resultado' : 'resultados'} para “{query.trim()}”
              </p>
            ) : (
              <div className="rounded-xl bg-fondo p-6">
                <p className="font-semibold">No encontramos nada con “{query.trim()}”.</p>
                <p className="mt-1 text-tinta">Prueba con otro nombre o ingrediente, por ejemplo “pollo” o “champiñón”.</p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-4 inline-flex h-10 items-center rounded-full border-2 border-carbon px-4 font-semibold hover:bg-carbon hover:text-white"
                >
                  Ver toda la carta
                </button>
              </div>
            ))}
        </div>

        {sections.map((section) =>
          section.isBuildPizza ? (
            <BuildPizzaBlock
              key={section.category.id}
              category={section.category}
              buildPizza={buildPizza}
              onChooseIngredients={onChooseIngredients}
            />
          ) : (
            <CategorySection key={section.category.id} category={section.category} products={section.products} />
          ),
        )}
      </div>
    </section>
  )
}
