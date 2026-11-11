import type { AdminOrderDetail } from '@rys/contracts'
import {
  formatChileanMobile,
  formatClp,
  ORDER_STATUS_ACTIONS,
  ORDER_STATUS_LABELS,
  paymentMethodFromCode,
  type OrderStatus,
} from '@rys/domain'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, isUnauthenticated } from '../api/admin-api'
import { formatDateTime, whatsappChatUrl } from '../lib/board'
import { useDocumentTitle } from '../lib/use-document-title'
import { useAuth, useLive, useServices } from '../panel-context'
import { Link } from '../router/RouterProvider'

type LoadState = { status: 'loading' } | { status: 'ready'; order: AdminOrderDetail } | { status: 'error'; message: string }

const REASON_REQUIRED = 'Indica el motivo de la cancelación.'

/** /pedidos/:code: el pedido completo, su historial y lo que se puede hacer con él. */
export function OrderDetailPage({ code }: { code: string }) {
  const { api } = useServices()
  const { sessionExpired } = useAuth()
  const { subscribe } = useLive()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)

  const handleError = useCallback(
    (error: unknown): string => {
      if (isUnauthenticated(error)) sessionExpired()
      return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.'
    },
    [sessionExpired],
  )

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', order: await api.getOrder(code) })
    } catch (error) {
      setState({ status: 'error', message: handleError(error) })
    }
  }, [api, code, handleError])

  useEffect(() => {
    let active = true
    api.getOrder(code).then(
      (order) => {
        if (active) setState({ status: 'ready', order })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: handleError(error) })
      },
    )
    return () => {
      active = false
    }
  }, [api, code, handleError])

  // Si alguien más cambia este pedido (en otro computador), se ve al tiro.
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'open' || message.event.code === code) void load()
      }),
    [subscribe, load, code],
  )

  useDocumentTitle(`${code} | Panel de Rápida y Sabrosa`)

  const change = async (status: OrderStatus, why?: string) => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      setState({ status: 'ready', order: await api.changeStatus(code, { status, ...(why ? { reason: why } : {}) }) })
      setCancelling(false)
      setReason('')
    } catch (error) {
      const message = handleError(error)
      if (error instanceof ApiError && typeof error.details.reason === 'string') setReasonError(error.details.reason)
      else setActionError(message)
      void load()
    } finally {
      setBusy(false)
    }
  }

  const submitCancel = (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) {
      setReasonError(REASON_REQUIRED)
      document.getElementById('motivo-cancelacion')?.focus()
      return
    }
    setReasonError(null)
    void change('cancelled', reason.trim())
  }

  return (
    <>
      <Link href="/pedidos" className="text-sm font-semibold text-tinta underline underline-offset-4 hover:text-carbon">
        Volver a pedidos
      </Link>

      {state.status === 'loading' && <p className="mt-6 text-tinta">Cargando el pedido…</p>}
      {state.status === 'error' && (
        <div role="alert" className="mt-6 rounded-xl bg-white p-6">
          <p className="font-semibold">{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && (
        <OrderView
          order={state.order}
          busy={busy}
          actionError={actionError}
          onChange={(status) => void change(status)}
          cancelling={cancelling}
          onStartCancel={() => {
            setCancelling(true)
            setReasonError(null)
          }}
          onStopCancel={() => {
            setCancelling(false)
            setReasonError(null)
          }}
          reason={reason}
          onReasonChange={setReason}
          reasonError={reasonError}
          onSubmitCancel={submitCancel}
        />
      )}
    </>
  )
}

interface OrderViewProps {
  order: AdminOrderDetail
  busy: boolean
  actionError: string | null
  onChange: (status: OrderStatus) => void
  cancelling: boolean
  onStartCancel: () => void
  onStopCancel: () => void
  reason: string
  onReasonChange: (reason: string) => void
  reasonError: string | null
  onSubmitCancel: (event: FormEvent) => void
}

function OrderView(props: OrderViewProps) {
  const { order, busy, actionError, onChange, cancelling, reason, reasonError } = props
  const forward = order.nextStatuses.filter((status) => status !== 'cancelled')
  const canCancel = order.nextStatuses.includes('cancelled')

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section aria-labelledby="pedido-titulo" className="rounded-2xl bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 id="pedido-titulo" className="display text-5xl">
              {order.code}
            </h1>
            <p className="rounded-full bg-carbon px-3 py-1 text-sm font-semibold text-white">
              {ORDER_STATUS_LABELS[order.status]}
            </p>
          </div>
          <p className="mt-2 text-tinta">Recibido el {formatDateTime(order.createdAt)}</p>

          <ul className="mt-6 divide-y divide-linea border-y border-linea">
            {order.lines.map((line, index) => (
              <li key={`${line.productId}-${index}`} className="py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-semibold">
                    {line.quantity} x {line.name}
                    {line.variantLabel && ` (${line.variantLabel})`}
                  </p>
                  <p className="font-bold tabular-nums">{formatClp(line.lineTotal)}</p>
                </div>
                {line.ingredients && (
                  <p className="mt-1 text-sm text-tinta">
                    {line.ingredients.length === 0
                      ? 'Sin ingredientes extra'
                      : `Ingredientes: ${line.ingredients.map((ingredient) => (ingredient.included ? ingredient.name : `${ingredient.name} (extra)`)).join(', ')}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatClp(order.subtotal)}</dd>
            </div>
            {order.fulfillment === 'delivery' && (
              <div className="flex justify-between">
                <dt>Despacho</dt>
                <dd className="tabular-nums">{formatClp(order.deliveryFee)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatClp(order.total)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="historial-titulo" className="rounded-2xl bg-white p-6">
          <h2 id="historial-titulo" className="text-xl font-bold">
            Historial
          </h2>
          <ol className="mt-3 space-y-3">
            {order.history.map((entry, index) => (
              <li key={index}>
                <p className="font-semibold">{ORDER_STATUS_LABELS[entry.toStatus]}</p>
                <p className="text-sm text-tinta">
                  {formatDateTime(entry.createdAt)}, {entry.changedBy ? entry.changedBy.name : 'pedido del cliente'}
                </p>
                {entry.reason && <p className="text-sm">Motivo: {entry.reason}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="space-y-6">
        <section aria-labelledby="cliente-titulo" className="rounded-2xl bg-white p-6">
          <h2 id="cliente-titulo" className="text-xl font-bold">
            Cliente
          </h2>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-sm text-tinta">Nombre</dt>
              <dd className="font-semibold">{order.customerName}</dd>
            </div>
            {!order.anonymizedAt && (
              <div>
                <dt className="text-sm text-tinta">Celular</dt>
                <dd className="font-semibold">{formatChileanMobile(order.customerPhone)}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-tinta">Entrega</dt>
              <dd className="font-semibold">
                {order.fulfillment === 'delivery' ? `Despacho a ${order.zoneName ?? 'domicilio'}` : 'Retiro en el local'}
              </dd>
            </div>
            {order.address && (
              <div>
                <dt className="text-sm text-tinta">Dirección</dt>
                <dd className="font-semibold">{order.address}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-tinta">Pago</dt>
              <dd className="font-semibold">{paymentMethodFromCode(order.payment)}</dd>
            </div>
            {order.notes && (
              <div>
                <dt className="text-sm text-tinta">Comentario</dt>
                <dd className="font-semibold">{order.notes}</dd>
              </div>
            )}
          </dl>
          {order.anonymizedAt ? (
            <p className="mt-4 rounded-xl bg-fondo px-4 py-2 text-sm">
              Los datos del cliente se anonimizaron el {formatDateTime(order.anonymizedAt)}: se conservan los montos y los
              productos.
            </p>
          ) : (
            <a
              href={whatsappChatUrl(order.customerPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-10 items-center rounded-full border-2 border-carbon px-4 font-semibold hover:bg-carbon hover:text-white"
            >
              Escribir al cliente por WhatsApp
            </a>
          )}
        </section>

        {(forward.length > 0 || canCancel) && (
          <section aria-labelledby="acciones-titulo" className="rounded-2xl bg-white p-6">
            <h2 id="acciones-titulo" className="text-xl font-bold">
              Acciones
            </h2>
            <div role="alert">
              {actionError && <p className="mt-3 rounded-xl bg-queso-claro px-4 py-2 text-sm font-semibold">{actionError}</p>}
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {forward.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-disabled={busy || undefined}
                  onClick={() => onChange(status)}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-rojo px-6 font-semibold text-white hover:bg-rojo-oscuro aria-disabled:opacity-60"
                >
                  {ORDER_STATUS_ACTIONS[status]}
                </button>
              ))}
              {canCancel && !cancelling && (
                <button
                  type="button"
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    if (!busy) props.onStartCancel()
                  }}
                  className="inline-flex h-12 items-center justify-center rounded-full border-2 border-carbon px-6 font-semibold hover:bg-carbon hover:text-white aria-disabled:opacity-60"
                >
                  Cancelar pedido
                </button>
              )}
            </div>
            {canCancel && cancelling && (
              <form noValidate onSubmit={props.onSubmitCancel} className="mt-4">
                <label htmlFor="motivo-cancelacion" className="font-semibold">
                  Motivo de la cancelación
                </label>
                <textarea
                  id="motivo-cancelacion"
                  value={reason}
                  onChange={(event) => props.onReasonChange(event.target.value)}
                  maxLength={200}
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-campo bg-white px-4 py-3 aria-invalid:border-2 aria-invalid:border-rojo"
                  aria-invalid={reasonError ? true : undefined}
                  aria-describedby={reasonError ? 'motivo-error' : undefined}
                />
                {reasonError && (
                  <p id="motivo-error" className="mt-1.5 text-sm font-semibold text-rojo">
                    {reasonError}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    aria-disabled={busy || undefined}
                    className="inline-flex h-10 items-center rounded-full bg-rojo px-5 font-semibold text-white hover:bg-rojo-oscuro aria-disabled:opacity-60"
                  >
                    Confirmar cancelación
                  </button>
                  <button
                    type="button"
                    onClick={props.onStopCancel}
                    className="inline-flex h-10 items-center rounded-full border-2 border-carbon px-5 font-semibold hover:bg-carbon hover:text-white"
                  >
                    No cancelar
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
