import { useContext } from 'react'
import type { OrderGateway } from '../data-source/order-gateway'
import { MenuContext, OrderGatewayContext, type MenuContextValue } from './menu-context'

export function useMenu(): MenuContextValue {
  const menu = useContext(MenuContext)
  if (!menu) throw new Error('useMenu debe usarse dentro de <MenuProvider>')
  return menu
}

export function useOrderGateway(): OrderGateway {
  const gateway = useContext(OrderGatewayContext)
  if (!gateway) throw new Error('useOrderGateway debe usarse dentro de <MenuProvider>')
  return gateway
}
