import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { addAndOpenCart, fillCheckout } from './test/order-helpers'

// Igual que con VITE_DEMO=true: todo este archivo corre en modo demo.
vi.mock('./config/business', async (importOriginal) => {
  const original = await importOriginal<typeof import('./config/business')>()
  return { ...original, business: { ...original.business, isDemo: true } }
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('modo demo', () => {
  it('no abre WhatsApp: copia el mensaje, lo muestra y avisa que no llega al local', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    render(<App />)
    await addAndOpenCart(user, 'Agregar Suprema')
    const panel = await fillCheckout(user, { name: 'Ana', phone: '912345678', pickup: true, payment: 'Tarjeta' })

    expect(within(panel).getByText('Modo demo: el pedido no llega al local.')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))

    const sent = await screen.findByRole('dialog', { name: 'Pedido listo' })
    expect(openSpy).not.toHaveBeenCalled()
    expect(within(sent).getByText('Modo demo: el pedido no llega al local.')).toBeInTheDocument()
    expect(within(sent).getByRole('status')).toHaveTextContent('Copiamos el mensaje al portapapeles.')

    const copied = await navigator.clipboard.readText()
    expect(copied).toContain('*Retiro en local*\nPago: Tarjeta')
    expect(within(sent).getByText(/Cliente: Ana/).textContent).toBe(copied)

    expect(within(sent).queryByRole('button', { name: 'Abrir WhatsApp otra vez' })).not.toBeInTheDocument()
    await user.click(within(sent).getByRole('button', { name: 'Copiar el mensaje otra vez' }))
    expect(openSpy).not.toHaveBeenCalled()
  })
})
