import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DataSources } from '../data-source'
import type { MenuData } from '../data-source/menu-data'
import { MenuContext, OrderGatewayContext, type MenuContextValue } from './menu-context'

interface MenuProviderProps {
  sources: DataSources
  children: ReactNode
}

/** setTimeout no acepta más de ~24,8 días; la próxima apertura nunca está tan lejos, pero por si acaso. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/**
 * La carta de la fuente elegida. Con la API: la pide al montar, la vuelve a pedir al volver a la pestaña (con
 * ETag no cuesta nada) y cuando llega la hora de abrir, para que el aviso de local cerrado se vaya solo.
 */
export function MenuProvider({ sources, children }: MenuProviderProps) {
  const { catalog } = sources
  const [state, setState] = useState<Pick<MenuContextValue, 'status' | 'menu'>>(() =>
    catalog.initial ? { status: 'ready', menu: catalog.initial } : { status: 'loading', menu: null },
  )
  const controller = useRef<AbortController | null>(null)

  const reload = useCallback(async (): Promise<MenuData | null> => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    try {
      const menu = await catalog.load(current.signal)
      if (current.signal.aborted) return null
      setState({ status: 'ready', menu })
      return menu
    } catch {
      if (current.signal.aborted) return null
      // Si ya había carta, se sigue mostrando: solo falla la primera carga.
      setState((previous) => (previous.menu ? previous : { status: 'error', menu: null }))
      return null
    }
  }, [catalog])

  // Primera carga (solo con la API: la estática ya viene lista).
  useEffect(() => {
    if (catalog.initial) return
    const first = new AbortController()
    controller.current = first
    catalog.load(first.signal).then(
      (menu) => {
        if (!first.signal.aborted) setState({ status: 'ready', menu })
      },
      () => {
        if (!first.signal.aborted) setState({ status: 'error', menu: null })
      },
    )
    return () => first.abort()
  }, [catalog])

  useEffect(() => {
    if (!catalog.refreshes) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [catalog, reload])

  const nextOpening = state.menu?.store.nextOpening ?? null
  useEffect(() => {
    if (!catalog.refreshes || !nextOpening) return
    const wait = Math.min(MAX_TIMEOUT_MS, Math.max(0, nextOpening.getTime() - Date.now()) + 1000)
    const timer = window.setTimeout(() => void reload(), wait)
    return () => window.clearTimeout(timer)
  }, [catalog, nextOpening, reload])

  const value = useMemo<MenuContextValue>(() => ({ ...state, reload }), [state, reload])

  return (
    <OrderGatewayContext value={sources.orders}>
      <MenuContext value={value}>{children}</MenuContext>
    </OrderGatewayContext>
  )
}
