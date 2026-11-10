import {
  STAFF_INGREDIENT_FIELDS,
  STAFF_PRODUCT_FIELDS,
  type AdminProduct,
  type IngredientDto,
  type IngredientPatch,
  type ProductPatch,
  type SessionUser,
  type VariantDto,
  type VariantPatch,
} from '@rys/contracts'
import { AppError } from '../errors/app-error.ts'
import type { CatalogRepository } from '../repositories/catalog-repository.ts'
import { assertCanChange } from './permissions.ts'

/**
 * Gestión de la carta desde el panel: productos, variantes e ingredientes. No hay nada que invalidar a mano: el
 * ETag del menú es el hash de la carta, así que cambia solo con cada cambio.
 */
export class CatalogAdminService {
  private readonly catalog: CatalogRepository

  constructor(catalog: CatalogRepository) {
    this.catalog = catalog
  }

  async updateProduct(id: string, patch: ProductPatch, user: SessionUser): Promise<AdminProduct> {
    assertCanChange(user, patch, STAFF_PRODUCT_FIELDS)
    const product = await this.catalog.findProduct(id)
    if (!product) throw new AppError('NOT_FOUND', `No existe el producto ${id}.`)
    const variants = await this.catalog.variantsOf(id)

    if (patch.price !== undefined) {
      // El precio vive en un solo lugar: en las variantes si las tiene, y en los ajustes para Arma tu pizza.
      const message =
        variants.length > 0
          ? 'Este producto tiene variantes: cambia el precio en cada una.'
          : product.price === null
            ? 'El precio de este producto se cambia en Ajustes.'
            : null
      if (message) throw new AppError('VALIDATION_ERROR', message, { price: message })
    }

    const updated = await this.catalog.updateProduct(id, patch)
    if (!updated) throw new AppError('NOT_FOUND', `No existe el producto ${id}.`)
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      price: variants.length > 0 ? null : updated.price,
      variants: variants.map(({ id: variantId, label, price }) => ({ id: variantId, label, price })),
      available: updated.available,
    }
  }

  async updateVariant(id: string, patch: VariantPatch): Promise<VariantDto> {
    const updated = await this.catalog.updateVariant(id, patch)
    if (!updated) throw new AppError('NOT_FOUND', `No existe la variante ${id}.`)
    return { id: updated.id, label: updated.label, price: updated.price }
  }

  async updateIngredient(id: string, patch: IngredientPatch, user: SessionUser): Promise<IngredientDto> {
    assertCanChange(user, patch, STAFF_INGREDIENT_FIELDS)
    const updated = await this.catalog.updateIngredient(id, patch)
    if (!updated) throw new AppError('NOT_FOUND', `No existe el ingrediente ${id}.`)
    return { id: updated.id, name: updated.name, price: updated.price, available: updated.available }
  }
}
