import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import App from './App'
import { SENT_ORDER_STORAGE_KEY } from './domain/sent-order'
import { apiError, createdOrder, createFakeApi } from './test/api-fake'
import { addAndOpenCart, fillCheckout, headerCartButton } from './test/order-helpers'

// La web en modo api (VITE_DATA_SOURCE=api) contra una API simulada: las fuentes de datos son las reales y solo
// fetch es de mentira (src/test/api-fake.ts).

let openSpy: MockInstance<typeof window.open>

beforeEach(() => {
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
  // jsdom no simula pestañas: la página está siempre "visible" para estos tests.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

type FakeApi = ReturnType<typeof createFakeApi>

async function renderWithApi(api: FakeApi) {
  render(<App sources={api.sources()} />)
  await screen.findByRole('heading', { level: 4, name: 'Suprema' })
}

/** Como volver a la pestaña: la web vuelve a pedir la carta. */
function returnToTab() {
  document.dispatchEvent(new Event('visibilitychange'))
}

const pickup = { name: 'Ana', phone: '912345678', pickup: true, payment: 'Efectivo' }

async function toCheckout(user: UserEvent, api: FakeApi) {
  await renderWithApi(api)
  await addAndOpenCart(user, 'Agregar Suprema')
  return fillCheckout(user, pickup)
}

const sendButton = (panel: HTMLElement) => within(panel).getByRole('button', { name: 'Enviar pedido' })

describe('carta desde la API', () => {
  it('muestra un esqueleto mientras carga y después la carta de la API', async () => {
    const api = createFakeApi()
    api.updateMenu((menu) => {
      menu.categories[0].products[0].price = 14000
    })
    render(<App sources={api.sources()} />)

    expect(screen.getByText('Cargando la carta…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 4, name: 'Suprema' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando la carta…')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'La carta' })).getByText('$14.000')).toBeInTheDocument()
  })

  it('si la API no responde lo dice claro y deja reintentar', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    api.setMenuDown(true)
    render(<App sources={api.sources()} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos cargar la carta.')

    api.setMenuDown(false)
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 4, name: 'Suprema' })).toBeInTheDocument()
  })

  it('al volver a la pestaña vuelve a pedir la carta con su ETag y muestra lo que cambió', async () => {
    const api = createFakeApi()
    await renderWithApi(api)

    returnToTab()
    // Sin cambios: la API responde 304 y la carta sigue igual.
    await vi.waitFor(() => expect(api.menuRequests()).toHaveLength(2))
    expect(api.menuRequests()[1].headers['If-None-Match']).toMatch(/^".+"$/)

    api.updateMenu((menu) => {
      menu.categories[0].products[0].price = 13500
    })
    returnToTab()
    const menu = screen.getByRole('region', { name: 'La carta' })
    expect(await within(menu).findByText('$13.500')).toBeInTheDocument()
  })
})

describe('agotados', () => {
  it('un producto agotado se ve atenuado, con "Agotado" y sin botón para agregarlo', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    api.updateMenu((menu) => {
      menu.categories[0].products[0].available = false
      menu.ingredients[0].available = false
    })
    await renderWithApi(api)

    const suprema = screen.getByRole('article', { name: 'Suprema' })
    expect(within(suprema).getByText('Agotado')).toBeInTheDocument()
    expect(within(suprema).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar Mango (500 cc)' })).toBeInTheDocument()

    // En Arma tu pizza, un ingrediente agotado no se puede elegir.
    await user.click(screen.getByRole('button', { name: 'Elegir ingredientes' }))
    const modal = screen.getByRole('dialog', { name: 'Arma tu pizza' })
    expect(within(modal).getByRole('checkbox', { name: /Tocino/ })).toBeDisabled()
    expect(within(modal).getByRole('checkbox', { name: /Choclo/ })).toBeEnabled()
  })

  it('si algo del pedido se agota, se marca y no se puede seguir hasta quitarlo', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    await renderWithApi(api)
    await user.click(screen.getByRole('button', { name: 'Agregar Suprema' }))
    await user.click(screen.getByRole('button', { name: 'Agregar Mango (500 cc)' }))

    api.updateMenu((menu) => {
      menu.categories[0].products[0].available = false
    })
    returnToTab()
    await within(screen.getByRole('article', { name: 'Suprema' })).findByText('Agotado')

    await user.click(headerCartButton())
    const panel = screen.getByRole('dialog', { name: 'Tu pedido' })
    const continueButton = within(panel).getByRole('button', { name: 'Continuar con mis datos' })
    expect(within(panel).getByText('Agotado')).toBeInTheDocument()
    expect(continueButton).toBeDisabled()
    expect(continueButton).toHaveAccessibleDescription('Un producto de tu pedido se agotó. Quítalo para continuar.')

    await user.click(within(panel).getByRole('button', { name: 'Quitar Suprema' }))
    expect(within(panel).queryByText('Agotado')).not.toBeInTheDocument()
    expect(continueButton).toBeEnabled()
  })
})

describe('local cerrado o pedidos pausados', () => {
  it('con el local cerrado avisa cuándo abre, muestra el horario y no deja continuar', async () => {
    // Martes 3 de noviembre de 2026, 16:00 en Santiago.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-03T19:00:00Z') })
    const user = userEvent.setup()
    const api = createFakeApi()
    api.updateMenu((menu) => {
      menu.business = {
        ...menu.business,
        isOpen: false,
        nextOpening: '2026-11-03T22:00:00.000Z',
        openingHours: { mon: [], tue: [['19:00', '23:30']], wed: [], thu: [], fri: [], sat: [], sun: [] },
      }
    })
    await renderWithApi(api)

    expect(screen.getByText('Estamos cerrados. Abrimos hoy a las 19:00.', { exact: false })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Despacho' })).getByText('Martes: 19:00 a 23:30')).toBeInTheDocument()

    // La carta se puede ver y armar el pedido, pero no seguir.
    const panel = await addAndOpenCart(user, 'Agregar Suprema')
    const continueButton = within(panel).getByRole('button', { name: 'Continuar con mis datos' })
    expect(continueButton).toBeDisabled()
    expect(continueButton).toHaveAccessibleDescription('Estamos cerrados. Abrimos hoy a las 19:00.')
  })

  it('con los pedidos pausados avisa y no deja continuar', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    api.updateMenu((menu) => {
      menu.business.ordersPaused = true
    })
    await renderWithApi(api)

    expect(screen.getByText(/Por ahora no estamos recibiendo pedidos/)).toBeInTheDocument()
    const panel = await addAndOpenCart(user, 'Agregar Suprema')
    expect(within(panel).getByRole('button', { name: 'Continuar con mis datos' })).toBeDisabled()
  })
})

describe('checkout contra la API', () => {
  it('crea el pedido, muestra el código y abre WhatsApp solo cuando el cliente lo pide', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    const panel = await toCheckout(user, api)

    expect(sendButton(panel)).toHaveAccessibleDescription(
      'Usamos tu nombre, celular y dirección solo para preparar y entregar este pedido. El local los guarda únicamente para gestionarlo.',
    )
    await user.click(sendButton(panel))

    const sent = await screen.findByRole('dialog', { name: 'Pedido RYS-0042 creado' })
    expect(openSpy).not.toHaveBeenCalled()
    const [request] = api.orderRequests()
    expect(request.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/)
    expect(request.body).toEqual({
      lines: [{ productId: 'suprema', quantity: 1 }],
      customer: { name: 'Ana', phone: '56912345678' },
      payment: 'cash',
      expectedTotal: 13000,
      website: '',
      fulfillment: 'pickup',
    })
    expect(within(sent).getByText(/Nuevo pedido RYS-0042/)).toBeInTheDocument()

    await user.click(within(sent).getByRole('button', { name: 'Abrir WhatsApp' }))
    expect(openSpy).toHaveBeenCalledWith(createdOrder().body.whatsappUrl, '_blank', 'noopener,noreferrer')
    // La marca guarda el código, nunca los datos del cliente.
    const mark = localStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? ''
    expect(JSON.parse(mark)).toMatchObject({ code: 'RYS-0042' })
    expect(mark).not.toMatch(/Ana|5691234/)

    // Al recargar vuelve a la confirmación con el código, sin ofrecer reenviarlo.
    cleanup()
    await renderWithApi(api)
    const reloaded = await screen.findByRole('dialog', { name: 'Pedido RYS-0042 creado' })
    expect(within(reloaded).getByText(/ya quedó registrado en el local/)).toBeInTheDocument()
    expect(within(reloaded).queryByRole('button', { name: 'Volver a mi pedido' })).not.toBeInTheDocument()
    await user.click(within(reloaded).getByRole('button', { name: 'Empezar un pedido nuevo' }))
    expect(headerCartButton()).toHaveAccessibleName('Pedido 0 productos, $0')
  })

  it('en modo demo dice que es demo y no ofrece WhatsApp', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    api.replyToOrders(createdOrder({ demo: true, whatsappUrl: null }))
    const panel = await toCheckout(user, api)
    await user.click(sendButton(panel))

    const sent = await screen.findByRole('dialog', { name: 'Pedido RYS-0042 recibido (demo)' })
    expect(within(sent).getByText('Modo demo: el pedido quedó registrado, pero no se envía por WhatsApp.')).toBeInTheDocument()
    expect(within(sent).queryByRole('button', { name: 'Abrir WhatsApp' })).not.toBeInTheDocument()
    expect(openSpy).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? '{}')).toMatchObject({ code: 'RYS-0042', demo: true })

    // Al recargar sigue siendo demo: el mismo título y nada de escribirle al local por WhatsApp.
    cleanup()
    await renderWithApi(api)
    const reloaded = await screen.findByRole('dialog', { name: 'Pedido RYS-0042 recibido (demo)' })
    expect(within(reloaded).getByText('Modo demo: el local no lo va a preparar.')).toBeInTheDocument()
    expect(reloaded).not.toHaveTextContent(/WhatsApp/)
  })

  it('si cambió un precio, muestra los precios nuevos y pide confirmar de nuevo con el total nuevo', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    const panel = await toCheckout(user, api)

    // El local subió el precio mientras el cliente completaba sus datos.
    api.updateMenu((menu) => {
      menu.categories[0].products[0].price = 13500
    })
    const line = { productId: 'suprema', name: 'Suprema', variantLabel: null, ingredients: null, unitPrice: 13500, quantity: 1, lineTotal: 13500 }
    api.replyToOrders(
      apiError(409, 'PRICE_CHANGED', 'Cambiaron algunos precios. Revisa el total y confirma de nuevo.', {
        quote: { lines: [line], subtotal: 13500, deliveryFee: 0, total: 13500 },
      }),
    )
    await user.click(sendButton(panel))

    const alert = await within(panel).findByRole('alert')
    await within(alert).findByText('Cambiaron algunos precios. Revisa el total y confirma de nuevo.')
    expect(within(alert).getByText('Suprema: $13.000 → $13.500 c/u')).toBeInTheDocument()
    expect(within(alert).getByText('Total nuevo: $13.500')).toBeInTheDocument()
    // La carta se volvió a pedir: el total del formulario ya es el nuevo.
    const total = within(panel).getByText('Total').nextElementSibling
    await vi.waitFor(() => expect(total).toHaveTextContent('$13.500'))

    await user.click(sendButton(panel))
    await screen.findByRole('dialog', { name: 'Pedido RYS-0042 creado' })
    expect(api.orderRequests()[1].body).toMatchObject({ expectedTotal: 13500 })
  })

  it('si algo se agotó al enviar, vuelve al pedido y marca la línea', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    const panel = await toCheckout(user, api)
    api.updateMenu((menu) => {
      menu.categories[0].products[0].available = false
    })
    api.replyToOrders(
      apiError(409, 'PRODUCT_UNAVAILABLE', 'Algunos productos de tu pedido ya no están disponibles.', {
        productIds: ['suprema'],
        variantIds: [],
        ingredientIds: [],
      }),
    )
    await user.click(sendButton(panel))

    const cart = await screen.findByRole('dialog', { name: 'Tu pedido' })
    expect(within(cart).getByText('Agotado')).toBeInTheDocument()
    expect(within(cart).getByRole('button', { name: 'Continuar con mis datos' })).toBeDisabled()
  })

  it('muestra los errores de validación del servidor junto a cada campo', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    const panel = await toCheckout(user, api)
    api.replyToOrders(
      apiError(400, 'VALIDATION_ERROR', 'Revisa los datos del pedido.', {
        'customer.phone': 'Ingresa un celular chileno, por ejemplo 9 1234 5678.',
      }),
    )
    await user.click(sendButton(panel))

    const phone = within(panel).getByLabelText('Celular')
    await vi.waitFor(() =>
      expect(phone).toHaveAccessibleDescription('Ingresa un celular chileno, por ejemplo 9 1234 5678.'),
    )
    expect(phone).toHaveFocus()
    expect(within(panel).getByRole('alert')).toHaveTextContent('Revisa los datos marcados.')
  })

  it('si se cae la red, avisa y el reintento usa el mismo Idempotency-Key (no se duplica)', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    const panel = await toCheckout(user, api)
    api.replyToOrders('network-error')
    await user.click(sendButton(panel))

    expect(await within(panel).findByText(/No pudimos enviar tu pedido. Revisa tu conexión/)).toBeInTheDocument()
    await user.click(sendButton(panel))
    await screen.findByRole('dialog', { name: 'Pedido RYS-0042 creado' })

    const [first, retry] = api.orderRequests()
    expect(retry.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key'])
    // Creado el pedido, la clave se borra: el próximo pedido lleva otra.
    expect(sessionStorage.getItem('rys.checkout.v1')).toBeNull()
  })

  it('si el local pausó los pedidos mientras tanto, lo avisa y no deja enviar', async () => {
    const user = userEvent.setup()
    const api = createFakeApi()
    const panel = await toCheckout(user, api)
    api.updateMenu((menu) => {
      menu.business.ordersPaused = true
    })
    api.replyToOrders(
      apiError(409, 'ORDERS_PAUSED', 'Por ahora no estamos recibiendo pedidos. Intenta de nuevo en un rato.', {
        nextOpening: null,
      }),
    )
    await user.click(sendButton(panel))

    expect(await within(panel).findByRole('alert')).toHaveTextContent('Por ahora no estamos recibiendo pedidos.')
    await vi.waitFor(() => expect(sendButton(panel)).toBeDisabled())
  })
})
