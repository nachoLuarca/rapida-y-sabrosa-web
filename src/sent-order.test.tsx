import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import App from './App'
import { CART_STORAGE_KEY } from './domain/cart'
import { SENT_ORDER_STORAGE_KEY, SENT_ORDER_TTL_MS } from './domain/sent-order'
import { addAndOpenCart, fillCheckout, headerCartButton } from './test/order-helpers'

vi.mock('./data/menu', async (importOriginal) => {
  const { smallMenu } = await import('./test/small-menu')
  return smallMenu(await importOriginal<typeof import('./data/menu')>())
})

let openSpy: MockInstance<typeof window.open>

beforeEach(() => {
  // Solo la fecha: los timers reales los necesita user-event.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-30T20:00:00') })
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function sendOrder(user: UserEvent) {
  render(<App />)
  await addAndOpenCart(user, 'Agregar Suprema')
  const panel = await fillCheckout(user, { name: 'Ana', phone: '912345678', pickup: true, payment: 'Efectivo' })
  await user.click(within(panel).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))
  return screen.getByRole('dialog', { name: 'Pedido listo' })
}

/** Lo que pasa al recargar: se desmonta todo y se vuelve a leer localStorage. */
function reload() {
  cleanup()
  render(<App />)
}

describe('pedido ya enviado', () => {
  it('al recargar antes de 2 horas el panel abre en "Pedido listo" y no ofrece enviar de nuevo', async () => {
    await sendOrder(userEvent.setup())
    vi.setSystemTime(Date.now() + SENT_ORDER_TTL_MS - 1000)
    reload()

    const panel = screen.getByRole('dialog', { name: 'Pedido listo' })
    expect(within(panel).getByText(/\*Retiro en local\*/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Abrir WhatsApp otra vez' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Enviar pedido por WhatsApp' })).not.toBeInTheDocument()
    expect(openSpy).toHaveBeenCalledTimes(1)
  })

  it('cerrar la confirmación y abrir el panel vuelve a "Pedido listo"', async () => {
    const user = userEvent.setup()
    await sendOrder(user)
    await user.keyboard('{Escape}')
    await user.click(headerCartButton())
    expect(screen.getByRole('dialog', { name: 'Pedido listo' })).toBeInTheDocument()
  })

  it('al recargar después de 2 horas vacía el carrito y borra la marca', async () => {
    await sendOrder(userEvent.setup())
    vi.setSystemTime(Date.now() + SENT_ORDER_TTL_MS)
    reload()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 0 productos, $0')
    expect(localStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
  })

  it('cambiar el carrito después de enviar cuenta como pedido nuevo', async () => {
    const user = userEvent.setup()
    await sendOrder(user)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Agregar una unidad de Suprema' }))

    expect(localStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
    await user.click(headerCartButton())
    expect(screen.getByRole('dialog', { name: 'Tu pedido' })).toBeInTheDocument()

    reload()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 2 productos, $26.000')
  })

  it('"Empezar un pedido nuevo" vacía el carrito y borra la marca', async () => {
    const user = userEvent.setup()
    const panel = await sendOrder(user)
    await user.click(within(panel).getByRole('button', { name: 'Empezar un pedido nuevo' }))

    expect(localStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
    reload()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('con localStorage bloqueado se puede enviar y la confirmación dura mientras la página esté abierta', async () => {
    const blocked = () => {
      throw new Error('bloqueado')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)

    const user = userEvent.setup()
    await sendOrder(user)
    expect(openSpy).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    await user.click(headerCartButton())
    expect(screen.getByRole('dialog', { name: 'Pedido listo' })).toBeInTheDocument()

    reload()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['JSON roto', '{roto'],
    ['datos que no son una marca', JSON.stringify({ message: 1, sentAt: 'ayer' })],
  ])('con %s ignora la marca, la borra y conserva el carrito', (_name, raw) => {
    localStorage.setItem(SENT_ORDER_STORAGE_KEY, raw)
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ productId: 'suprema', quantity: 2 }]))
    render(<App />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 2 productos, $26.000')
    expect(localStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
  })
})
