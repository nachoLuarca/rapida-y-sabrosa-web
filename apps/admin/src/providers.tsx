import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { connectOrderStream, type StreamStatus } from './api/order-stream'
import { newOrderAnnouncement } from './lib/board'
import { loadSoundPreference, saveSoundPreference } from './lib/chime'
import {
  AuthContext,
  LiveContext,
  useAuth,
  useServices,
  type AuthValue,
  type LiveMessage,
  type LiveValue,
} from './panel-context'

/** Sesión del panel: al abrir pregunta a la API quién es el usuario (la cookie es HttpOnly, el panel no la ve). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { api } = useServices()
  const [state, setState] = useState<Pick<AuthValue, 'status' | 'user'>>({ status: 'checking', user: null })

  useEffect(() => {
    let active = true
    api.me().then(
      (user) => {
        if (active) setState({ status: 'ready', user })
      },
      () => {
        // Sin conexión con la API: se muestra el login; al entrar se vuelve a intentar.
        if (active) setState({ status: 'ready', user: null })
      },
    )
    return () => {
      active = false
    }
  }, [api])

  const value = useMemo<AuthValue>(
    () => ({
      ...state,
      async login(email, password) {
        const user = await api.login(email, password)
        setState({ status: 'ready', user })
      },
      async logout() {
        try {
          await api.logout()
        } finally {
          setState({ status: 'ready', user: null })
        }
      },
      sessionExpired() {
        setState({ status: 'ready', user: null })
      },
      async checkSession() {
        try {
          if (!(await api.me())) setState({ status: 'ready', user: null })
        } catch {
          // Sin conexión: el SSE sigue reintentando y la sesión se revisa en la próxima llamada.
        }
      },
    }),
    [state, api],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

/**
 * Pedidos en vivo mientras hay sesión: una sola conexión SSE para todo el panel. Con un pedido nuevo suena el aviso
 * (si está activado) y se anuncia a los lectores de pantalla; las páginas se suscriben para recargar.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { createEventSource, chime } = useServices()
  const { checkSession } = useAuth()
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [announcement, setAnnouncement] = useState('')
  const [soundOn, setSoundOn] = useState(loadSoundPreference)
  const listeners = useRef(new Set<(message: LiveMessage) => void>())
  const soundRef = useRef(soundOn)
  const checkRef = useRef(checkSession)

  useEffect(() => {
    soundRef.current = soundOn
    checkRef.current = checkSession
  })

  useEffect(() => {
    const notify = (message: LiveMessage) => {
      for (const listener of listeners.current) listener(message)
    }
    return connectOrderStream(createEventSource, {
      onStatus: setStatus,
      onOpen: () => notify({ type: 'open' }),
      onClosed: () => void checkRef.current(),
      onEvent: (name, event) => {
        if (name === 'order.created') {
          setAnnouncement(newOrderAnnouncement(event))
          if (soundRef.current) chime.play()
        }
        notify({ type: 'event', name, event })
      },
    })
  }, [createEventSource, chime])

  const subscribe = useCallback<LiveValue['subscribe']>((listener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current
      saveSoundPreference(next)
      return next
    })
    // El clic es el gesto que los navegadores exigen para dejar sonar audio después.
    chime.unlock()
  }, [chime])

  const value = useMemo<LiveValue>(() => ({ status, subscribe, soundOn, toggleSound }), [status, subscribe, soundOn, toggleSound])

  return (
    <LiveContext value={value}>
      {children}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </LiveContext>
  )
}
