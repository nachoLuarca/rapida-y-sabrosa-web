import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SOUND_STORAGE_KEY } from './lib/chime'
import { CAJA, createFakeApi, createServices, eventOf, FakeEventSource, makeOrder, PASSWORD } from './test/fakes'

beforeEach(() => {
  window.history.replaceState(null, '', '/pedidos')
})

afterEach(() => {
  localStorage.clear()
})

type Fake = ReturnType<typeof createFakeApi>

async function renderPanel(fake: Fake) {
  const services = createServices(fake)
  render(<App services={services} />)
  return services
}

/** La conexión en vivo: el efecto que la abre puede correr un poco después de que aparece la página. */
const liveStream = () => vi.waitFor(() => FakeEventSource.latest())

/** El tablero con el SSE conectado. */
async function openBoard(fake: Fake) {
  const services = await renderPanel(fake)
  await screen.findByRole('heading', { level: 1, name: 'Pedidos' })
  const source = await liveStream()
  act(() => source.open())
  return services
}

/** El título lo pone un efecto: puede llegar justo después de lo que se ve en pantalla. */
const expectTitle = (title: string) => vi.waitFor(() => expect(document.title).toBe(title))

const column = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) })
const card = (code: string) => screen.getByRole('article', { name: code })

describe('login', () => {
  it('sin sesión muestra el login; con datos malos, un error genérico; con los buenos, el tablero', async () => {
    const user = userEvent.setup()
    const fake = createFakeApi({ loggedIn: false, orders: [makeOrder('RYS-0001')] })
    await renderPanel(fake)

    await screen.findByRole('heading', { name: 'Panel del local' })
    await expectTitle('Entrar | Panel de Rápida y Sabrosa')
    await user.type(screen.getByLabelText('Email'), CAJA.email)
    await user.type(screen.getByLabelText('Contraseña'), 'otra-clave')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El email o la contraseña no son correctos.')
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('El email o la contraseña no son correctos.')

    await user.clear(screen.getByLabelText('Contraseña'))
    await user.type(screen.getByLabelText('Contraseña'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Pedidos' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/pedidos')
    expect(screen.getByText(/Caja/)).toBeInTheDocument()
  })

  it('si se entra a un pedido sin sesión, después del login se queda en ese pedido', async () => {
    window.history.replaceState(null, '', '/pedidos/RYS-0001')
    const user = userEvent.setup()
    const fake = createFakeApi({ loggedIn: false, orders: [makeOrder('RYS-0001')] })
    await renderPanel(fake)
    await user.type(await screen.findByLabelText('Email'), CAJA.email)
    await user.type(screen.getByLabelText('Contraseña'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'RYS-0001' })).toBeInTheDocument()
  })

  it('cerrar sesión vuelve al login', async () => {
    const user = userEvent.setup()
    const fake = createFakeApi()
    await openBoard(fake)
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Panel del local' })).toBeInTheDocument()
    expect(fake.api.logout).toHaveBeenCalled()
    expect(window.location.pathname).toBe('/login')
  })

  it('si la sesión vence mientras se usa el panel, vuelve al login', async () => {
    const fake = createFakeApi({ orders: [makeOrder('RYS-0001')] })
    await openBoard(fake)
    fake.expireSession()
    act(() => FakeEventSource.latest().emit('order.updated', eventOf(makeOrder('RYS-0001'))))
    expect(await screen.findByRole('heading', { name: 'Panel del local' })).toBeInTheDocument()
  })
})

describe('tablero de pedidos', () => {
  it('agrupa los pedidos por estado y el título muestra cuántos pendientes hay', async () => {
    const fake = createFakeApi({
      orders: [
        makeOrder('RYS-0001'),
        makeOrder('RYS-0002', { fulfillment: 'delivery', zoneName: 'Islita', total: 15000, customerName: 'Luis' }),
        makeOrder('RYS-0003', { status: 'preparing' }),
        makeOrder('RYS-0004', { status: 'out_for_delivery', fulfillment: 'delivery', zoneName: 'Islita' }),
        makeOrder('RYS-0005', { status: 'delivered' }),
      ],
    })
    await openBoard(fake)
    await within(column('Pendientes')).findByRole('article', { name: 'RYS-0002' })

    expect(within(column('Pendientes')).getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual([
      'pedido-RYS-0002',
      'pedido-RYS-0001',
    ])
    expect(within(column('En preparación')).getByRole('article', { name: 'RYS-0003' })).toBeInTheDocument()
    expect(within(column('En camino o listos')).getByRole('article', { name: 'RYS-0004' })).toBeInTheDocument()
    expect(within(column('Entregados de hoy')).getByRole('article', { name: 'RYS-0005' })).toBeInTheDocument()
    expect(within(column('Confirmados')).getByText('Sin pedidos.')).toBeInTheDocument()
    expect(within(card('RYS-0002')).getByText('Despacho a Islita, 1 producto')).toBeInTheDocument()
    expect(within(card('RYS-0002')).getByText('$15.000')).toBeInTheDocument()
    await expectTitle('(2) Pedidos | Panel de Rápida y Sabrosa')
    // El tablero pide solo los entregados de hoy.
    const delivered = (fake.api.listOrders as unknown as { mock: { calls: [{ status?: string[]; from?: string }][] } }).mock.calls.find(
      ([query]) => query.status?.includes('delivered'),
    )
    expect(delivered?.[0].from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/)
  })

  it('el botón de cada tarjeta lleva el pedido al siguiente estado', async () => {
    const user = userEvent.setup()
    const fake = createFakeApi({ orders: [makeOrder('RYS-0001')] })
    await openBoard(fake)

    await user.click(await within(card('RYS-0001')).findByRole('button', { name: 'Confirmar RYS-0001' }))
    expect(fake.api.changeStatus).toHaveBeenCalledWith('RYS-0001', { status: 'confirmed' })
    expect(await within(column('Confirmados')).findByRole('article', { name: 'RYS-0001' })).toBeInTheDocument()
    // La tarjeta cambió de columna: el foco la sigue hasta el botón del paso siguiente.
    await vi.waitFor(() => expect(within(card('RYS-0001')).getByRole('button', { name: 'A preparar RYS-0001' })).toHaveFocus())
    await user.click(within(card('RYS-0001')).getByRole('button', { name: 'A preparar RYS-0001' }))
    expect(await within(column('En preparación')).findByRole('article', { name: 'RYS-0001' })).toBeInTheDocument()
    await expectTitle('Pedidos | Panel de Rápida y Sabrosa')
  })

  it('si otra persona ya lo cambió, avisa en la tarjeta y muestra el estado real', async () => {
    const user = userEvent.setup()
    const fake = createFakeApi({ orders: [makeOrder('RYS-0001')] })
    await openBoard(fake)
    const button = await within(card('RYS-0001')).findByRole('button', { name: 'Confirmar RYS-0001' })
    fake.put(makeOrder('RYS-0001', { status: 'cancelled' }))
    await user.click(button)
    // El aviso queda arriba del tablero: la tarjeta ya no está, porque los cancelados no van en el tablero.
    expect(await screen.findByRole('alert')).toHaveTextContent('RYS-0001: Un pedido "Cancelado" no puede pasar a "Confirmado".')
    expect(screen.queryByRole('article', { name: 'RYS-0001' })).not.toBeInTheDocument()
  })
})

describe('pedidos en vivo', () => {
  it('un pedido nuevo entra arriba destacado, se anuncia, actualiza el título y suena si el aviso está activado', async () => {
    const user = userEvent.setup()
    const fake = createFakeApi({ orders: [makeOrder('RYS-0001')] })
    const services = await openBoard(fake)
    await within(column('Pendientes')).findByRole('article', { name: 'RYS-0001' })

    // Sin activar el aviso, no suena.
    const first = makeOrder('RYS-0002', { total: 20000, fulfillment: 'delivery', zoneName: 'Islita' })
    fake.put(first)
    act(() => FakeEventSource.latest().emit('order.created', eventOf(first)))
    const arrived = await within(column('Pendientes')).findByRole('article', { name: 'RYS-0002' })
    expect(within(column('Pendientes')).getAllByRole('article')[0]).toBe(arrived)
    expect(within(arrived).getByText('Nuevo')).toBeInTheDocument()
    expect(screen.getByText('Pedido nuevo RYS-0002: $20.000, despacho.')).toBeInTheDocument()
    await expectTitle('(2) Pedidos | Panel de Rápida y Sabrosa')
    expect(services.chime.play).not.toHaveBeenCalled()

    const sound = screen.getByRole('button', { name: 'Aviso sonoro' })
    expect(sound).toHaveAttribute('aria-pressed', 'false')
    await user.click(sound)
    expect(sound).toHaveAttribute('aria-pressed', 'true')
    expect(services.chime.unlock).toHaveBeenCalled()
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('on')

    const second = makeOrder('RYS-0003')
    fake.put(second)
    act(() => FakeEventSource.latest().emit('order.created', eventOf(second)))
    await within(column('Pendientes')).findByRole('article', { name: 'RYS-0003' })
    expect(services.chime.play).toHaveBeenCalledTimes(1)
  })

  it('si se cae la conexión lo muestra, y al reconectar vuelve a pedir la lista para no perder pedidos', async () => {
    const fake = createFakeApi({ orders: [makeOrder('RYS-0001')] })
    await openBoard(fake)
    await within(column('Pendientes')).findByRole('article', { name: 'RYS-0001' })
    expect(screen.getByText('En vivo')).toBeInTheDocument()

    act(() => FakeEventSource.latest().drop())
    expect(screen.getByText('Sin conexión: reintentando…')).toBeInTheDocument()

    // Mientras estaba desconectado llegó un pedido: no hubo evento, pero al reconectar aparece.
    fake.put(makeOrder('RYS-0002'))
    act(() => FakeEventSource.latest().open())
    expect(await within(column('Pendientes')).findByRole('article', { name: 'RYS-0002' })).toBeInTheDocument()
    expect(screen.getByText('En vivo')).toBeInTheDocument()
  })

  it('si el navegador cierra la conexión, revisa la sesión y vuelve a conectarse', async () => {
    const fake = createFakeApi({ orders: [makeOrder('RYS-0001')] })
    await openBoard(fake)
    const first = FakeEventSource.latest()
    act(() => first.fail())
    expect(first.closed).toBe(true)
    expect(fake.api.me).toHaveBeenCalledTimes(2)
    // A los 3 segundos abre otra conexión.
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(2), { timeout: 4000 })
  })
})

describe('detalle del pedido', () => {
  const detailed = () =>
    makeOrder('RYS-0007', {
      fulfillment: 'delivery',
      zoneName: 'Islita',
      address: 'Los Aromos 123',
      notes: 'timbre malo',
      payment: 'transfer',
      customerPhone: '56987654321',
      subtotal: 14500,
      deliveryFee: 2000,
      total: 16500,
      lines: [
        {
          productId: 'arma-tu-pizza',
          name: 'Arma tu pizza',
          variantLabel: null,
          ingredients: [
            { id: 'tocino', name: 'Tocino', price: 1500, included: true },
            { id: 'choclo', name: 'Choclo', price: 1500, included: true },
            { id: 'palta', name: 'Palta', price: 1500, included: true },
            { id: 'pina', name: 'Piña', price: 1500, included: false },
          ],
          unitPrice: 14500,
          quantity: 1,
          lineTotal: 14500,
        },
      ],
    })

  it('muestra líneas con ingredientes, totales, cliente, historial y el enlace al WhatsApp del cliente', async () => {
    const user = userEvent.setup()
    const fake = createFakeApi({ orders: [detailed()] })
    await openBoard(fake)
    await user.click(await within(card('RYS-0007')).findByRole('link', { name: 'RYS-0007' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'RYS-0007' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/pedidos/RYS-0007')
    await expectTitle('RYS-0007 | Panel de Rápida y Sabrosa')
    expect(screen.getByText('Ingredientes: Tocino, Choclo, Palta, Piña (extra)')).toBeInTheDocument()
    expect(screen.getByText('$16.500')).toBeInTheDocument()
    expect(screen.getByText('+56 9 8765 4321')).toBeInTheDocument()
    expect(screen.getByText('Los Aromos 123')).toBeInTheDocument()
    expect(screen.getByText('Transferencia')).toBeInTheDocument()
    expect(screen.getByText('timbre malo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Escribir al cliente por WhatsApp' })).toHaveAttribute('href', 'https://wa.me/56987654321')
    expect(screen.getByText(/pedido del cliente/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Confirmado', { selector: 'p.rounded-full' })).toBeInTheDocument()
    expect(screen.getByText(/, Caja$/)).toBeInTheDocument()
  })

  it('cancelar exige un motivo y lo guarda', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/pedidos/RYS-0007')
    const fake = createFakeApi({ orders: [detailed()] })
    await renderPanel(fake)
    await screen.findByRole('heading', { level: 1, name: 'RYS-0007' })

    await user.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
    const reason = screen.getByLabelText('Motivo de la cancelación')
    expect(reason).toHaveAccessibleDescription('Indica el motivo de la cancelación.')
    expect(reason).toHaveFocus()
    expect(fake.api.changeStatus).not.toHaveBeenCalled()

    await user.type(reason, 'Se acabó la masa')
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
    expect(fake.api.changeStatus).toHaveBeenCalledWith('RYS-0007', { status: 'cancelled', reason: 'Se acabó la masa' })
    expect(await screen.findByText('Motivo: Se acabó la masa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument()
  })

  it('si otra persona cambia el pedido, el detalle se actualiza solo', async () => {
    window.history.replaceState(null, '', '/pedidos/RYS-0007')
    const fake = createFakeApi({ orders: [detailed()] })
    await renderPanel(fake)
    await screen.findByRole('heading', { level: 1, name: 'RYS-0007' })
    const source = await liveStream()
    act(() => source.open())

    fake.put({ ...detailed(), status: 'confirmed', nextStatuses: ['preparing', 'cancelled'] })
    act(() => FakeEventSource.latest().emit('order.updated', { ...eventOf(detailed()), status: 'confirmed' }))
    expect(await screen.findByText('Confirmado', { selector: 'p.rounded-full' })).toBeInTheDocument()
  })

  it('un pedido anonimizado muestra sus montos, pero no el celular ni el enlace a WhatsApp', async () => {
    window.history.replaceState(null, '', '/pedidos/RYS-0003')
    const anonymized = makeOrder('RYS-0003', {
      customerName: 'Cliente anonimizado',
      customerPhone: '',
      status: 'delivered',
      anonymizedAt: '2026-11-11T15:00:00.000Z',
    })
    await renderPanel(createFakeApi({ orders: [anonymized] }))
    const client = await screen.findByRole('region', { name: 'Cliente' })
    expect(within(client).getByText('Cliente anonimizado')).toBeInTheDocument()
    expect(within(client).queryByText('Celular')).not.toBeInTheDocument()
    expect(within(client).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument()
    expect(within(client).getByText(/Los datos del cliente se anonimizaron el/)).toBeInTheDocument()
    // Subtotal y total siguen ahí.
    expect(screen.getAllByText('$13.000', { selector: 'dd' })).toHaveLength(2)
  })

  it('un pedido que no existe lo dice', async () => {
    window.history.replaceState(null, '', '/pedidos/RYS-9999')
    await renderPanel(createFakeApi())
    expect(await screen.findByRole('alert')).toHaveTextContent('No existe el pedido RYS-9999.')
  })
})
