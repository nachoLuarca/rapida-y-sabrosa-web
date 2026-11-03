import { menuResponseSchema } from '@rys/contracts'
import type { RequestHandler } from 'express'
import { etagFor, matchesIfNoneMatch } from '../http/etag.ts'
import type { CatalogService } from '../services/catalog-service.ts'

export interface MenuController {
  getMenu: RequestHandler
}

/**
 * GET /api/menu. La respuesta se valida con el esquema de @rys/contracts antes de salir: si no cumple, es un
 * error nuestro (500), nunca una carta a medias para la web. Con el mismo ETag responde 304 sin body.
 */
export function createMenuController(catalog: CatalogService): MenuController {
  return {
    async getMenu(req, res) {
      const menu = menuResponseSchema.parse(await catalog.getMenu())
      const body = JSON.stringify(menu)
      const etag = etagFor(body)

      // no-cache: el navegador puede guardarla, pero debe preguntar cada vez (con If-None-Match).
      res.set({ ETag: etag, 'Cache-Control': 'no-cache' })
      if (matchesIfNoneMatch(req.get('If-None-Match'), etag)) {
        res.status(304).end()
        return
      }
      res.type('application/json').send(body)
    },
  }
}
