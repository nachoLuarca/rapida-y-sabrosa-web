import { render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { categories, products } from './data/menu'
import { matchesSearch } from './domain/search'

afterEach(() => {
  localStorage.clear()
})

/** Pega el texto de una vez: con la carta completa, cada tecla vuelve a dibujar los 87 productos. */
async function search(user: UserEvent, text: string) {
  await user.click(screen.getByRole('searchbox', { name: 'Buscar en la carta' }))
  await user.paste(text)
}

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

  it('el buscador filtra sin distinguir tildes ni mayúsculas', async () => {
    const user = userEvent.setup()
    render(<App />)
    const expected = products.filter((product) => matchesSearch('champiñón', product.name, product.description))

    await search(user, 'CHAMPINON')

    const menu = screen.getByRole('region', { name: 'La carta' })
    expect(within(menu).getByRole('status')).toHaveTextContent(`${expected.length} resultados para “CHAMPINON”`)
    expect(within(menu).getByRole('heading', { level: 4, name: 'Mechada champiñón' })).toBeInTheDocument()
    expect(within(menu).queryByRole('heading', { level: 4, name: 'Suprema' })).not.toBeInTheDocument()
    expect(within(menu).getAllByRole('heading', { level: 4 })).toHaveLength(expected.length)
  })

  it('el buscador también busca en el nombre de la categoría', async () => {
    const user = userEvent.setup()
    render(<App />)
    const menu = screen.getByRole('region', { name: 'La carta' })
    const juices = products.filter((product) => product.categoryId === 'jugos').map((product) => product.name)

    await search(user, 'jugo')
    expect(within(menu).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(juices)
    expect(within(menu).getByRole('status')).toHaveTextContent(`${juices.length} resultados para “jugo”`)

    await search(user, ' mango')
    expect(within(menu).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Mango'])
    expect(within(menu).getByRole('status')).toHaveTextContent('1 resultado para “jugo mango”')
  })

  it('sin resultados lo dice y permite volver a la carta completa', async () => {
    const user = userEvent.setup()
    render(<App />)
    await search(user, 'sushi')

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
