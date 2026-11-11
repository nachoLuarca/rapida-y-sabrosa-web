import type { AdminOrderDetail, AdminOrderSummary, AdminSettings, OrderStreamEvent, SessionUser } from '@rys/contracts'
import { nextStatuses, ORDER_STATUS_LABELS, validateTransition } from '@rys/domain'
import { vi } from 'vitest'
import { ApiError, type AdminApi } from '../api/admin-api'
import type { EventSourceLike } from '../api/order-stream'
import type { PanelServices } from '../panel-context'
import { createManagementFake } from './fake-management'

export const CAJA: SessionUser = { id: '3f0e0b8c-6d3f-4a51-9c5e-2b1b5a1f8a10', email: 'caja@demo.local', name: 'Caja', role: 'staff' }
export const ADMIN: SessionUser = { id: '8a1c2f6e-0b7d-4c39-9a44-5d2e7f3b6c21', email: 'admin@demo.local', name: 'Dueña', role: 'admin' }
export const PASSWORD = 'clave-de-la-demo'

let minute = 0
/** Un pedido de prueba; cada uno, un minuto después del anterior (el martes 3 de noviembre a las 19:00). */
export function makeOrder(code: string, overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  const createdAt = new Date(Date.UTC(2026, 10, 3, 22, minute++)).toISOString()
  const base: AdminOrderDetail = {
    code,
    status: 'pending',
    fulfillment: 'pickup',
    zoneName: null,
    customerName: 'Ana Rojas',
    total: 13000,
    itemCount: 1,
    createdAt,
    updatedAt: createdAt,
    payment: 'cash',
    customerPhone: '56912345678',
    address: null,
    notes: null,
    subtotal: 13000,
    deliveryFee: 0,
    lines: [
      { productId: 'suprema', name: 'Suprema', variantLabel: null, ingredients: null, unitPrice: 13000, quantity: 1, lineTotal: 13000 },
    ],
    history: [{ fromStatus: null, toStatus: 'pending', changedBy: null, reason: null, createdAt }],
    nextStatuses: [],
    anonymizedAt: null,
  }
  const order = { ...base, ...overrides }
  return { ...order, nextStatuses: nextStatuses(order.status, order.fulfillment) }
}

const toSummary = ({ code, status, fulfillment, zoneName, customerName, total, itemCount, createdAt, updatedAt }: AdminOrderDetail): AdminOrderSummary => ({
  code,
  status,
  fulfillment,
  zoneName,
  customerName,
  total,
  itemCount,
  createdAt,
  updatedAt,
})

/** API del panel en memoria, con la misma tabla de transiciones del dominio que usa la API de verdad. */
export function createFakeApi(
  options: { loggedIn?: boolean; user?: SessionUser; orders?: AdminOrderDetail[]; settings?: Partial<AdminSettings> } = {},
) {
  /** Quién usa el panel en este test: caja (por defecto) o administración. */
  const account = options.user ?? CAJA
  let session: SessionUser | null = options.loggedIn === false ? null : account
  const management = createManagementFake(() => session, options.settings)
  const orders = new Map((options.orders ?? []).map((order) => [order.code, order]))
  const unauthenticated = () => new ApiError('UNAUTHENTICATED', 'Inicia sesión para continuar.', 401)
  const requireSession = () => {
    if (!session) throw unauthenticated()
  }

  const api: AdminApi = {
    me: vi.fn(async () => session),
    login: vi.fn(async (email: string, password: string) => {
      if (email.trim().toLowerCase() !== account.email || password !== PASSWORD) {
        throw new ApiError('INVALID_CREDENTIALS', 'El email o la contraseña no son correctos.', 401)
      }
      session = account
      return account
    }),
    logout: vi.fn(async () => {
      session = null
    }),
    listOrders: vi.fn(async (query) => {
      requireSession()
      const found = [...orders.values()]
        .filter((order) => !query.status || query.status.includes(order.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return { orders: found.map(toSummary), page: 1, pageSize: query.pageSize ?? 50, total: found.length }
    }),
    getOrder: vi.fn(async (code: string) => {
      requireSession()
      const order = orders.get(code)
      if (!order) throw new ApiError('NOT_FOUND', `No existe el pedido ${code}.`, 404)
      return order
    }),
    changeStatus: vi.fn(async (code: string, change) => {
      requireSession()
      const order = orders.get(code)
      if (!order) throw new ApiError('NOT_FOUND', `No existe el pedido ${code}.`, 404)
      const check = validateTransition(order.status, change.status, order.fulfillment, change.reason)
      if (!check.ok) {
        if (check.error === 'REASON_REQUIRED') throw new ApiError('VALIDATION_ERROR', check.message, 400, { reason: check.message })
        throw new ApiError('INVALID_TRANSITION', check.message, 409)
      }
      const now = new Date().toISOString()
      const updated: AdminOrderDetail = {
        ...order,
        status: change.status,
        updatedAt: now,
        nextStatuses: nextStatuses(change.status, order.fulfillment),
        history: [
          ...order.history,
          { fromStatus: order.status, toStatus: change.status, changedBy: { id: CAJA.id, name: CAJA.name }, reason: check.reason, createdAt: now },
        ],
      }
      orders.set(code, updated)
      return updated
    }),
    ...management.api,
  }

  return {
    api,
    menu: management.menu,
    zones: management.zones,
    settings: management.settings,
    failNext: management.failNext,
    /** Como si otra persona o un cliente cambiara los pedidos en el servidor. */
    put(order: AdminOrderDetail) {
      orders.set(order.code, order)
    },
    expireSession() {
      session = null
    },
    statusOf: (code: string) => ORDER_STATUS_LABELS[orders.get(code)?.status ?? 'pending'],
  }
}

/** EventSource de mentira: el test decide cuándo se conecta, cuándo se cae y qué eventos llegan. */
export class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = []
  static latest(): FakeEventSource {
    const last = FakeEventSource.instances.at(-1)
    if (!last) throw new Error('No se abrió ningún EventSource')
    return last
  }

  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false
  readonly url: string
  private readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close() {
    this.closed = true
    this.readyState = 2
  }

  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  /** La conexión se cae y el navegador va a reintentar solo (CONNECTING). */
  drop() {
    this.readyState = 0
    this.onerror?.(new Event('error'))
  }

  /** El navegador se rinde (por ejemplo, la API respondió 401). */
  fail() {
    this.readyState = 2
    this.onerror?.(new Event('error'))
  }

  emit(name: 'order.created' | 'order.updated', data: OrderStreamEvent) {
    for (const listener of this.listeners.get(name) ?? []) listener(new MessageEvent(name, { data: JSON.stringify(data) }))
  }
}

export function createServices(fake: ReturnType<typeof createFakeApi>) {
  FakeEventSource.instances = []
  return {
    api: fake.api,
    createEventSource: (url) => new FakeEventSource(url),
    chime: { play: vi.fn<() => void>(), unlock: vi.fn<() => void>() },
  } satisfies PanelServices
}

export const eventOf = (order: AdminOrderDetail): OrderStreamEvent => ({
  code: order.code,
  status: order.status,
  fulfillment: order.fulfillment,
  total: order.total,
  createdAt: order.createdAt,
})
