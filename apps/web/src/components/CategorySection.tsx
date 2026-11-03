import type { Category, Product } from '../domain/types'
import { ProductRow } from './ProductRow'

interface CategorySectionProps {
  category: Category
  products: Product[]
}

export function CategorySection({ category, products }: CategorySectionProps) {
  const titleId = `${category.id}-titulo`

  return (
    <section
      id={category.id}
      aria-labelledby={titleId}
      className="grid gap-2 border-t border-linea py-10 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10"
    >
      <div className="md:sticky md:top-40 md:self-start">
        <h3 id={titleId} className="display text-4xl text-balance md:text-5xl">
          {category.name}
        </h3>
        {category.description && <p className="mt-3 text-tinta">{category.description}</p>}
        <p className="mt-2 text-sm font-semibold text-tinta">
          {products.length} {products.length === 1 ? 'opción' : 'opciones'}
        </p>
      </div>
      <ul className="divide-y divide-linea">
        {products.map((product) => (
          <li key={product.id}>
            <ProductRow product={product} />
          </li>
        ))}
      </ul>
    </section>
  )
}
