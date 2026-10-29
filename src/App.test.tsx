import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { categories, products } from './data/menu'
import { matchesSearch } from './domain/search'

afterEach(() => {
  localStorage.clear()
})

const cartButton = () => within(screen.getByRole('banner')).getByRole('button', { name: /pedido/i })

describe('App', () => {
  it('muestra el titular y la carta completa', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /rápida y sabrosa/i })).toBeInTheDocument()

    const menu = screen.getByRole('region', { name: 'La carta' })
    const categoryTitles = within(menu).getAllByRole('heading', { level: 3 })
    expect(categoryTitles.map((title) => title.textContent)).toEqual(categories.map((category) => category.name))
    expect(within(menu).getAllByRole('heading', { level: 4 })).toHaveLength(products.length)
    expect(within(menu).getByRole('button', { name: 'Elegir ingredientes' })).toBeInTheDocument()
  })

  it('al agregar un producto se actualiza el pedido del header', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(cartButton()).toHaveAccessibleName('Pedido 0 productos, $0')

    await user.click(screen.getByRole('button', { name: 'Agregar Suprema' }))
    expect(cartButton()).toHaveAccessibleName('Pedido 1 producto, $13.000')

    // El botón pasa a ser el control − cantidad +.
    await user.click(screen.getByRole('button', { name: 'Agregar una unidad de Suprema' }))
    await user.click(screen.getByRole('button', { name: 'Agregar Mango (1 litro)' }))
    expect(cartButton()).toHaveAccessibleName('Pedido 3 productos, $33.000')

    await user.click(screen.getByRole('button', { name: 'Quitar una unidad de Suprema' }))
    await user.click(screen.getByRole('button', { name: 'Quitar Suprema del pedido' }))
    expect(screen.getByRole('button', { name: 'Agregar Suprema' })).toBeInTheDocument()
    expect(cartButton()).toHaveAccessibleName('Pedido 1 producto, $7.000')
  })

  it('el buscador filtra sin distinguir tildes ni mayúsculas', async () => {
    const user = userEvent.setup()
    render(<App />)
    const expected = products.filter((product) => matchesSearch('champiñón', product.name, product.description))

    await user.type(screen.getByRole('searchbox', { name: 'Buscar en la carta' }), 'CHAMPINON')

    const menu = screen.getByRole('region', { name: 'La carta' })
    expect(within(menu).getByRole('status')).toHaveTextContent(`${expected.length} resultados para “CHAMPINON”`)
    expect(within(menu).getByRole('heading', { level: 4, name: 'Mechada champiñón' })).toBeInTheDocument()
    expect(within(menu).queryByRole('heading', { level: 4, name: 'Suprema' })).not.toBeInTheDocument()
    expect(within(menu).getAllByRole('heading', { level: 4 })).toHaveLength(expected.length)
  })

  it('sin resultados lo dice y permite volver a la carta completa', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('searchbox', { name: 'Buscar en la carta' }), 'sushi')

    expect(screen.getByRole('status')).toHaveTextContent('No encontramos nada con “sushi”.')
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Ver toda la carta' }))
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(products.length)
  })

  it('muestra las zonas de despacho agrupadas por costo', () => {
    render(<App />)
    const delivery = screen.getByRole('region', { name: 'Despacho' })
    expect(within(delivery).getByText('$2.000')).toBeInTheDocument()
    expect(within(delivery).getByText(/Isla Centro, Islita/)).toBeInTheDocument()
    expect(within(delivery).getByText('Efectivo, Transferencia o Tarjeta. Pagas al recibir o al retirar.')).toBeInTheDocument()
  })
})
