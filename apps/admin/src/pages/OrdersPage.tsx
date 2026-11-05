import type { AdminOrderSummary } from '@rys/contracts'
import { formatClp, ORDER_STATUS_ACTIONS, primaryNextStatus, startOfLocalDay } from '@rys/domain'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, isUnauthenticated, type AdminApi } from '../api/admin-api'
import { ACTIVE_STATUSES, BOARD_COLUMNS, boardTitle, formatTime, groupBoard } from '../lib/board'
import { useDocumentTitle } from '../lib/use-document-title'
import { useAuth, useLive, useServices } from '../panel-context'
import { Link } from '../router/RouterProvider'

type LoadState = 'loading' | 'ready' | 'error'

/** Lo que muestra el tablero: los pedidos en curso y los entregados de hoy (en hora de Santiago). */
async function fetchBoard(api: AdminApi): Promise<AdminOrderSummary[]> {
  const [active, delivered] = await Promise.all([
    api.listOrders({ status: ACTIVE_STATUSES, pageSize: 100 }),
    api.listOrders({ status: ['delivered'], from: startOfLocalDay(new Date()).toISOString(), pageSize: 100 }),
  ])
  return [...active.orders, ...delivered.orders]
}

/** /pedidos: tablero por estado, en vivo. */
export function OrdersPage() {
  const { api } = useServices()
  const { sessionExpired } = useAuth()
  const { subscribe } = useLive()
  const [orders, setOrders] = useState<AdminOrderSummary[]>([])
  const [state, setState] = useState<LoadState>('loading')
  // Pedidos que llegaron mientras el tablero estaba abierto: se destacan hasta que alguien los mueve.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [cardError, setCardError] = useState<{ code: string; message: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setOrders(await fetchBoard(api))
      setState('ready')
    } catch (error) {
      if (isUnauthenticated(error)) sessionExpired()
      else setState((current) => (current === 'ready' ? current : 'error'))
    }
  }, [api, sessionExpired])

  // La primera carga y cada recarga la dispara el SSE: al conectarse (y reconectarse) y con cada evento.
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'event' && message.name === 'order.created') {
          setFresh((current) => new Set(current).add(message.event.code))
        }
        void load()
      }),
    [subscribe, load],
  )

  // Por si el SSE tarda en conectarse, la lista se pide igual al abrir.
  useEffect(() => {
    let active = true
    fetchBoard(api).then(
      (loaded) => {
        if (!active) return
        setOrders(loaded)
        setState('ready')
      },
      (error: unknown) => {
        if (!active) return
        if (isUnauthenticated(error)) sessionExpired()
        else setState('error')
      },
    )
    return () => {
      active = false
    }
  }, [api, sessionExpired])

  const board = groupBoard(orders)
  const pending = board.get('pendientes')?.length ?? 0

  useDocumentTitle(boardTitle(pending))

  const advance = async (order: AdminOrderSummary) => {
    const next = primaryNextStatus(order.status, order.fulfillment)
    if (!next) return
    setBusy(order.code)
    setCardError(null)
    try {
      await api.changeStatus(order.code, { status: next })
      setFresh((current) => {
        const copy = new Set(current)
        copy.delete(order.code)
        return copy
      })
    } catch (error) {
      if (isUnauthenticated(error)) return sessionExpired()
      setCardError({
        code: order.code,
        message: error instanceof ApiError ? error.message : 'No se pudo cambiar el estado. Inténtalo de nuevo.',
      })
    } finally {
      setBusy(null)
      await load()
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Pedidos</h1>
        <p className="text-tinta">{pending === 1 ? '1 pedido pendiente' : `${pending} pedidos pendientes`}</p>
      </div>

      {/* Si el pedido cambió de columna (o salió del tablero), el aviso se sigue viendo aquí. */}
      <div role="alert">
        {cardError && (
          <p className="mt-4 rounded-xl bg-queso-claro px-4 py-2 font-semibold">
            {cardError.code}: {cardError.message}
          </p>
        )}
      </div>

      {state === 'loading' && <p className="mt-6 text-tinta">Cargando pedidos…</p>}
      {state === 'error' && (
        <div role="alert" className="mt-6 rounded-xl bg-white p-6">
          <p className="font-semibold">No pudimos cargar los pedidos.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex h-10 items-center rounded-full bg-rojo px-5 font-semibold text-white hover:bg-rojo-oscuro"
          >
            Reintentar
          </button>
        </div>
      )}

      {state === 'ready' && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {BOARD_COLUMNS.map((column) => {
            const items = board.get(column.id) ?? []
            const titleId = `columna-${column.id}`
            return (
              <section key={column.id} aria-labelledby={titleId} className="rounded-2xl bg-white/60 p-3">
                <h2 id={titleId} className="flex items-baseline justify-between gap-2 px-1 font-bold">
                  {column.title} <span className="text-sm font-semibold text-tinta tabular-nums">{items.length}</span>
                </h2>
                {items.length === 0 ? (
                  <p className="mt-3 px-1 text-sm text-tinta">Sin pedidos.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {items.map((order) => (
                      <li key={order.code}>
                        <OrderCard
                          order={order}
                          fresh={fresh.has(order.code)}
                          busy={busy === order.code}
                          onAdvance={() => void advance(order)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

interface OrderCardProps {
  order: AdminOrderSummary
  fresh: boolean
  busy: boolean
  onAdvance: () => void
}

function OrderCard({ order, fresh, busy, onAdvance }: OrderCardProps) {
  const next = primaryNextStatus(order.status, order.fulfillment)
  const titleId = `pedido-${order.code}`
  return (
    <article
      aria-labelledby={titleId}
      className={`rounded-xl border bg-white p-4 ${fresh ? 'border-rojo ring-2 ring-rojo' : 'border-linea'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={titleId} className="font-bold">
          <Link href={`/pedidos/${order.code}`} className="underline-offset-4 hover:underline">
            {order.code}
          </Link>
        </h3>
        {fresh && <span className="rounded-full bg-rojo px-2 py-0.5 text-xs font-bold text-white">Nuevo</span>}
        <span className="text-sm text-tinta tabular-nums">{formatTime(order.createdAt)}</span>
      </div>
      <p className="mt-1">{order.customerName}</p>
      <p className="text-sm text-tinta">
        {order.fulfillment === 'delivery' ? `Despacho a ${order.zoneName ?? 'domicilio'}` : 'Retiro en el local'},{' '}
        {order.itemCount === 1 ? '1 producto' : `${order.itemCount} productos`}
      </p>
      <p className="mt-1 font-bold tabular-nums">{formatClp(order.total)}</p>
      {next && (
        <button
          type="button"
          disabled={busy}
          onClick={onAdvance}
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full bg-carbon px-4 text-sm font-semibold text-white hover:bg-rojo disabled:opacity-60"
        >
          {ORDER_STATUS_ACTIONS[next]} <span className="sr-only">{order.code}</span>
        </button>
      )}
    </article>
  )
}
