import { createContext, useContext } from 'react'

// Router mínimo con la History API: el panel tiene tres rutas y no justifica una dependencia (CLAUDE.md).

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

export type Route = { name: 'login' } | { name: 'orders' } | { name: 'order'; code: string } | { name: 'not-found' }

/** /login, /pedidos y /pedidos/:code. La raíz va a los pedidos. */
export function matchRoute(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/'
  if (clean === '/login') return { name: 'login' }
  if (clean === '/' || clean === '/pedidos') return { name: 'orders' }
  const order = /^\/pedidos\/([^/]+)$/.exec(clean)
  if (order) return { name: 'order', code: decodeURIComponent(order[1]) }
  return { name: 'not-found' }
}
