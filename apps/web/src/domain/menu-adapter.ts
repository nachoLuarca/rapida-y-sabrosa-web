import type { MenuResponse } from '@rys/contracts'
import type { Category, Product } from '@rys/domain'
import type { MenuData } from '../data-source/menu-data'

/**
 * GET /api/menu → la forma que usan los componentes (la misma de la carta del bundle). Los `null` de la API pasan
 * a campos ausentes, y la categoría de Arma tu pizza queda sin productos: lo suyo va en `buildPizza`.
 */
export function toMenuData(response: MenuResponse, receivedAt: Date = new Date()): MenuData {
  const categories: Category[] = response.categories.map(({ id, name, description }) => ({
    id,
    name,
    ...(description ? { description } : {}),
  }))

  const products: Product[] = response.categories
    .filter((category) => category.kind === 'regular')
    .flatMap((category) =>
      category.products.map((product): Product => {
        const base = {
          id: product.id,
          categoryId: category.id,
          name: product.name,
          ...(product.description ? { description: product.description } : {}),
          ...(product.tags.length > 0 ? { tags: product.tags } : {}),
          ...(product.imageUrl ? { image: product.imageUrl } : {}),
          available: product.available,
        }
        return product.variants.length > 0 ? { ...base, variants: product.variants } : { ...base, price: product.price ?? 0 }
      }),
    )

  const { buildPizza, business } = response
  return {
    categories,
    products,
    buildPizza: {
      productId: buildPizza.productId,
      name: buildPizza.name,
      description: buildPizza.description ?? '',
      basePrice: buildPizza.basePrice,
      promoPrice: buildPizza.promoPrice,
      includedInPromo: buildPizza.includedInPromo,
      available: buildPizza.available,
    },
    ingredients: response.ingredients,
    zones: response.zones,
    pickupAddress: business.pickupAddress,
    openingHours: business.openingHours,
    store: {
      isOpen: business.isOpen,
      nextOpening: business.nextOpening ? new Date(business.nextOpening) : null,
      ordersPaused: business.ordersPaused,
      asOf: receivedAt,
    },
  }
}
