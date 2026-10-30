import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import App from './App'
import { business } from './config/business'
import { addAndOpenCart, fillCheckout, headerCartButton, sentMessage } from './test/order-helpers'

let openSpy: MockInstance<typeof window.open>

beforeEach(() => {
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('panel del pedido', () => {
  it('vacío invita a ver la carta', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(headerCartButton())
    const panel = screen.getByRole('dialog', { name: 'Tu pedido' })
    expect(within(panel).getByText('Tu pedido está vacío.')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Ver la carta' })).toHaveAttribute('href', '#carta')
  })

  it('muestra las líneas, cambia cantidades y calcula el subtotal', async () => {
    const user = userEvent.setup()
    render(<App />)
    const panel = await addAndOpenCart(user, 'Agregar Suprema', 'Agregar Mango (1 litro)')

    expect(within(panel).getByText('$20.000')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Agregar una unidad de Suprema' }))
    expect(within(panel).getByText('$33.000')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Quitar Mango (1 litro) del pedido' }))
    expect(within(panel).queryByText('Mango (1 litro)')).not.toBeInTheDocument()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 2 productos, $26.000')
  })

  it('Esc cierra el panel y el foco vuelve al botón que lo abrió', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(headerCartButton())
    expect(screen.getByRole('dialog', { name: 'Tu pedido' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(headerCartButton()).toHaveFocus()
  })

  it('Tab y Shift+Tab dan la vuelta sin salir del panel', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(headerCartButton())
    const panel = screen.getByRole('dialog', { name: 'Tu pedido' })
    const close = within(panel).getByRole('button', { name: 'Cerrar pedido' })
    const seeMenu = within(panel).getByRole('link', { name: 'Ver la carta' })

    expect(close).toHaveFocus()
    await user.tab()
    expect(seeMenu).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(seeMenu).toHaveFocus()
  })
})

describe('checkout', () => {
  it('al enviar vacío muestra los errores junto a cada campo y enfoca el primero', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addAndOpenCart(user, 'Agregar Suprema')
    const panel = await fillCheckout(user, {})

    await user.click(within(panel).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))

    const name = within(panel).getByLabelText('Nombre')
    await waitFor(() => expect(name).toHaveFocus())
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Ingresa tu nombre, con al menos 2 letras.')
    expect(within(panel).getByLabelText('Celular')).toHaveAccessibleDescription(
      'Ingresa tu celular, por ejemplo 9 1234 5678.',
    )
    expect(within(panel).getByLabelText('Sector')).toHaveAccessibleDescription(
      'Elige tu sector para calcular el despacho.',
    )
    expect(within(panel).getByLabelText('Dirección')).toHaveAccessibleDescription(
      'Ingresa tu dirección con calle y número.',
    )
    expect(within(panel).getByRole('group', { name: '¿Cómo pagas?' })).toHaveAccessibleDescription(
      'Elige cómo vas a pagar.',
    )
    expect(openSpy).not.toHaveBeenCalled()

    // Al corregir, el error desaparece y el foco va al siguiente con error.
    await user.type(name, 'Ana')
    expect(name).not.toHaveAttribute('aria-invalid')
    await user.click(within(panel).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))
    await waitFor(() => expect(within(panel).getByLabelText('Celular')).toHaveFocus())
  })

  it('un pedido válido con despacho abre WhatsApp con el mensaje y muestra la confirmación', async () => {
    const user = userEvent.setup()
    render(<App />)
    const cart = await addAndOpenCart(user, 'Agregar Suprema')
    await user.click(within(cart).getByRole('button', { name: 'Agregar una unidad de Suprema' }))
    const panel = await fillCheckout(user, {
      name: 'Ana Pérez',
      phone: '9 1234 5678',
      zone: 'Islita ($2.000)',
      address: 'Los Aromos 123',
      payment: 'Transferencia',
      comment: 'sin cebolla',
    })

    expect(within(panel).getByText('Total').nextSibling).toHaveTextContent('$28.000')
    await user.click(within(panel).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy.mock.calls[0][0]).toMatch(new RegExp(`^https://wa\\.me/${business.whatsappNumber}\\?text=`))
    expect(openSpy.mock.calls[0][1]).toBe('_blank')
    expect(sentMessage(openSpy)).toBe(
      [
        '*Nuevo pedido — Rápida y Sabrosa*',
        '',
        '• 2 x Suprema — $26.000',
        '',
        'Subtotal: $26.000',
        'Despacho: $2.000',
        '*Total: $28.000*',
        '',
        '*Despacho* a Islita',
        'Dirección: Los Aromos 123',
        'Pago: Transferencia',
        '',
        'Cliente: Ana Pérez',
        'Teléfono: +56 9 1234 5678',
        '',
        'Comentario: sin cebolla',
      ].join('\n'),
    )

    const sent = screen.getByRole('dialog', { name: 'Pedido listo' })
    expect(within(sent).getByText(/Tu mensaje/)).toBeInTheDocument()
    await user.click(within(sent).getByRole('button', { name: 'Abrir WhatsApp otra vez' }))
    expect(openSpy).toHaveBeenCalledTimes(2)

    await user.click(within(sent).getByRole('button', { name: 'Empezar un pedido nuevo' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 0 productos, $0')
    expect(localStorage.length).toBe(0)
  })

  it('un pedido con retiro no pide sector ni dirección ni cobra despacho', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addAndOpenCart(user, 'Agregar Suprema')
    const panel = await fillCheckout(user, { name: 'Ana', phone: '912345678', pickup: true, payment: 'Efectivo' })

    expect(within(panel).queryByLabelText('Sector')).not.toBeInTheDocument()
    expect(within(panel).queryByLabelText('Dirección')).not.toBeInTheDocument()
    expect(within(panel).queryByText('Despacho')).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Enviar pedido por WhatsApp' }))

    const message = sentMessage(openSpy)
    expect(message).toContain('*Total: $13.000*\n\n*Retiro en local*\nPago: Efectivo')
    expect(message).not.toContain('Despacho')
    expect(message).not.toContain('Dirección')
  })
})

describe('Arma tu pizza', () => {
  it('cotiza en vivo y llega al pedido con sus ingredientes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(within(screen.getByRole('region', { name: /rápida y sabrosa/i })).getByRole('button', { name: 'Arma tu pizza' }))
    const modal = screen.getByRole('dialog', { name: 'Arma tu pizza' })

    expect(within(modal).getByText('$10.900')).toBeInTheDocument()
    expect(within(modal).getByText('Te quedan 3 incluidos en la promoción.')).toBeInTheDocument()

    await user.click(within(modal).getByRole('checkbox', { name: /^Tocino/ }))
    expect(within(modal).getByText('$12.400')).toBeInTheDocument()
    await user.click(within(modal).getByRole('checkbox', { name: /^Choclo/ }))
    expect(within(modal).getByText('$13.000')).toBeInTheDocument()
    expect(within(modal).getByText('Promoción (2 ingredientes)')).toBeInTheDocument()
    expect(within(modal).getByText('Te queda 1 incluido en la promoción.')).toBeInTheDocument()

    await user.click(within(modal).getByRole('button', { name: 'Agregar al pedido' }))

    expect(screen.queryByRole('dialog', { name: 'Arma tu pizza' })).not.toBeInTheDocument()
    const panel = screen.getByRole('dialog', { name: 'Tu pedido' })
    expect(within(panel).getByText('Ingredientes: Tocino, Choclo')).toBeInTheDocument()
    expect(headerCartButton()).toHaveAccessibleName('Pedido 1 producto, $13.000')
  })

  it('se abre desde la carta, parte de cero cada vez y devuelve el foco al cerrar', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = screen.getByRole('button', { name: 'Elegir ingredientes' })

    await user.click(opener)
    await user.click(screen.getByRole('checkbox', { name: /^Palta/ }))
    await user.click(screen.getByRole('button', { name: 'Cerrar Arma tu pizza' }))
    expect(opener).toHaveFocus()

    await user.click(opener)
    expect(screen.getByRole('checkbox', { name: /^Palta/ })).not.toBeChecked()
  })
})
