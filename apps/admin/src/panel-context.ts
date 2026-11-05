import type { OrderStreamEvent, OrderStreamEventName, SessionUser } from '@rys/contracts'
import { createContext, useContext } from 'react'
import type { AdminApi } from './api/admin-api'
import type { CreateEventSource, StreamStatus } from './api/order-stream'
import type { Chime } from './lib/chime'

/** Lo que el panel usa del mundo de afuera. Los tests pasan versiones de mentira. */
export interface PanelServices {
  api: AdminApi
  createEventSource: CreateEventSource
  chime: Chime
}

export interface AuthValue {
  /** 'checking' mientras se pregunta a la API si hay sesión (al abrir el panel). */
  status: 'checking' | 'ready'
  user: SessionUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Una llamada respondió 401: la sesión venció o se cerró en otro lado. */
  sessionExpired: () => void
  /** Pregunta a la API si la sesión sigue viva (cuando el SSE se cierra). */
  checkSession: () => Promise<void>
}

export type LiveMessage = { type: 'open' } | { type: 'event'; name: OrderStreamEventName; event: OrderStreamEvent }

export interface LiveValue {
  status: StreamStatus
  /** Avisa de cada evento y de cada (re)conexión. Devuelve la función para dejar de escuchar. */
  subscribe: (listener: (message: LiveMessage) => void) => () => void
  soundOn: boolean
  toggleSound: () => void
}

export const ServicesContext = createContext<PanelServices | null>(null)
export const AuthContext = createContext<AuthValue | null>(null)
export const LiveContext = createContext<LiveValue | null>(null)

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} debe usarse dentro de <App>`)
  return value
}

export const useServices = () => required(useContext(ServicesContext), 'useServices')
export const useAuth = () => required(useContext(AuthContext), 'useAuth')
export const useLive = () => required(useContext(LiveContext), 'useLive')
