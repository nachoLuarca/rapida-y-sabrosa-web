import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Botón del pedido en el header. */
export const headerCartButton = () => within(screen.getByRole('banner')).getByRole('button', { name: /pedido/i })

/** Agrega productos desde la carta y abre el panel del pedido. */
export async function addAndOpenCart(user: UserEvent, ...buttonNames: string[]) {
  for (const name of buttonNames) await user.click(screen.getByRole('button', { name }))
  await user.click(headerCartButton())
  return screen.getByRole('dialog', { name: 'Tu pedido' })
}

export interface CheckoutData {
  name?: string
  phone?: string
  pickup?: boolean
  zone?: string
  address?: string
  payment?: string
  comment?: string
}

/** Pasa a "Tus datos" y completa el formulario. */
export async function fillCheckout(user: UserEvent, data: CheckoutData) {
  await user.click(screen.getByRole('button', { name: 'Continuar con mis datos' }))
  const panel = screen.getByRole('dialog', { name: 'Tus datos' })
  const field = (label: RegExp | string) => within(panel).getByLabelText(label)

  if (data.name) await user.type(field('Nombre'), data.name)
  if (data.phone) await user.type(field('Celular'), data.phone)
  if (data.pickup) await user.click(within(panel).getByRole('radio', { name: 'Retiro en el local' }))
  if (data.zone) await user.selectOptions(field('Sector'), data.zone)
  if (data.address) await user.type(field('Dirección'), data.address)
  if (data.payment) await user.click(within(panel).getByRole('radio', { name: data.payment }))
  if (data.comment) await user.type(field(/Comentario/), data.comment)
  return panel
}

/** Texto del mensaje que recibió window.open (decodificado desde el enlace de wa.me). */
export function sentMessage(openMock: { mock: { calls: unknown[][] } }): string {
  const url = new URL(String(openMock.mock.calls[0][0]))
  return url.searchParams.get('text') ?? ''
}
