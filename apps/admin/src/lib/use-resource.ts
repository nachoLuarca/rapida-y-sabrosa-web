import { useCallback, useEffect, useState } from 'react'
import { ApiError, isUnauthenticated, type AdminApi } from '../api/admin-api'
import { useAuth, useServices } from '../panel-context'

/** El mensaje de un error de la API para mostrar. Si la sesión venció, además vuelve al login. */
export function useApiFailure(): (error: unknown) => string {
  const { sessionExpired } = useAuth()
  return useCallback(
    (error: unknown) => {
      if (isUnauthenticated(error)) sessionExpired()
      return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.'
    },
    [sessionExpired],
  )
}

export type Resource<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }

/**
 * Carga un dato de la API al abrir la página. `fetcher` tiene que ser estable (una función de módulo). `update`
 * cambia el dato ya cargado (después de guardar); `retry` lo vuelve a pedir.
 */
export function useResource<T>(fetcher: (api: AdminApi) => Promise<T>) {
  const { api } = useServices()
  const failure = useApiFailure()
  const [state, setState] = useState<Resource<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    fetcher(api).then(
      (data) => {
        if (active) setState({ status: 'ready', data })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: failure(error) })
      },
    )
    return () => {
      active = false
    }
  }, [api, fetcher, failure, attempt])

  const update = useCallback((change: (current: T) => T) => {
    setState((current) => (current.status === 'ready' ? { status: 'ready', data: change(current.data) } : current))
  }, [])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }, [])

  return { state, update, retry }
}
