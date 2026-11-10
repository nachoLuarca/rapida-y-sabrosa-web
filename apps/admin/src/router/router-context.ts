import { createContext, useContext } from 'react'

// Router mínimo con la History API: el panel tiene pocas rutas fijas y no justifica una dependencia (CLAUDE.md).

export interface RouterValue {
  path: string
  navigate: (to: string, options?: { replace?: boolean }) => void
}

export const RouterContext = createContext<RouterValue | null>(null)

export function useRouter(): RouterValue {
  const router = useContext(RouterContext)
  if (!router) throw new Error('useRouter debe usarse dentro de <RouterProvider>')
  return router
}

/** Páginas de gestión: la ruta de cada una. */
export const MANAGEMENT_ROUTES = {
  menu: '/carta',
  ingredients: '/ingredientes',
  zones: '/zonas',
  settings: '/ajustes',
} as const

export type ManagementRoute = keyof typeof MANAGEMENT_ROUTES

export type Route =
  | { name: 'login' }
  | { name: 'orders' }
  | { name: 'order'; code: string }
  | { name: ManagementRoute }
  | { name: 'not-found' }

/** /login, /pedidos, /pedidos/:code, /carta, /ingredientes, /zonas y /ajustes. La raíz va a los pedidos. */
export function matchRoute(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/'
  if (clean === '/login') return { name: 'login' }
  if (clean === '/' || clean === '/pedidos') return { name: 'orders' }
  for (const [name, route] of Object.entries(MANAGEMENT_ROUTES)) {
    if (clean === route) return { name: name as ManagementRoute }
  }
  const order = /^\/pedidos\/([^/]+)$/.exec(clean)
  if (order) return { name: 'order', code: decodeURIComponent(order[1]) }
  return { name: 'not-found' }
}
