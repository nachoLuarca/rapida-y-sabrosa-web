import { createContext } from 'react'
import type { MenuData } from '../data-source/menu-data'
import type { OrderGateway } from '../data-source/order-gateway'

export interface MenuContextValue {
  /** 'loading' solo la primera vez: después, una recarga que falla deja la carta anterior. */
  status: 'loading' | 'ready' | 'error'
  menu: MenuData | null
  /** Vuelve a pedir la carta. Devuelve la nueva, o null si no se pudo. */
  reload: () => Promise<MenuData | null>
}

export const MenuContext = createContext<MenuContextValue | null>(null)

export const OrderGatewayContext = createContext<OrderGateway | null>(null)
