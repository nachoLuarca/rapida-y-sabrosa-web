import type { CategoryDto, MenuResponse, ProductDto } from '@rys/contracts'
import { orderingStatus } from '@rys/domain'
import type { CatalogRepository, ProductRow, VariantRow } from '../repositories/catalog-repository.ts'
import type { SettingsRepository } from '../repositories/settings-repository.ts'
import { MissingSeedError } from './missing-seed-error.ts'

export type Clock = () => Date

/** Arma la carta de GET /api/menu. No conoce HTTP ni SQL. */
export class CatalogService {
  private readonly catalog: CatalogRepository
  private readonly settings: SettingsRepository
  private readonly now: Clock

  constructor(catalog: CatalogRepository, settings: SettingsRepository, now: Clock) {
    this.catalog = catalog
    this.settings = settings
    this.now = now
  }

  async getMenu(): Promise<MenuResponse> {
    const [snapshot, settings] = await Promise.all([this.catalog.getSnapshot(), this.settings.get()])
    if (!settings) throw new MissingSeedError('Faltan los ajustes del local')

    const buildPizzaCategory = snapshot.categories.find((category) => category.kind === 'build_pizza')
    const buildPizzaProduct = snapshot.products.find((product) => product.categoryId === buildPizzaCategory?.id)
    if (!buildPizzaCategory || !buildPizzaProduct) throw new MissingSeedError('Falta Arma tu pizza en la carta')

    const variantsByProduct = Map.groupBy(snapshot.variants, (variant) => variant.productId)
    const productsByCategory = Map.groupBy(snapshot.products, (product) => product.categoryId)

    const categories: CategoryDto[] = snapshot.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      kind: category.kind,
      // Arma tu pizza no lista productos: su configuración va en `buildPizza`.
      products:
        category.kind === 'build_pizza'
          ? []
          : (productsByCategory.get(category.id) ?? []).map((product) =>
              toProduct(product, variantsByProduct.get(product.id) ?? []),
            ),
    }))

    const status = orderingStatus(
      { openingHours: settings.openingHours, ordersPaused: settings.ordersPaused, timezone: settings.timezone },
      this.now(),
    )

    return {
      categories,
      ingredients: snapshot.ingredients.map(({ id, name, price, available }) => ({ id, name, price, available })),
      zones: snapshot.zones.map(({ id, name, fee }) => ({ id, name, fee })),
      buildPizza: {
        productId: buildPizzaProduct.id,
        name: buildPizzaProduct.name,
        description: buildPizzaProduct.description,
        basePrice: settings.buildPizzaBasePrice,
        promoPrice: settings.buildPizzaPromoPrice,
        includedInPromo: settings.buildPizzaPromoIncluded,
        available: buildPizzaProduct.available,
      },
      business: {
        name: settings.businessName,
        whatsappNumber: settings.whatsappNumber,
        pickupAddress: settings.pickupAddress,
        openingHours: settings.openingHours,
        isOpen: status.isOpen,
        nextOpening: status.nextOpening?.toISOString() ?? null,
        ordersPaused: status.ordersPaused,
      },
    }
  }
}

function toProduct(product: ProductRow, variants: VariantRow[]): ProductDto {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    // Con variantes, el precio está en cada una.
    price: variants.length > 0 ? null : product.price,
    variants: variants.map(({ id, label, price }) => ({ id, label, price })),
    tags: product.tags,
    imageUrl: product.imageUrl,
    available: product.available,
  }
}
