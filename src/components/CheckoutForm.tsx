import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { business } from '../config/business'
import { zones } from '../data/zones'
import { cartTotals } from '../domain/cart'
import {
  COMMENT_MAX_LENGTH,
  firstErrorField,
  validateCheckout,
  type CheckoutField,
  type CheckoutForm as CheckoutFormData,
} from '../domain/checkout'
import { formatClp } from '../domain/format'
import { buildOrderMessage, whatsappUrl } from '../domain/order-message'
import { useCart } from '../store/use-cart'
import { copyToClipboard } from './ui/clipboard'

export interface SentOrder {
  message: string
  /** Solo en modo demo: si se pudo copiar el mensaje al portapapeles. */
  copied: boolean
}

interface CheckoutFormProps {
  form: CheckoutFormData
  onChange: (form: CheckoutFormData) => void
  onSent: (sent: SentOrder) => void
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
  'mt-1.5 h-12 w-full rounded-xl border border-linea bg-white px-4 aria-invalid:border-2 aria-invalid:border-rojo'

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
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-linea px-4 py-2 transition-colors hover:border-carbon has-checked:border-carbon has-checked:bg-carbon has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-queso">
      <input type="radio" className="size-5 shrink-0 accent-rojo focus-visible:outline-none" {...input} />
      <span>{children}</span>
    </label>
  )
}

/** Paso 2 del panel: datos del cliente, totales y envío por WhatsApp. */
export function CheckoutForm({ form, onChange, onSent }: CheckoutFormProps) {
  const { lines } = useCart()
  const [showErrors, setShowErrors] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ field: CheckoutField } | null>(null)
  const [sending, setSending] = useState(false)

  // Después del primer intento, los errores se actualizan mientras se corrige.
  const result = validateCheckout(form, zones, business.paymentMethods)
  const errors = showErrors && !result.ok ? result.errors : {}

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

  const set = <K extends keyof CheckoutFormData>(key: K, value: CheckoutFormData[K]) =>
    onChange({ ...form, [key]: value })

  const { subtotal } = cartTotals(lines)
  const zone = zones.find((z) => z.id === form.zoneId)
  const deliveryFee = form.fulfillment === 'delivery' ? (zone?.fee ?? null) : 0
  const total = subtotal + (deliveryFee ?? 0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (!result.ok) {
      setShowErrors(true)
      setFocusRequest({ field: firstErrorField(result.errors) ?? 'customerName' })
      return
    }
    const message = buildOrderMessage(lines, result.order)
    if (business.isDemo) {
      setSending(true)
      const copied = await copyToClipboard(message)
      setSending(false)
      onSent({ message, copied })
    } else {
      window.open(whatsappUrl(business.whatsappNumber, message), '_blank', 'noopener,noreferrer')
      onSent({ message, copied: false })
    }
  }

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
            className={`${inputClass} placeholder:text-tinta/70`}
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
            {business.pickupAddress && <> Dirección: {business.pickupAddress}.</>}
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
            className={`${inputClass} h-auto py-3 placeholder:text-tinta/70`}
            {...describedBy('comment', errors.comment)}
          />
          <p className="mt-1 text-right text-sm text-tinta tabular-nums">
            {form.comment.length}/{COMMENT_MAX_LENGTH}
          </p>
          <FieldError field="comment" message={errors.comment} />
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
        {business.isDemo && (
          <p className="mt-3 rounded-xl bg-queso-claro px-4 py-2 text-sm font-semibold">
            Modo demo: el pedido no llega al local.
          </p>
        )}
        <button
          type="submit"
          disabled={sending}
          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-whatsapp px-6 font-semibold text-white transition-colors hover:bg-whatsapp-oscuro disabled:opacity-60"
        >
          Enviar pedido por WhatsApp
        </button>
      </div>
    </form>
  )
}
