import {
  adminIngredientSchema,
  adminProductSchema,
  adminSettingsSchema,
  adminVariantSchema,
  adminZoneSchema,
  ingredientPatchSchema,
  productPatchSchema,
  settingsPatchSchema,
  validationDetails,
  variantPatchSchema,
  zoneCreateSchema,
  zonePatchSchema,
  zonesListResponseSchema,
} from '@rys/contracts'
import type { Request, RequestHandler } from 'express'
import type { z } from 'zod'
import { AppError } from '../errors/app-error.ts'
import { sessionUser } from '../middlewares/auth.ts'
import type { CatalogAdminService } from '../services/catalog-admin-service.ts'
import type { DeliveryService } from '../services/delivery-service.ts'
import type { SettingsService } from '../services/settings-service.ts'

export interface AdminCatalogController {
  updateProduct: RequestHandler
  updateVariant: RequestHandler
  updateIngredient: RequestHandler
}

export interface AdminZoneController {
  list: RequestHandler
  create: RequestHandler
  update: RequestHandler
}

export interface AdminSettingsController {
  get: RequestHandler
  update: RequestHandler
}

/** El body validado, o un VALIDATION_ERROR con un mensaje por campo. */
function parseBody<Schema extends z.ZodType>(schema: Schema, req: Request): z.output<Schema> {
  const body = schema.safeParse(req.body ?? {})
  if (!body.success) throw new AppError('VALIDATION_ERROR', 'Revisa los datos.', validationDetails(body.error))
  return body.data
}

const idOf = (req: Request) => String(req.params.id)

/** Queda en el log quién cambió qué (los campos, no los valores) para poder reconstruir un cambio de la carta. */
function logChange(req: Request, resource: string, id: string | null, changes: object): void {
  req.log.info({ resource, id, fields: Object.keys(changes), userId: sessionUser(req).id }, 'cambio en la gestión')
}

/** PATCH /api/admin/products/:id, /variants/:id e /ingredients/:id. */
export function createAdminCatalogController(catalog: CatalogAdminService): AdminCatalogController {
  return {
    async updateProduct(req, res) {
      const patch = parseBody(productPatchSchema, req)
      const product = await catalog.updateProduct(idOf(req), patch, sessionUser(req))
      logChange(req, 'product', product.id, patch)
      res.json(adminProductSchema.parse(product))
    },

    async updateVariant(req, res) {
      const patch = parseBody(variantPatchSchema, req)
      const variant = await catalog.updateVariant(idOf(req), patch)
      logChange(req, 'variant', variant.id, patch)
      res.json(adminVariantSchema.parse(variant))
    },

    async updateIngredient(req, res) {
      const patch = parseBody(ingredientPatchSchema, req)
      const ingredient = await catalog.updateIngredient(idOf(req), patch, sessionUser(req))
      logChange(req, 'ingredient', ingredient.id, patch)
      res.json(adminIngredientSchema.parse(ingredient))
    },
  }
}

/** GET y POST /api/admin/zones, PATCH /api/admin/zones/:id. */
export function createAdminZoneController(delivery: DeliveryService): AdminZoneController {
  return {
    async list(_req, res) {
      res.set('Cache-Control', 'no-store').json(zonesListResponseSchema.parse({ zones: await delivery.list() }))
    },

    async create(req, res) {
      const zone = await delivery.create(parseBody(zoneCreateSchema, req))
      logChange(req, 'zone', zone.id, zone)
      res.status(201).json(adminZoneSchema.parse(zone))
    },

    async update(req, res) {
      const patch = parseBody(zonePatchSchema, req)
      const zone = await delivery.update(idOf(req), patch)
      logChange(req, 'zone', zone.id, patch)
      res.json(adminZoneSchema.parse(zone))
    },
  }
}

/** GET y PATCH /api/admin/settings. */
export function createAdminSettingsController(settings: SettingsService): AdminSettingsController {
  return {
    async get(_req, res) {
      res.set('Cache-Control', 'no-store').json(adminSettingsSchema.parse(await settings.get()))
    },

    async update(req, res) {
      const patch = parseBody(settingsPatchSchema, req)
      const updated = await settings.update(patch, sessionUser(req))
      logChange(req, 'settings', null, patch)
      res.json(adminSettingsSchema.parse(updated))
    },
  }
}
