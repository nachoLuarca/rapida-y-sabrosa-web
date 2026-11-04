import type { Catalog, Product, Zone } from '@rys/domain'
import type { CatalogSnapshot } from '../repositories/catalog-repository.ts'
import type { SettingsRow } from '../repositories/settings-repository.ts'
import { MissingSeedError } from './missing-seed-error.ts'

/**
 * La carta de la base con la forma de @rys/domain, para cotizar con las mismas funciones que usa la web.
 * Arma tu pizza sale de su categoría `build_pizza` y sus precios, de los ajustes.
 */
export function toDomainCatalog(snapshot: CatalogSnapshot, settings: SettingsRow): { catalog: Catalog; zones: Zone[] } {
  const buildPizzaCategory = snapshot.categories.find((category) => category.kind === 'build_pizza')
  const buildPizzaProduct = snapshot.products.find((product) => product.categoryId === buildPizzaCategory?.id)
  if (!buildPizzaCategory || !buildPizzaProduct) throw new MissingSeedError('Falta Arma tu pizza en la carta')

  const variantsByProduct = Map.groupBy(snapshot.variants, (variant) => variant.productId)
  const products: Product[] = snapshot.products
    .filter((product) => product.categoryId !== buildPizzaCategory.id)
    .flatMap((product): Product[] => {
      const base = { id: product.id, categoryId: product.categoryId, name: product.name, available: product.available }
      const variants = variantsByProduct.get(product.id) ?? []
      if (variants.length > 0) {
        return [{ ...base, variants: variants.map(({ id, label, price }) => ({ id, label, price })) }]
      }
      // Un producto sin precio ni variantes no se puede cotizar: queda fuera (no se puede pedir).
      return product.price === null ? [] : [{ ...base, price: product.price }]
    })

  return {
    catalog: {
      products,
      ingredients: snapshot.ingredients.map(({ id, name, price, available }) => ({ id, name, price, available })),
      buildPizza: {
        productId: buildPizzaProduct.id,
        name: buildPizzaProduct.name,
        description: buildPizzaProduct.description ?? '',
        basePrice: settings.buildPizzaBasePrice,
        promoPrice: settings.buildPizzaPromoPrice,
        includedInPromo: settings.buildPizzaPromoIncluded,
        available: buildPizzaProduct.available,
      },
    },
    zones: snapshot.zones.map(({ id, name, fee }) => ({ id, name, fee })),
  }
}
