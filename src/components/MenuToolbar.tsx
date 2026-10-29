import { Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Category } from '../domain/types'

interface MenuToolbarProps {
  query: string
  onQueryChange: (query: string) => void
  categories: Category[]
  activeId: string | null
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export function MenuToolbar({ query, onQueryChange, categories, activeId }: MenuToolbarProps) {
  const chipsRef = useRef<HTMLElement>(null)

  // Mantiene visible el chip activo dentro de la fila con scroll horizontal (sin mover la página).
  useEffect(() => {
    const container = chipsRef.current
    const chip = activeId ? container?.querySelector<HTMLElement>(`[data-chip="${activeId}"]`) : null
    if (!container || !chip) return
    const outOfView =
      chip.offsetLeft < container.scrollLeft ||
      chip.offsetLeft + chip.offsetWidth > container.scrollLeft + container.clientWidth
    if (outOfView) {
      container.scrollTo({ left: chip.offsetLeft - 16, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
  }, [activeId])

  return (
    <div className="sticky top-16 z-20 border-b border-linea bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-3 pb-1 md:flex-row md:items-center md:gap-4">
        <div className="relative md:w-72 md:shrink-0">
          <label htmlFor="menu-search" className="sr-only">
            Buscar en la carta
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-tinta"
            aria-hidden="true"
          />
          <input
            id="menu-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Busca una pizza o ingrediente"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-linea bg-fondo pr-3 pl-11 placeholder:text-tinta"
          />
        </div>

        <nav
          ref={chipsRef}
          aria-label="Categorías de la carta"
          className="relative -mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:thin] md:mx-0 md:px-0"
        >
          <ul className="flex w-max gap-2 pt-0.5 pb-2">
            {categories.map((category) => {
              const active = category.id === activeId
              return (
                <li key={category.id}>
                  <a
                    href={`#${category.id}`}
                    data-chip={category.id}
                    aria-current={active ? 'location' : undefined}
                    className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
                      active
                        ? 'border-carbon bg-carbon text-white'
                        : 'border-linea bg-white text-carbon hover:border-carbon'
                    }`}
                  >
                    {category.name}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}
