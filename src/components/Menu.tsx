import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { buildPizza, categories, products } from '../data/menu'
import { matchesSearch } from '../domain/search'
import { useActiveSection } from '../hooks/use-active-section'
import { BuildPizzaBlock } from './BuildPizzaBlock'
import { CategorySection } from './CategorySection'
import { MenuToolbar } from './MenuToolbar'

interface MenuProps {
  onChooseIngredients: (event: MouseEvent<HTMLElement>) => void
}

export function Menu({ onChooseIngredients }: MenuProps) {
  const [query, setQuery] = useState('')
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
    [query],
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

      <div ref={resultsRef} className="mx-auto max-w-6xl px-4">
        <div role="status" className={searching ? 'pt-6' : 'sr-only'}>
          {searching &&
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
