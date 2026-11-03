import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import App from './App'
import { CART_STORAGE_KEY } from './domain/cart-storage'
import { SENT_ORDER_STORAGE_KEY, SENT_ORDER_TTL_MS } from './domain/sent-order'
import { addAndOpenCart, fillCheckout, headerCartButton, type CheckoutData } from './test/order-helpers'

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

const pickup: CheckoutData = { name: 'Ana', phone: '912345678', pickup: true, payment: 'Efectivo' }

async function sendOrder(user: UserEvent, data = pickup) {
  render(<App />)
  await addAndOpenCart(user, 'Agregar Suprema')
  const panel = await fillCheckout(user, data)
  await user.click(within(panel).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))
  return screen.getByRole('dialog', { name: 'Pedido listo' })
}

/** Lo que pasa al recargar: se desmonta todo y se vuelve a leer localStorage. */
function reload() {
  cleanup()
  render(<App />)
}

describe('pedido ya enviado', () => {
  it('la marca guarda solo la hora y la huella del carrito, sin datos personales', async () => {
    await sendOrder(userEvent.setup(), {
      name: 'Ana Pérez',
      phone: '912345678',
      zone: 'Islita ($2.000)',
      address: 'Los Aromos 123',
      payment: 'Transferencia',
      comment: 'timbre malo',
    })

    expect(JSON.parse(localStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? '{}')).toEqual({
      sentAt: Date.now(),
      cart: 'suprema||*1',
    })
    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key)).join('\n')
    for (const personal of ['Ana', 'Pérez', '1234', 'Aromos', 'timbre', 'Transferencia', 'Islita', 'Cliente']) {
      expect(stored).not.toContain(personal)
    }
  })

  it('"Volver a mi pedido" borra la marca, conserva los productos y permite enviarlo de nuevo', async () => {
    const user = userEvent.setup()
    await sendOrder(user)
    reload()
    await user.click(screen.getByRole('button', { name: 'Volver a mi pedido' }))

    const panel = screen.getByRole('dialog', { name: 'Tu pedido' })
    expect(within(panel).getByText('Suprema')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: 'Tu pedido' })).toHaveFocus()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 1 producto, $13.000')
    expect(localStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toBeNull()

    reload()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(headerCartButton())
    const checkout = await fillCheckout(user, pickup)
    await user.click(within(checkout).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog', { name: 'Pedido listo' })).toBeInTheDocument()
  })

  it('al recargar antes de 2 horas avisa que se abrió WhatsApp, sin el mensaje ni opciones para reenviarlo', async () => {
    const user = userEvent.setup()
    await sendOrder(user)
    vi.setSystemTime(Date.now() + SENT_ORDER_TTL_MS - 1000)
    reload()

    const panel = screen.getByRole('dialog', { name: 'Pedido listo' })
    expect(
      within(panel).getByText(
        'Ya abrimos WhatsApp con tu pedido. Si no alcanzaste a enviarlo, vuelve a tu pedido y envíalo de nuevo.',
      ),
    ).toBeInTheDocument()
    expect(within(panel).queryByText('Tu mensaje')).not.toBeInTheDocument()
    expect(within(panel).queryByText(/Ana/)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Abrir WhatsApp otra vez' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Enviar pedido por WhatsApp' })).not.toBeInTheDocument()
    expect(openSpy).toHaveBeenCalledTimes(1)

    await user.click(within(panel).getByRole('button', { name: 'Empezar un pedido nuevo' }))
    expect(headerCartButton()).toHaveAccessibleName('Pedido 0 productos, $0')
    expect(localStorage.length).toBe(0)
  })

  it('cerrar la confirmación sin recargar conserva el mensaje y "Abrir WhatsApp otra vez"', async () => {
    const user = userEvent.setup()
    await sendOrder(user)
    await user.keyboard('{Escape}')
    await user.click(headerCartButton())

    const panel = screen.getByRole('dialog', { name: 'Pedido listo' })
    expect(within(panel).getByText(/\*Retiro en local\*/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Abrir WhatsApp otra vez' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Volver a mi pedido' })).not.toBeInTheDocument()
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

  it('si al recargar el carrito no calza con la marca, cuenta como pedido nuevo', async () => {
    await sendOrder(userEvent.setup())
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ productId: 'suprema', quantity: 3 }]))
    reload()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 3 productos, $39.000')
    expect(localStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
  })

  it('borra al cargar una marca vieja con datos personales y conserva el carrito', () => {
    const old = { message: 'Cliente: Ana\nTeléfono: +56 9 1234 5678', copied: false, sentAt: Date.now() }
    localStorage.setItem(SENT_ORDER_STORAGE_KEY, JSON.stringify(old))
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ productId: 'suprema', quantity: 2 }]))
    render(<App />)

    expect(localStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
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
