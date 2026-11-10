import {
  ingredientPatchSchema,
  productPatchSchema,
  settingsPatchSchema,
  validationDetails,
  variantPatchSchema,
  zoneCreateSchema,
  zonePatchSchema,
  type AdminSettings,
  type AdminZone,
  type MenuResponse,
  type SessionUser,
} from '@rys/contracts'
import { slugify } from '@rys/domain'
import { vi } from 'vitest'
import { ApiError, type AdminApi } from '../api/admin-api'

/** Una carta chica con lo que importa para la gestión: precio simple, variantes, Arma tu pizza e ingredientes. */
export const makeMenu = (): MenuResponse => ({
  categories: [
    {
      id: 'pizzas',
      name: 'Pizzas',
      description: null,
      kind: 'regular',
      products: [
        {
          id: 'suprema',
          name: 'Suprema',
          description: 'Carne mechada y queso.',
          price: 13000,
          variants: [],
          tags: [],
          imageUrl: null,
          available: true,
        },
        { id: 'california', name: 'California', description: null, price: 12000, variants: [], tags: [], imageUrl: null, available: false },
      ],
    },
    {
      id: 'jugos',
      name: 'Jugos',
      description: null,
      kind: 'regular',
      products: [
        {
          id: 'jugo-mango',
          name: 'Mango',
          description: null,
          price: null,
          variants: [
            { id: 'jugo-mango-500', label: '500 cc', price: 3500 },
            { id: 'jugo-mango-1l', label: '1 L', price: 5000 },
          ],
          tags: [],
          imageUrl: null,
          available: true,
        },
      ],
    },
    { id: 'arma-tu-pizza', name: 'Arma tu pizza', description: null, kind: 'build_pizza', products: [] },
  ],
  ingredients: [
    { id: 'tocino', name: 'Tocino', price: 1500, available: true },
    { id: 'choclo', name: 'Choclo', price: 1000, available: false },
  ],
  zones: [],
  buildPizza: {
    productId: 'arma-tu-pizza',
    name: 'Arma tu pizza',
    description: 'Salsa, mozzarella y masa.',
    basePrice: 10900,
    promoPrice: 13000,
    includedInPromo: 3,
    available: true,
  },
  business: {
    name: 'Rápida y Sabrosa',
    whatsappNumber: '56974314602',
    pickupAddress: null,
    openingHours: null,
    isOpen: true,
    nextOpening: null,
    ordersPaused: false,
  },
})

export const makeZones = (): AdminZone[] => [
  { id: 'islita', name: 'Islita', fee: 2000, active: true },
  { id: 'sub-sole', name: 'Sub Sole', fee: 2500, active: true },
  { id: 'paimsa', name: 'Paimsa', fee: 3000, active: false },
]

export const makeSettings = (overrides: Partial<AdminSettings> = {}): AdminSettings => ({
  whatsappNumber: '56974314602',
  pickupAddress: null,
  openingHours: null,
  timezone: 'America/Santiago',
  ordersPaused: false,
  buildPizzaBasePrice: 10900,
  buildPizzaPromoPrice: 13000,
  buildPizzaPromoIncluded: 3,
  updatedAt: '2026-11-03T22:00:00.000Z',
  ...overrides,
})

type ManagementApi = Pick<
  AdminApi,
  | 'getMenu'
  | 'updateProduct'
  | 'updateVariant'
  | 'updateIngredient'
  | 'listZones'
  | 'createZone'
  | 'updateZone'
  | 'getSettings'
  | 'updateSettings'
>

/** Lo que se usa de un esquema de Zod, sin depender de la librería. */
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: Parameters<typeof validationDetails>[0] }
}

const forbidden = () => new ApiError('FORBIDDEN', 'Tu usuario no tiene permiso para hacer este cambio.', 403)
const notFound = (what: string) => new ApiError('NOT_FOUND', `No existe ${what}.`, 404)

/**
 * La gestión del panel en memoria. Valida con los mismos esquemas de @rys/contracts y aplica los mismos permisos por
 * rol que la API de verdad.
 */
export function createManagementFake(currentUser: () => SessionUser | null, initialSettings: Partial<AdminSettings> = {}) {
  const menu = makeMenu()
  let zones = makeZones()
  let settings = makeSettings(initialSettings)
  let nextFailure: ApiError | null = null

  /** Sesión, y el error pedido con failNext si lo hay. */
  const enter = (): SessionUser => {
    const user = currentUser()
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Inicia sesión para continuar.', 401)
    if (nextFailure) {
      const error = nextFailure
      nextFailure = null
      throw error
    }
    return user
  }

  const parse = <T>(schema: Parser<T>, body: unknown): T => {
    const result = schema.safeParse(body)
    if (!result.success) throw new ApiError('VALIDATION_ERROR', 'Revisa los datos.', 400, validationDetails(result.error))
    return result.data
  }

  /** Igual que la API: caja solo cambia los campos de `staffFields`. */
  const assertCanChange = (user: SessionUser, changes: object, staffFields: string[]) => {
    if (user.role !== 'admin' && Object.keys(changes).some((field) => !staffFields.includes(field))) throw forbidden()
  }
  const assertAdmin = (user: SessionUser) => {
    if (user.role !== 'admin') throw forbidden()
  }

  const allProducts = () => menu.categories.flatMap((category) => category.products)

  const api: ManagementApi = {
    getMenu: vi.fn(async () => {
      enter()
      return structuredClone(menu)
    }),
    updateProduct: vi.fn(async (id, body) => {
      const user = enter()
      const patch = parse(productPatchSchema, body)
      assertCanChange(user, patch, ['available'])
      if (id === menu.buildPizza.productId) {
        if (patch.price !== undefined) {
          const message = 'El precio de este producto se cambia en Ajustes.'
          throw new ApiError('VALIDATION_ERROR', message, 400, { price: message })
        }
        const { price: _price, ...changes } = patch
        Object.assign(menu.buildPizza, changes)
        const { name, description, available } = menu.buildPizza
        return { id, name, description, price: null, variants: [], available }
      }
      const product = allProducts().find((candidate) => candidate.id === id)
      if (!product) throw notFound(`el producto ${id}`)
      if (patch.price !== undefined && product.variants.length > 0) {
        const message = 'Este producto tiene variantes: cambia el precio en cada una.'
        throw new ApiError('VALIDATION_ERROR', message, 400, { price: message })
      }
      Object.assign(product, patch)
      const { name, description, price, variants, available } = product
      return structuredClone({ id, name, description, price, variants, available })
    }),
    updateVariant: vi.fn(async (id, body) => {
      assertAdmin(enter())
      const patch = parse(variantPatchSchema, body)
      const variant = allProducts()
        .flatMap((product) => product.variants)
        .find((candidate) => candidate.id === id)
      if (!variant) throw notFound(`la variante ${id}`)
      Object.assign(variant, patch)
      return { ...variant }
    }),
    updateIngredient: vi.fn(async (id, body) => {
      const user = enter()
      const patch = parse(ingredientPatchSchema, body)
      assertCanChange(user, patch, ['available'])
      const ingredient = menu.ingredients.find((candidate) => candidate.id === id)
      if (!ingredient) throw notFound(`el ingrediente ${id}`)
      Object.assign(ingredient, patch)
      return { ...ingredient }
    }),
    listZones: vi.fn(async () => {
      assertAdmin(enter())
      return structuredClone(zones)
    }),
    createZone: vi.fn(async (body) => {
      assertAdmin(enter())
      const created = parse(zoneCreateSchema, body)
      if (zones.some((zone) => zone.name.toLowerCase() === created.name.toLowerCase())) {
        const message = 'Ya existe una zona con ese nombre.'
        throw new ApiError('VALIDATION_ERROR', message, 400, { name: message })
      }
      const zone: AdminZone = { id: slugify(created.name), ...created }
      zones = [...zones, zone]
      return { ...zone }
    }),
    updateZone: vi.fn(async (id, body) => {
      assertAdmin(enter())
      const patch = parse(zonePatchSchema, body)
      const zone = zones.find((candidate) => candidate.id === id)
      if (!zone) throw notFound(`la zona ${id}`)
      Object.assign(zone, patch)
      return { ...zone }
    }),
    getSettings: vi.fn(async () => {
      enter()
      return structuredClone(settings)
    }),
    updateSettings: vi.fn(async (body) => {
      const user = enter()
      const patch = parse(settingsPatchSchema, body)
      assertCanChange(user, patch, ['ordersPaused'])
      settings = { ...settings, ...patch }
      return structuredClone(settings)
    }),
  }

  return {
    api,
    /** Lo que quedó guardado "en el servidor". */
    menu: () => menu,
    zones: () => zones,
    settings: () => settings,
    /** La próxima llamada de gestión falla con este error. */
    failNext(error: ApiError) {
      nextFailure = error
    },
  }
}
