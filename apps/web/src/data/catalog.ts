import type { Catalog } from '@rys/domain'
import { ingredients } from './ingredients'
import { buildPizza, products } from './menu'

export const catalog: Catalog = { products, buildPizza, ingredients }
