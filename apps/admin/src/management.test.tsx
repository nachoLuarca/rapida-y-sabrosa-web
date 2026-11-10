import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/admin-api'
import App from './App'
import { ADMIN, CAJA, createFakeApi, createServices } from './test/fakes'

afterEach(() => {
  localStorage.clear()
})

type Fake = ReturnType<typeof createFakeApi>

/** Abre una página del panel con sesión iniciada y espera su título. */
async function openPage(path: string, heading: string, fake: Fake) {
  window.history.replaceState(null, '', path)
  render(<App services={createServices(fake)} />)
  await screen.findByRole('heading', { level: 1, name: heading })
  // Los ajustes se cargan después de pintar el título: se espera la primera sección.
  if (path === '/ajustes') await screen.findByRole('heading', { level: 2, name: 'Pedidos por la web' })
}

const asAdmin = (options: Parameters<typeof createFakeApi>[0] = {}) => createFakeApi({ user: ADMIN, ...options })
const asStaff = (options: Parameters<typeof createFakeApi>[0] = {}) => createFakeApi({ user: CAJA, ...options })

/** La fila (li) de un producto, ingrediente o zona, por el nombre accesible de su interruptor. */
const rowOf = (switchName: string) => screen.getByRole('switch', { name: switchName }).closest('li') as HTMLElement
const expectTitle = (title: string) => vi.waitFor(() => expect(document.title).toBe(title))

describe('menú del panel', () => {
  it('caja ve Pedidos, Carta, Ingredientes y Ajustes; administración además ve Zonas', async () => {
    const links = () =>
      within(screen.getByRole('navigation', { name: 'Secciones del panel' }))
        .getAllByRole('link')
        .map((link) => link.textContent)

    await openPage('/carta', 'Carta', asStaff())
    expect(links()).toEqual(['Pedidos', 'Carta', 'Ingredientes', 'Ajustes'])
    expect(screen.getByRole('link', { name: 'Carta' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Pedidos' })).not.toHaveAttribute('aria-current')
  })

  it('se navega entre secciones sin recargar y cada una pone su título', async () => {
    const user = userEvent.setup()
    await openPage('/carta', 'Carta', asAdmin())
    await expectTitle('Carta | Panel de Rápida y Sabrosa')

    const nav = within(screen.getByRole('navigation', { name: 'Secciones del panel' }))
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['Pedidos', 'Carta', 'Ingredientes', 'Zonas', 'Ajustes'])

    await user.click(nav.getByRole('link', { name: 'Zonas' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Zonas de despacho' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/zonas')
    await expectTitle('Zonas | Panel de Rápida y Sabrosa')

    await user.click(nav.getByRole('link', { name: 'Ajustes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument()
    await user.click(nav.getByRole('link', { name: 'Ingredientes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingredientes' })).toBeInTheDocument()
  })
})

describe('/carta', () => {
  it('lista los productos por categoría con su precio y si están disponibles', async () => {
    await openPage('/carta', 'Carta', asStaff())
    const pizzas = await screen.findByRole('region', { name: 'Pizzas' })
    expect(within(pizzas).getByRole('switch', { name: 'Suprema disponible' })).toBeChecked()
    expect(within(pizzas).getByRole('switch', { name: 'California disponible' })).not.toBeChecked()
    expect(within(rowOf('Suprema disponible')).getByText('$13.000')).toBeInTheDocument()
    expect(within(rowOf('California disponible')).getByText('Agotado')).toBeInTheDocument()
    expect(within(rowOf('Mango disponible')).getByText('500 cc $3.500 · 1 L $5.000')).toBeInTheDocument()
    // Arma tu pizza también se puede agotar.
    const build = screen.getByRole('region', { name: 'Arma tu pizza' })
    expect(within(build).getByRole('switch', { name: 'Arma tu pizza disponible' })).toBeChecked()
  })

  it('caja solo ve los interruptores: marca un producto como agotado y lo vuelve a dejar disponible', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/carta', 'Carta', fake)
    const toggle = await screen.findByRole('switch', { name: 'Suprema disponible' })
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()

    await user.click(toggle)
    await vi.waitFor(() => expect(toggle).not.toBeChecked())
    expect(fake.api.updateProduct).toHaveBeenCalledWith('suprema', { available: false })
    expect(within(rowOf('Suprema disponible')).getByText('Agotado')).toBeInTheDocument()

    await user.click(toggle)
    await vi.waitFor(() => expect(toggle).toBeChecked())
    expect(fake.api.updateProduct).toHaveBeenLastCalledWith('suprema', { available: true })
  })

  it('el interruptor se maneja con el teclado', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/carta', 'Carta', fake)
    const toggle = await screen.findByRole('switch', { name: 'Arma tu pizza disponible' })
    toggle.focus()
    await user.keyboard(' ')
    await vi.waitFor(() => expect(toggle).not.toBeChecked())
    expect(fake.menu().buildPizza.available).toBe(false)
  })

  it('si el cambio falla, lo avisa en la fila y el interruptor queda como estaba', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/carta', 'Carta', fake)
    const toggle = await screen.findByRole('switch', { name: 'Suprema disponible' })
    fake.failNext(new ApiError('NETWORK', 'No pudimos conectar con el servidor.', 0))
    await user.click(toggle)
    expect(await within(rowOf('Suprema disponible')).findByText('No pudimos conectar con el servidor.')).toBeInTheDocument()
    expect(toggle).toBeChecked()
    expect(toggle).toBeEnabled()
  })

  it('administración edita en línea: nada cambia hasta Guardar, y solo se manda lo que cambió', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Suprema' }))

    const form = screen.getByRole('form', { name: 'Editar Suprema' })
    const name = within(form).getByLabelText('Nombre')
    expect(name).toHaveFocus()
    expect(name).toHaveValue('Suprema')
    expect(within(form).getByLabelText('Descripción')).toHaveValue('Carne mechada y queso.')
    const price = within(form).getByLabelText('Precio')
    expect(price).toHaveValue('13000')

    await user.clear(price)
    await user.type(price, '13.500')
    // Todavía no se guardó nada.
    expect(fake.api.updateProduct).not.toHaveBeenCalled()
    expect(within(rowOf('Suprema disponible')).getByText('$13.000')).toBeInTheDocument()

    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(await within(rowOf('Suprema disponible')).findByText('$13.500')).toBeInTheDocument()
    expect(fake.api.updateProduct).toHaveBeenCalledExactlyOnceWith('suprema', { price: 13500 })
    expect(within(rowOf('Suprema disponible')).getByRole('status')).toHaveTextContent('Guardado.')
    expect(screen.queryByRole('form', { name: 'Editar Suprema' })).not.toBeInTheDocument()
    // El foco vuelve al botón de la fila.
    expect(screen.getByRole('button', { name: 'Editar Suprema' })).toHaveFocus()
  })

  it('cambia nombre y descripción; una descripción vacía se guarda como "sin descripción"', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Suprema' }))
    const form = screen.getByRole('form', { name: 'Editar Suprema' })
    await user.clear(within(form).getByLabelText('Nombre'))
    await user.type(within(form).getByLabelText('Nombre'), 'Suprema XL')
    await user.clear(within(form).getByLabelText('Descripción'))
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('switch', { name: 'Suprema XL disponible' })).toBeInTheDocument()
    expect(fake.api.updateProduct).toHaveBeenCalledExactlyOnceWith('suprema', { name: 'Suprema XL', description: null })
  })

  it('Cancelar descarta lo escrito, y guardar sin cambios no llama a la API', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Suprema' }))
    let form = screen.getByRole('form', { name: 'Editar Suprema' })
    await user.clear(within(form).getByLabelText('Precio'))
    await user.type(within(form).getByLabelText('Precio'), '99')
    await user.click(within(form).getByRole('button', { name: 'Cancelar' }))
    expect(within(rowOf('Suprema disponible')).getByText('$13.000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Editar Suprema' }))
    form = screen.getByRole('form', { name: 'Editar Suprema' })
    expect(within(form).getByLabelText('Precio')).toHaveValue('13000')
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(screen.queryByRole('form', { name: 'Editar Suprema' })).not.toBeInTheDocument()
    expect(fake.api.updateProduct).not.toHaveBeenCalled()
  })

  it.each(['', 'mil', '12,5', '1000001'])('con el precio "%s" muestra el error junto al campo y no guarda', async (value) => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Suprema' }))
    const form = screen.getByRole('form', { name: 'Editar Suprema' })
    const price = within(form).getByLabelText('Precio')
    await user.clear(price)
    if (value) await user.type(price, value)
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))

    expect(price).toBeInvalid()
    expect(price).toHaveAccessibleDescription('Ingresa un precio entre $0 y $1.000.000, sin decimales.')
    expect(fake.api.updateProduct).not.toHaveBeenCalled()
  })

  it('exige un nombre', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Suprema' }))
    const form = screen.getByRole('form', { name: 'Editar Suprema' })
    await user.clear(within(form).getByLabelText('Nombre'))
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(within(form).getByLabelText('Nombre')).toHaveAccessibleDescription('Ingresa un nombre.')
    expect(fake.api.updateProduct).not.toHaveBeenCalled()
  })

  it('un producto con variantes edita el nombre y el precio de cada variante', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Mango' }))
    const form = screen.getByRole('form', { name: 'Editar Mango' })
    // El precio está en las variantes, no en el producto.
    expect(within(form).queryByLabelText('Precio')).not.toBeInTheDocument()
    expect(within(form).getByLabelText('Nombre de la variante 1')).toHaveValue('500 cc')

    const second = within(form).getByLabelText('Precio de la variante 2')
    await user.clear(second)
    await user.type(second, '5500')
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))

    expect(await within(rowOf('Mango disponible')).findByText('500 cc $3.500 · 1 L $5.500')).toBeInTheDocument()
    expect(fake.api.updateVariant).toHaveBeenCalledExactlyOnceWith('jugo-mango-1l', { price: 5500 })
    expect(fake.api.updateProduct).not.toHaveBeenCalled()
  })

  it('el error de una variante se muestra en esa variante', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Mango' }))
    const form = screen.getByRole('form', { name: 'Editar Mango' })
    const label = within(form).getByLabelText('Nombre de la variante 2')
    await user.clear(label)
    await user.type(label, 'Litro')
    fake.failNext(new ApiError('VALIDATION_ERROR', 'Revisa los datos.', 400, { label: 'Ese nombre no sirve.' }))
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    await vi.waitFor(() => expect(label).toHaveAccessibleDescription('Ese nombre no sirve.'))
    expect(within(form).getByLabelText('Nombre de la variante 1')).toBeValid()
  })

  it('Arma tu pizza no edita su precio aquí: remite a Ajustes', async () => {
    const user = userEvent.setup()
    await openPage('/carta', 'Carta', asAdmin())
    await user.click(await screen.findByRole('button', { name: 'Editar Arma tu pizza' }))
    const form = screen.getByRole('form', { name: 'Editar Arma tu pizza' })
    expect(within(form).queryByLabelText('Precio')).not.toBeInTheDocument()
    expect(within(form).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes')
  })

  it('un error de validación de la API se muestra junto a su campo', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/carta', 'Carta', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Suprema' }))
    const form = screen.getByRole('form', { name: 'Editar Suprema' })
    const name = within(form).getByLabelText('Nombre')
    await user.type(name, ' 2')
    fake.failNext(new ApiError('VALIDATION_ERROR', 'Revisa los datos.', 400, { name: 'Puede tener hasta 80 caracteres.' }))
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    await vi.waitFor(() => expect(name).toHaveAccessibleDescription('Puede tener hasta 80 caracteres.'))
    // El formulario sigue abierto con lo escrito.
    expect(name).toHaveValue('Suprema 2')
    expect(within(form).getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('si la carta no carga, lo dice y deja reintentar', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    fake.failNext(new ApiError('NETWORK', 'No pudimos conectar con el servidor.', 0))
    await openPage('/carta', 'Carta', fake)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos conectar con el servidor.')
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('switch', { name: 'Suprema disponible' })).toBeInTheDocument()
  })

  it('si la sesión venció al guardar, vuelve al login', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/carta', 'Carta', fake)
    const toggle = await screen.findByRole('switch', { name: 'Suprema disponible' })
    fake.expireSession()
    await user.click(toggle)
    expect(await screen.findByRole('heading', { name: 'Panel del local' })).toBeInTheDocument()
  })
})

describe('/ingredientes', () => {
  it('caja marca un ingrediente como agotado y no puede editarlo', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/ingredientes', 'Ingredientes', fake)
    const tocino = await screen.findByRole('switch', { name: 'Tocino disponible' })
    expect(tocino).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Choclo disponible' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()

    await user.click(tocino)
    await vi.waitFor(() => expect(tocino).not.toBeChecked())
    expect(fake.api.updateIngredient).toHaveBeenCalledExactlyOnceWith('tocino', { available: false })
  })

  it('administración cambia el nombre y el precio con guardado explícito', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ingredientes', 'Ingredientes', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Tocino' }))
    const form = screen.getByRole('form', { name: 'Editar Tocino' })
    await user.clear(within(form).getByLabelText('Nombre'))
    await user.type(within(form).getByLabelText('Nombre'), 'Tocino ahumado')
    await user.clear(within(form).getByLabelText('Precio'))
    await user.type(within(form).getByLabelText('Precio'), '$1.800')
    expect(fake.api.updateIngredient).not.toHaveBeenCalled()
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))

    const row = (await screen.findByRole('switch', { name: 'Tocino ahumado disponible' })).closest('li') as HTMLElement
    expect(within(row).getByText('$1.800')).toBeInTheDocument()
    expect(fake.api.updateIngredient).toHaveBeenCalledExactlyOnceWith('tocino', { name: 'Tocino ahumado', price: 1800 })
    expect(screen.getByRole('button', { name: 'Editar Tocino ahumado' })).toHaveFocus()
  })

  it('valida el precio antes de guardar', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ingredientes', 'Ingredientes', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Tocino' }))
    const form = screen.getByRole('form', { name: 'Editar Tocino' })
    const price = within(form).getByLabelText('Precio')
    await user.clear(price)
    await user.type(price, '-5')
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(price).toHaveAccessibleDescription('Ingresa un precio entre $0 y $1.000.000, sin decimales.')
    expect(fake.api.updateIngredient).not.toHaveBeenCalled()
  })
})

describe('/zonas', () => {
  it('caja no tiene esta sección: no pide las zonas', async () => {
    const fake = asStaff()
    await openPage('/zonas', 'Zonas de despacho', fake)
    expect(screen.getByText('Esta sección es solo para administración.')).toBeInTheDocument()
    expect(fake.api.listZones).not.toHaveBeenCalled()
  })

  it('administración ve todas las zonas, también las desactivadas, y las activa o desactiva', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/zonas', 'Zonas de despacho', fake)
    const paimsa = await screen.findByRole('switch', { name: 'Paimsa activa' })
    expect(paimsa).not.toBeChecked()
    expect(within(rowOf('Paimsa activa')).getByText('Desactivada')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Islita activa' })).toBeChecked()

    await user.click(screen.getByRole('switch', { name: 'Islita activa' }))
    await vi.waitFor(() => expect(screen.getByRole('switch', { name: 'Islita activa' })).not.toBeChecked())
    expect(fake.api.updateZone).toHaveBeenCalledExactlyOnceWith('islita', { active: false })
    // No hay forma de borrar una zona.
    expect(screen.queryByRole('button', { name: /Borrar|Eliminar/ })).not.toBeInTheDocument()
  })

  it('edita el nombre y el costo de una zona', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/zonas', 'Zonas de despacho', fake)
    await user.click(await screen.findByRole('button', { name: 'Editar Islita' }))
    const form = screen.getByRole('form', { name: 'Editar Islita' })
    const fee = within(form).getByLabelText('Costo de despacho')
    await user.clear(fee)
    await user.type(fee, '2500')
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(await within(rowOf('Islita activa')).findByText('$2.500')).toBeInTheDocument()
    expect(fake.api.updateZone).toHaveBeenCalledExactlyOnceWith('islita', { fee: 2500 })
  })

  it('agrega una zona, validando antes el nombre y el costo', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/zonas', 'Zonas de despacho', fake)
    const form = (await screen.findByRole('region', { name: 'Agregar zona' })) as HTMLElement
    const name = within(form).getByLabelText('Nombre de la zona')
    const fee = within(form).getByLabelText('Costo de despacho')

    await user.click(within(form).getByRole('button', { name: 'Agregar zona' }))
    expect(name).toHaveAccessibleDescription('Ingresa un nombre.')
    expect(fee).toHaveAccessibleDescription('Ingresa un precio entre $0 y $1.000.000, sin decimales.')
    expect(fake.api.createZone).not.toHaveBeenCalled()

    await user.type(name, 'Naltahua')
    await user.type(fee, '3.000')
    await user.click(within(form).getByRole('button', { name: 'Agregar zona' }))
    expect(await screen.findByRole('switch', { name: 'Naltahua activa' })).toBeChecked()
    expect(fake.api.createZone).toHaveBeenCalledExactlyOnceWith({ name: 'Naltahua', fee: 3000 })
    expect(within(form).getByRole('status')).toHaveTextContent('Zona Naltahua agregada.')
    expect(name).toHaveValue('')
    expect(fee).toHaveValue('')
  })

  it('si ya existe una zona con ese nombre, lo dice junto al campo', async () => {
    const user = userEvent.setup()
    await openPage('/zonas', 'Zonas de despacho', asAdmin())
    const form = (await screen.findByRole('region', { name: 'Agregar zona' })) as HTMLElement
    const name = within(form).getByLabelText('Nombre de la zona')
    await user.type(name, 'islita')
    await user.type(within(form).getByLabelText('Costo de despacho'), '2000')
    await user.click(within(form).getByRole('button', { name: 'Agregar zona' }))
    await vi.waitFor(() => expect(name).toHaveAccessibleDescription('Ya existe una zona con ese nombre.'))
    expect(name).toHaveValue('islita')
  })
})

describe('/ajustes: pausa de pedidos', () => {
  it('caja solo ve la pausa', async () => {
    await openPage('/ajustes', 'Ajustes', asStaff())
    expect(await screen.findByRole('heading', { level: 2, name: 'Pedidos por la web' })).toBeInTheDocument()
    expect(screen.getByText('Recibiendo pedidos.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Horario' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Datos del local' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Arma tu pizza' })).not.toBeInTheDocument()
  })

  it('pausar pide confirmación: "No pausar" no cambia nada y "Sí, pausar" pausa', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/ajustes', 'Ajustes', fake)
    const pause = await screen.findByRole('button', { name: 'Pausar pedidos' })

    await user.click(pause)
    let dialog = screen.getByRole('dialog', { name: '¿Pausar los pedidos?' })
    // El foco parte en la opción que no cambia nada.
    expect(within(dialog).getByRole('button', { name: 'No pausar' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'No pausar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fake.api.updateSettings).not.toHaveBeenCalled()

    await user.click(pause)
    dialog = screen.getByRole('dialog', { name: '¿Pausar los pedidos?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sí, pausar' }))
    expect(await screen.findByText('Los pedidos están pausados.')).toBeInTheDocument()
    expect(fake.api.updateSettings).toHaveBeenCalledExactlyOnceWith({ ordersPaused: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fake.settings().ordersPaused).toBe(true)
  })

  it('Esc cierra la confirmación sin pausar', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/ajustes', 'Ajustes', fake)
    await user.click(await screen.findByRole('button', { name: 'Pausar pedidos' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fake.api.updateSettings).not.toHaveBeenCalled()
  })

  it('reanudar no pide confirmación', async () => {
    const user = userEvent.setup()
    const fake = asStaff({ settings: { ordersPaused: true } })
    await openPage('/ajustes', 'Ajustes', fake)
    expect(await screen.findByText('Los pedidos están pausados.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reanudar pedidos' }))
    expect(await screen.findByText('Recibiendo pedidos.')).toBeInTheDocument()
    expect(fake.api.updateSettings).toHaveBeenCalledExactlyOnceWith({ ordersPaused: false })
    expect(screen.getByRole('button', { name: 'Pausar pedidos' })).toBeInTheDocument()
  })

  it('si no se pudo pausar, lo avisa y sigue recibiendo pedidos', async () => {
    const user = userEvent.setup()
    const fake = asStaff()
    await openPage('/ajustes', 'Ajustes', fake)
    await user.click(await screen.findByRole('button', { name: 'Pausar pedidos' }))
    fake.failNext(new ApiError('NETWORK', 'No pudimos conectar con el servidor.', 0))
    await user.click(screen.getByRole('button', { name: 'Sí, pausar' }))
    expect(await screen.findByText('No pudimos conectar con el servidor.')).toBeInTheDocument()
    expect(screen.getByText('Recibiendo pedidos.')).toBeInTheDocument()
  })
})

describe('/ajustes: horario', () => {
  const hours = () => screen.getByRole('region', { name: 'Horario' })
  const setTime = (label: string, value: string) => fireEvent.change(within(hours()).getByLabelText(label), { target: { value } })

  it('sin horario definido lo explica; al definirlo, cada día parte cerrado', async () => {
    const user = userEvent.setup()
    await openPage('/ajustes', 'Ajustes', asAdmin())
    const defined = await within(hours()).findByRole('checkbox', { name: 'El local tiene un horario definido' })
    expect(defined).not.toBeChecked()
    expect(within(hours()).getByText(/la web recibe pedidos a toda hora/)).toBeInTheDocument()

    await user.click(defined)
    const groups = within(hours()).getAllByRole('group')
    expect(groups.map((group) => within(group).getByText(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)$/).textContent)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ])
    expect(within(hours()).getAllByText('Cerrado')).toHaveLength(7)
  })

  it('guarda un horario por día con varios rangos', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ajustes', 'Ajustes', fake)
    await user.click(await within(hours()).findByRole('checkbox', { name: 'El local tiene un horario definido' }))

    await user.click(within(hours()).getByRole('button', { name: 'Agregar rango al martes' }))
    setTime('Martes, rango 1: abre', '12:00')
    setTime('Martes, rango 1: cierra', '15:30')
    await user.click(within(hours()).getByRole('button', { name: 'Agregar rango al martes' }))
    setTime('Martes, rango 2: abre', '19:00')
    setTime('Martes, rango 2: cierra', '01:00')
    await user.click(within(hours()).getByRole('button', { name: 'Agregar rango al sábado' }))
    setTime('Sábado, rango 1: abre', '13:00')
    setTime('Sábado, rango 1: cierra', '23:30')

    expect(fake.api.updateSettings).not.toHaveBeenCalled()
    await user.click(within(hours()).getByRole('button', { name: 'Guardar horario' }))
    expect(await within(hours()).findByText('Guardado.')).toBeInTheDocument()
    expect(fake.api.updateSettings).toHaveBeenCalledExactlyOnceWith({
      openingHours: {
        mon: [],
        tue: [
          ['12:00', '15:30'],
          ['19:00', '01:00'],
        ],
        wed: [],
        thu: [],
        fri: [],
        sat: [['13:00', '23:30']],
        sun: [],
      },
    })
  })

  it('muestra el horario guardado y deja quitar un rango', async () => {
    const user = userEvent.setup()
    const openingHours = { mon: [], tue: [['12:00', '15:30'], ['19:00', '23:30']], wed: [], thu: [], fri: [], sat: [], sun: [] }
    const fake = asAdmin({ settings: { openingHours } as never })
    await openPage('/ajustes', 'Ajustes', fake)
    expect(await within(hours()).findByRole('checkbox', { name: 'El local tiene un horario definido' })).toBeChecked()
    expect(within(hours()).getByLabelText('Martes, rango 2: abre')).toHaveValue('19:00')

    await user.click(within(hours()).getByRole('button', { name: 'Quitar el rango 1 del martes' }))
    expect(within(hours()).getByLabelText('Martes, rango 1: abre')).toHaveValue('19:00')
    expect(within(hours()).queryByLabelText('Martes, rango 2: abre')).not.toBeInTheDocument()

    await user.click(within(hours()).getByRole('button', { name: 'Guardar horario' }))
    await vi.waitFor(() =>
      expect(fake.api.updateSettings).toHaveBeenCalledExactlyOnceWith({ openingHours: { ...openingHours, tue: [['19:00', '23:30']] } }),
    )
  })

  it('un rango a medio llenar no se guarda y se marca en su día', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ajustes', 'Ajustes', fake)
    await user.click(await within(hours()).findByRole('checkbox', { name: 'El local tiene un horario definido' }))
    await user.click(within(hours()).getByRole('button', { name: 'Agregar rango al martes' }))
    setTime('Martes, rango 1: abre', '19:00')
    await user.click(within(hours()).getByRole('button', { name: 'Guardar horario' }))

    const tuesday = within(hours()).getByRole('group', { name: 'Martes' })
    expect(tuesday).toHaveAccessibleDescription('Completa la hora de apertura y la de cierre de cada rango.')
    expect(within(hours()).getByLabelText('Martes, rango 1: cierra')).toBeInvalid()
    expect(fake.api.updateSettings).not.toHaveBeenCalled()
  })

  it('un horario definido sin ningún rango no se guarda', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ajustes', 'Ajustes', fake)
    await user.click(await within(hours()).findByRole('checkbox', { name: 'El local tiene un horario definido' }))
    await user.click(within(hours()).getByRole('button', { name: 'Guardar horario' }))
    expect(within(hours()).getByRole('alert')).toHaveTextContent('Agrega al menos un rango en algún día')
    expect(fake.api.updateSettings).not.toHaveBeenCalled()
  })

  it('al desmarcar el horario definido se guarda "sin horario"', async () => {
    const user = userEvent.setup()
    const openingHours = { mon: [], tue: [['19:00', '23:30']], wed: [], thu: [], fri: [], sat: [], sun: [] }
    const fake = asAdmin({ settings: { openingHours } as never })
    await openPage('/ajustes', 'Ajustes', fake)
    await user.click(await within(hours()).findByRole('checkbox', { name: 'El local tiene un horario definido' }))
    await user.click(within(hours()).getByRole('button', { name: 'Guardar horario' }))
    await vi.waitFor(() => expect(fake.api.updateSettings).toHaveBeenCalledExactlyOnceWith({ openingHours: null }))
    expect(fake.settings().openingHours).toBeNull()
  })

  it('no deja agregar más de seis rangos en un día', async () => {
    const user = userEvent.setup()
    await openPage('/ajustes', 'Ajustes', asAdmin())
    await user.click(await within(hours()).findByRole('checkbox', { name: 'El local tiene un horario definido' }))
    for (let i = 0; i < 6; i += 1) await user.click(within(hours()).getByRole('button', { name: 'Agregar rango al lunes' }))
    expect(within(hours()).queryByRole('button', { name: 'Agregar rango al lunes' })).not.toBeInTheDocument()
    expect(within(hours()).getByLabelText('Lunes, rango 6: abre')).toBeInTheDocument()
  })
})

describe('/ajustes: datos del local y Arma tu pizza', () => {
  const business = () => screen.getByRole('region', { name: 'Datos del local' })
  const buildPizza = () => screen.getByRole('region', { name: 'Arma tu pizza' })

  it('muestra el número con formato y la dirección vacía si no está confirmada', async () => {
    await openPage('/ajustes', 'Ajustes', asAdmin())
    expect(await within(business()).findByLabelText('Dirección de retiro')).toHaveValue('')
    expect(within(business()).getByLabelText('Número de WhatsApp que recibe los pedidos')).toHaveValue('+56 9 7431 4602')
  })

  it('guarda la dirección y el número normalizado, solo lo que cambió', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ajustes', 'Ajustes', fake)
    await user.type(await within(business()).findByLabelText('Dirección de retiro'), 'Balmaceda 308')
    await user.click(within(business()).getByRole('button', { name: 'Guardar datos del local' }))
    expect(await within(business()).findByText('Guardado.')).toBeInTheDocument()
    expect(fake.api.updateSettings).toHaveBeenLastCalledWith({ pickupAddress: 'Balmaceda 308' })

    const whatsapp = within(business()).getByLabelText('Número de WhatsApp que recibe los pedidos')
    await user.clear(whatsapp)
    await user.type(whatsapp, '9 1234 5678')
    await user.click(within(business()).getByRole('button', { name: 'Guardar datos del local' }))
    await vi.waitFor(() => expect(fake.api.updateSettings).toHaveBeenLastCalledWith({ whatsappNumber: '56912345678' }))
    expect(fake.settings()).toMatchObject({ pickupAddress: 'Balmaceda 308', whatsappNumber: '56912345678' })
  })

  it('un número que no es un celular chileno no se guarda', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ajustes', 'Ajustes', fake)
    const whatsapp = await within(business()).findByLabelText('Número de WhatsApp que recibe los pedidos')
    await user.clear(whatsapp)
    await user.type(whatsapp, '22334455')
    await user.click(within(business()).getByRole('button', { name: 'Guardar datos del local' }))
    expect(whatsapp).toBeInvalid()
    expect(whatsapp).toHaveAccessibleDescription(/Ingresa un celular chileno de 9 dígitos/)
    expect(fake.api.updateSettings).not.toHaveBeenCalled()
  })

  it('sin cambios, lo dice y no llama a la API', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ajustes', 'Ajustes', fake)
    await user.click(await within(business()).findByRole('button', { name: 'Guardar datos del local' }))
    expect(within(business()).getByRole('status')).toHaveTextContent('No hay cambios que guardar.')
    expect(fake.api.updateSettings).not.toHaveBeenCalled()
  })

  it('cambia los precios de Arma tu pizza y valida cada campo', async () => {
    const user = userEvent.setup()
    const fake = asAdmin()
    await openPage('/ajustes', 'Ajustes', fake)
    const base = await within(buildPizza()).findByLabelText('Precio base')
    const included = within(buildPizza()).getByLabelText('Ingredientes incluidos en la promo')
    expect(base).toHaveValue('10900')
    expect(within(buildPizza()).getByLabelText('Precio promo')).toHaveValue('13000')
    expect(included).toHaveValue('3')

    await user.clear(base)
    await user.type(base, 'gratis')
    await user.clear(included)
    await user.type(included, '31')
    await user.click(within(buildPizza()).getByRole('button', { name: 'Guardar Arma tu pizza' }))
    expect(base).toHaveAccessibleDescription('Ingresa un precio entre $0 y $1.000.000, sin decimales.')
    expect(included).toHaveAccessibleDescription('Ingresa un número entre 0 y 30.')
    expect(fake.api.updateSettings).not.toHaveBeenCalled()

    await user.clear(base)
    await user.type(base, '11.500')
    await user.clear(included)
    await user.type(included, '4')
    await user.click(within(buildPizza()).getByRole('button', { name: 'Guardar Arma tu pizza' }))
    expect(await within(buildPizza()).findByText('Guardado.')).toBeInTheDocument()
    expect(fake.api.updateSettings).toHaveBeenCalledExactlyOnceWith({ buildPizzaBasePrice: 11500, buildPizzaPromoIncluded: 4 })
  })
})
