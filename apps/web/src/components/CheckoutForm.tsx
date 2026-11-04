import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import {
  cartTotals,
  COMMENT_MAX_LENGTH,
  firstErrorField,
  formatClp,
  validateCheckout,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutForm as CheckoutFormData,
} from '@rys/domain'
import { business } from '../config/business'
import { priceChanges } from '../domain/price-changes'
import type { SentDetails } from '../domain/sent-order'
import { storeBlockMessage } from '../domain/store-messages'
import { useCart } from '../store/use-cart'
import { useMenu, useOrderGateway } from '../store/use-menu'
import { copyToClipboard } from './ui/clipboard'

interface CheckoutFormProps {
  form: CheckoutFormData
  onChange: (form: CheckoutFormData) => void
  onSent: (details: SentDetails) => void
  /** La API dijo que algo se agotó: el panel vuelve al pedido, donde se marcan las líneas. */
  onUnavailable: () => void
}

const fieldIds: Record<CheckoutField, string> = {
  customerName: 'checkout-nombre',
  phone: 'checkout-celular',
  zoneId: 'checkout-sector',
  address: 'checkout-direccion',
  payment: 'checkout-pago',
  comment: 'checkout-comentario',
}

const inputClass =
  'mt-1.5 h-12 w-full rounded-xl border border-campo bg-white px-4 aria-invalid:border-2 aria-invalid:border-rojo'

function FieldError({ field, message }: { field: CheckoutField; message?: string }) {
  if (!message) return null
  return (
    <p id={`${fieldIds[field]}-error`} className="mt-1.5 text-sm font-semibold text-rojo">
      {message}
    </p>
  )
}

/** Atributos para asociar un campo con su error. */
const describedBy = (field: CheckoutField, message?: string) =>
  message ? { 'aria-invalid': true, 'aria-describedby': `${fieldIds[field]}-error` } : {}

function Choice({ children, ...input }: { children: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-linea px-4 py-2 transition-colors hover:border-carbon has-checked:border-carbon has-checked:bg-carbon has-checked:text-white">
      <input type="radio" className="size-5 shrink-0 accent-rojo" {...input} />
      <span>{children}</span>
    </label>
  )
}

/** Aviso sobre el envío: un error del servidor o los precios que cambiaron. */
interface Notice {
  title: string
  items?: string[]
}

/** Paso 2 del panel: datos del cliente, totales y envío (a WhatsApp, o a la API y luego a WhatsApp). */
export function CheckoutForm({ form, onChange, onSent, onUnavailable }: CheckoutFormProps) {
  const { lines, unavailableKeys } = useCart()
  const { menu, reload } = useMenu()
  const gateway = useOrderGateway()
  const zones = menu?.zones ?? []
  const [showErrors, setShowErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<CheckoutErrors>({})
  const [focusRequest, setFocusRequest] = useState<{ field: CheckoutField } | null>(null)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  // Campo trampa: un humano no lo ve ni lo llena.
  const [honeypot, setHoneypot] = useState('')

  // Después del primer intento, los errores se actualizan mientras se corrige. Los del navegador mandan.
  const result = validateCheckout(form, zones, business.paymentMethods)
  const errors: CheckoutErrors = { ...serverErrors, ...(showErrors && !result.ok ? result.errors : {}) }

  useEffect(() => {
    if (!focusRequest) return
    const { field } = focusRequest
    const element =
      field === 'payment'
        ? (document.querySelector<HTMLInputElement>(`input[name="${fieldIds.payment}"]:checked`) ??
          document.querySelector<HTMLInputElement>(`input[name="${fieldIds.payment}"]`))
        : document.getElementById(fieldIds[field])
    element?.focus()
  }, [focusRequest])

  const set = <K extends keyof CheckoutFormData>(key: K, value: CheckoutFormData[K]) => {
    // Un error del servidor se va apenas se corrige el formulario; si sigue, lo vuelve a decir al enviar.
    setServerErrors({})
    onChange({ ...form, [key]: value })
  }

  const { subtotal } = cartTotals(lines)
  const zone = zones.find((z) => z.id === form.zoneId)
  const deliveryFee = form.fulfillment === 'delivery' ? (zone?.fee ?? null) : 0
  const total = subtotal + (deliveryFee ?? 0)

  const blocked = menu ? storeBlockMessage(menu.store) : null
  const soldOut = unavailableKeys.length > 0
  const isApi = gateway.kind === 'api'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending || blocked || soldOut) return
    if (!result.ok) {
      setShowErrors(true)
      setFocusRequest({ field: firstErrorField(result.errors) ?? 'customerName' })
      return
    }

    setSending(true)
    setNotice(null)
    const before = lines
    const beforeFee = deliveryFee ?? 0
    const outcome = await gateway.submit({ lines, order: result.order, honeypot })

    switch (outcome.kind) {
      case 'created': {
        const { order } = outcome
        let copied = false
        // En la carta estática WhatsApp se abre en este mismo clic. Con la API, el cliente lo abre desde la
        // confirmación: así el navegador no lo bloquea como popup.
        if (gateway.kind === 'static') {
          if (order.demo) copied = await copyToClipboard(order.message)
          else if (order.whatsappUrl) window.open(order.whatsappUrl, '_blank', 'noopener,noreferrer')
        }
        setSending(false)
        onSent({ ...order, copied })
        return
      }
      case 'validation': {
        setServerErrors(outcome.errors)
        setShowErrors(true)
        const field = firstErrorField(outcome.errors)
        if (field) setFocusRequest({ field })
        setNotice({ title: outcome.message })
        break
      }
      case 'price-changed':
        await reload()
        setNotice({ title: outcome.message, items: priceChanges(before, beforeFee, outcome.quote) })
        break
      case 'unavailable':
        await reload()
        setSending(false)
        onUnavailable()
        return
      case 'blocked':
        await reload()
        setNotice({ title: outcome.message })
        break
      case 'failed':
        setNotice({ title: outcome.message })
        break
    }
    setSending(false)
  }

  const reason = soldOut ? 'Algo de tu pedido se agotó. Vuelve a tu pedido para quitarlo.' : blocked

  return (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <label htmlFor={fieldIds.customerName} className="font-semibold">
            Nombre
          </label>
          <input
            id={fieldIds.customerName}
            value={form.customerName}
            onChange={(event) => set('customerName', event.target.value)}
            autoComplete="name"
            className={inputClass}
            {...describedBy('customerName', errors.customerName)}
          />
          <FieldError field="customerName" message={errors.customerName} />
        </div>

        <div>
          <label htmlFor={fieldIds.phone} className="font-semibold">
            Celular
          </label>
          <input
            id={fieldIds.phone}
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            autoComplete="tel"
            placeholder="9 1234 5678"
            className={`${inputClass} placeholder:text-tinta`}
            {...describedBy('phone', errors.phone)}
          />
          <FieldError field="phone" message={errors.phone} />
        </div>

        <fieldset>
          <legend className="font-semibold">¿Cómo lo recibes?</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <Choice
              name="checkout-entrega"
              checked={form.fulfillment === 'delivery'}
              onChange={() => set('fulfillment', 'delivery')}
            >
              Despacho a domicilio
            </Choice>
            <Choice
              name="checkout-entrega"
              checked={form.fulfillment === 'pickup'}
              onChange={() => set('fulfillment', 'pickup')}
            >
              Retiro en el local
            </Choice>
          </div>
        </fieldset>

        {form.fulfillment === 'delivery' ? (
          <>
            <div>
              <label htmlFor={fieldIds.zoneId} className="font-semibold">
                Sector
              </label>
              <select
                id={fieldIds.zoneId}
                value={form.zoneId}
                onChange={(event) => set('zoneId', event.target.value)}
                className={inputClass}
                {...describedBy('zoneId', errors.zoneId)}
              >
                <option value="">Elige tu sector</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({formatClp(z.fee)})
                  </option>
                ))}
              </select>
              <FieldError field="zoneId" message={errors.zoneId} />
            </div>
            <div>
              <label htmlFor={fieldIds.address} className="font-semibold">
                Dirección
              </label>
              <input
                id={fieldIds.address}
                value={form.address}
                onChange={(event) => set('address', event.target.value)}
                autoComplete="street-address"
                className={inputClass}
                {...describedBy('address', errors.address)}
              />
              <FieldError field="address" message={errors.address} />
            </div>
          </>
        ) : (
          <p className="rounded-xl bg-fondo p-4 text-sm">
            Retiras tu pedido en el local, sin costo de despacho.
            {menu?.pickupAddress && <> Dirección: {menu.pickupAddress}.</>}
          </p>
        )}

        <fieldset {...describedBy('payment', errors.payment)}>
          <legend className="font-semibold">¿Cómo pagas?</legend>
          <p className="text-sm text-tinta">Se paga al recibir o al retirar.</p>
          <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
            {business.paymentMethods.map((method) => (
              <Choice
                key={method}
                name={fieldIds.payment}
                checked={form.payment === method}
                onChange={() => set('payment', method)}
              >
                {method}
              </Choice>
            ))}
          </div>
          <FieldError field="payment" message={errors.payment} />
        </fieldset>

        <div>
          <label htmlFor={fieldIds.comment} className="font-semibold">
            Comentario <span className="font-normal text-tinta">(opcional)</span>
          </label>
          <textarea
            id={fieldIds.comment}
            value={form.comment}
            onChange={(event) => set('comment', event.target.value)}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            placeholder="Por ejemplo: sin cebolla, timbre malo"
            className={`${inputClass} h-auto py-3 placeholder:text-tinta`}
            {...describedBy('comment', errors.comment)}
          />
          <p className="mt-1 text-right text-sm text-tinta tabular-nums">
            {form.comment.length}/{COMMENT_MAX_LENGTH}
          </p>
          <FieldError field="comment" message={errors.comment} />
        </div>

        {/* Campo trampa para bots: fuera de la pantalla, sin foco con Tab y oculto a los lectores de pantalla. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="checkout-website">No completes este campo</label>
          <input
            id="checkout-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-linea px-5 py-4">
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatClp(subtotal)}</dd>
          </div>
          {form.fulfillment === 'delivery' && (
            <div className="flex justify-between">
              <dt>Despacho</dt>
              <dd className="tabular-nums">{deliveryFee === null ? 'Elige tu sector' : formatClp(deliveryFee)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatClp(total)}</dd>
          </div>
        </dl>
        {business.isDemo && !isApi && (
          <p className="mt-3 rounded-xl bg-queso-claro px-4 py-2 text-sm font-semibold">
            Modo demo: el pedido no llega al local.
          </p>
        )}
        <div role="alert">
          {notice && (
            <div className="mt-3 rounded-xl bg-queso-claro px-4 py-2 text-sm">
              <p className="font-semibold">{notice.title}</p>
              {notice.items && (
                <ul className="mt-1 list-disc pl-5">
                  {notice.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {reason && (
          <div id="checkout-bloqueado" className="mt-3 rounded-xl bg-queso-claro px-4 py-2 text-sm font-semibold">
            <p>{reason}</p>
            {soldOut && (
              <button type="button" onClick={onUnavailable} className="mt-1 underline underline-offset-4">
                Volver a mi pedido
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={sending || reason !== null}
          aria-describedby={reason ? 'checkout-bloqueado' : 'checkout-privacidad'}
          className={`mt-3 inline-flex h-12 w-full items-center justify-center rounded-full px-6 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            isApi ? 'bg-rojo hover:bg-rojo-oscuro' : 'bg-whatsapp hover:bg-whatsapp-oscuro'
          }`}
        >
          {sending ? 'Enviando…' : isApi ? 'Enviar pedido' : 'Enviar pedido por WhatsApp'}
        </button>
        <p id="checkout-privacidad" className="mt-2 text-xs text-tinta">
          {isApi
            ? 'Usamos tu nombre, celular y dirección solo para preparar y entregar este pedido. El local los guarda únicamente para gestionarlo.'
            : 'Tus datos van solo en el mensaje de WhatsApp al local, para preparar y entregar tu pedido.'}
        </p>
      </div>
    </form>
  )
}
