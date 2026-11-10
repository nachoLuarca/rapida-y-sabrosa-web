import {
  adminIngredientSchema,
  adminOrderDetailSchema,
  adminProductSchema,
  adminSettingsSchema,
  adminVariantSchema,
  adminZoneSchema,
  errorResponseSchema,
  menuResponseSchema,
  meResponseSchema,
  ordersListResponseSchema,
  zonesListResponseSchema,
  type AdminOrderDetail,
  type AdminProduct,
  type AdminSettings,
  type AdminZone,
  type IngredientDto,
  type IngredientPatch,
  type MenuResponse,
  type OrdersListResponse,
  type ProductPatch,
  type SessionUser,
  type SettingsPatchInput,
  type StatusChangeRequest,
  type VariantDto,
  type VariantPatch,
  type ZoneCreateInput,
  type ZonePatch,
} from '@rys/contracts'
import type { OrderStatus } from '@rys/domain'

/** Error de la API con su código (UNAUTHENTICATED, INVALID_TRANSITION…) o NETWORK si no hubo respuesta. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const isUnauthenticated = (error: unknown) => error instanceof ApiError && error.code === 'UNAUTHENTICATED'

export interface OrdersQuery {
  status?: readonly OrderStatus[]
  from?: string
  to?: string
  q?: string
  page?: number
  pageSize?: number
}

/** Las llamadas del panel a /api/admin. Las respuestas se validan con @rys/contracts. */
export interface AdminApi {
  /** null si no hay sesión. */
  me(): Promise<SessionUser | null>
  login(email: string, password: string): Promise<SessionUser>
  logout(): Promise<void>
  listOrders(query: OrdersQuery): Promise<OrdersListResponse>
  getOrder(code: string): Promise<AdminOrderDetail>
  changeStatus(code: string, change: StatusChangeRequest): Promise<AdminOrderDetail>
  /** La carta como la ve la web (GET /api/menu): productos, variantes e ingredientes con su disponibilidad. */
  getMenu(): Promise<MenuResponse>
  updateProduct(id: string, patch: ProductPatch): Promise<AdminProduct>
  updateVariant(id: string, patch: VariantPatch): Promise<VariantDto>
  updateIngredient(id: string, patch: IngredientPatch): Promise<IngredientDto>
  /** Todas las zonas, también las desactivadas. Solo administración. */
  listZones(): Promise<AdminZone[]>
  createZone(zone: ZoneCreateInput): Promise<AdminZone>
  updateZone(id: string, patch: ZonePatch): Promise<AdminZone>
  getSettings(): Promise<AdminSettings>
  updateSettings(patch: SettingsPatchInput): Promise<AdminSettings>
}

const NETWORK_MESSAGE = 'No pudimos conectar con el servidor. Revisa la conexión e inténtalo de nuevo.'

export function createAdminApi(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl = '/api/admin',
  menuUrl = '/api/menu',
): AdminApi {
  const call = <T>(method: string, path: string, schema: { parse(value: unknown): T } | null, body?: unknown) =>
    request(method, `${baseUrl}${path}`, schema, body)

  async function request<T>(method: string, url: string, schema: { parse(value: unknown): T } | null, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError('NETWORK', NETWORK_MESSAGE, 0)
    }
    if (response.status === 204) return undefined as T

    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new ApiError('INTERNAL_ERROR', 'El servidor respondió algo inesperado. Inténtalo de nuevo.', response.status)
    }
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(json)
      if (!parsed.success) throw new ApiError('INTERNAL_ERROR', 'Ocurrió un error inesperado.', response.status)
      const { code, message, details } = parsed.data.error
      throw new ApiError(code, message, response.status, details)
    }
    return schema ? schema.parse(json) : (json as T)
  }

  return {
    async me() {
      try {
        return (await call('GET', '/me', meResponseSchema)).user
      } catch (error) {
        if (isUnauthenticated(error)) return null
        throw error
      }
    },
    async login(email, password) {
      return (await call('POST', '/session', meResponseSchema, { email, password })).user
    },
    async logout() {
      await call('DELETE', '/session', null)
    },
    listOrders(query) {
      const params = new URLSearchParams()
      if (query.status?.length) params.set('status', query.status.join(','))
      if (query.from) params.set('from', query.from)
      if (query.to) params.set('to', query.to)
      if (query.q) params.set('q', query.q)
      if (query.page) params.set('page', String(query.page))
      if (query.pageSize) params.set('pageSize', String(query.pageSize))
      const search = params.toString()
      return call('GET', `/orders${search ? `?${search}` : ''}`, ordersListResponseSchema)
    },
    getOrder(code) {
      return call('GET', `/orders/${encodeURIComponent(code)}`, adminOrderDetailSchema)
    },
    changeStatus(code, change) {
      return call('PATCH', `/orders/${encodeURIComponent(code)}/status`, adminOrderDetailSchema, change)
    },
    getMenu() {
      return request('GET', menuUrl, menuResponseSchema)
    },
    updateProduct(id, patch) {
      return call('PATCH', `/products/${encodeURIComponent(id)}`, adminProductSchema, patch)
    },
    updateVariant(id, patch) {
      return call('PATCH', `/variants/${encodeURIComponent(id)}`, adminVariantSchema, patch)
    },
    updateIngredient(id, patch) {
      return call('PATCH', `/ingredients/${encodeURIComponent(id)}`, adminIngredientSchema, patch)
    },
    async listZones() {
      return (await call('GET', '/zones', zonesListResponseSchema)).zones
    },
    createZone(zone) {
      return call('POST', '/zones', adminZoneSchema, zone)
    },
    updateZone(id, patch) {
      return call('PATCH', `/zones/${encodeURIComponent(id)}`, adminZoneSchema, patch)
    },
    getSettings() {
      return call('GET', '/settings', adminSettingsSchema)
    },
    updateSettings(patch) {
      return call('PATCH', '/settings', adminSettingsSchema, patch)
    },
  }
}
