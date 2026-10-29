import type { Catalog } from '../domain/types'
import { ingredients } from './ingredients'
import { buildPizza, products } from './menu'

export const catalog: Catalog = { products, buildPizza, ingredients }
