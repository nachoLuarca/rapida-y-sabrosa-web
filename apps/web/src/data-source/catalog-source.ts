import { menuResponseSchema } from '@rys/contracts'
import { toMenuData } from '../domain/menu-adapter'
import { staticMenuData, type MenuData } from './menu-data'

/** De dónde sale la carta (docs/BACKEND-SPEC.md → Cambios en la web). */
export interface CatalogSource {
  /** La carta lista desde el primer render (static), o null si hay que pedirla (api). */
  readonly initial: MenuData | null
  /** true si vale la pena volver a pedirla al volver a la pestaña (la API puede haber cambiado). */
  readonly refreshes: boolean
  load(signal?: AbortSignal): Promise<MenuData>
}

/** La carta del bundle: no hay nada que cargar. La usa build:demo, que funciona por file:// sin red. */
export function createStaticCatalogSource(menu: MenuData = staticMenuData()): CatalogSource {
  return { initial: menu, refreshes: false, load: async () => menu }
}

export class CatalogLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogLoadError'
  }
}

/**
 * GET /api/menu con ETag: la segunda vez manda If-None-Match y, si la carta no cambió (304), reusa la anterior.
 * La respuesta se valida con el esquema de @rys/contracts antes de usarla.
 */
export function createApiCatalogSource(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): CatalogSource {
  let cached: { etag: string; menu: MenuData } | null = null

  return {
    initial: null,
    refreshes: true,
    async load(signal) {
      const response = await fetchImpl(`${baseUrl}/menu`, {
        headers: { Accept: 'application/json', ...(cached ? { 'If-None-Match': cached.etag } : {}) },
        signal,
      })
      if (response.status === 304 && cached) return cached.menu
      if (!response.ok) throw new CatalogLoadError(`GET /api/menu respondió ${response.status}`)
      const menu = toMenuData(menuResponseSchema.parse(await response.json()))
      const etag = response.headers.get('ETag')
      cached = etag ? { etag, menu } : null
      return menu
    },
  }
}
