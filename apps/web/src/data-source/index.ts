import { createApiCatalogSource, createStaticCatalogSource, type CatalogSource } from './catalog-source'
import { createApiOrderGateway, createStaticOrderGateway, type OrderGateway } from './order-gateway'

export interface DataSources {
  catalog: CatalogSource
  orders: OrderGateway
}

/**
 * Las de esta build, según VITE_DATA_SOURCE: 'api' usa GET /api/menu y POST /api/orders; cualquier otro valor
 * (o vacío) es la carta estática de siempre. Vite resuelve la comparación al compilar, así que en build:demo (que
 * fuerza 'static') el código de la API no entra al bundle.
 */
export function defaultDataSources(): DataSources {
  if (import.meta.env.VITE_DATA_SOURCE === 'api') {
    return { catalog: createApiCatalogSource(), orders: createApiOrderGateway() }
  }
  return { catalog: createStaticCatalogSource(), orders: createStaticOrderGateway() }
}
