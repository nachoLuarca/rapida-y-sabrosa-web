import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { emptyCheckoutForm, type CheckoutForm as CheckoutFormData } from '@rys/domain'
import { sentOrderTitle } from '../domain/sent-order'
import { useCart } from '../store/use-cart'
import { CartContents } from './CartContents'
import { CheckoutForm } from './CheckoutForm'
import { OrderSent } from './OrderSent'
import { Modal } from './ui/Modal'

type Step = 'cart' | 'checkout' | 'sent'

const titles: Record<Exclude<Step, 'sent'>, string> = {
  cart: 'Tu pedido',
  checkout: 'Tus datos',
}

interface CartPanelProps {
  open: boolean
  onClose: () => void
}

export function CartPanel({ open, onClose }: CartPanelProps) {
  const { lines, sentOrder, clear, markSent, reopenOrder } = useCart()
  const [view, setView] = useState<Exclude<Step, 'sent'>>('cart')
  const [form, setForm] = useState<CheckoutFormData>(emptyCheckoutForm)
  const [wasOpen, setWasOpen] = useState(open)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const stepChanged = useRef(false)

  // Un pedido enviado se queda en la confirmación hasta que cambie el carrito o se empiece otro.
  const step: Step = sentOrder ? 'sent' : view

  // Al abrir se parte del pedido. Los datos se conservan.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && view === 'checkout') setView('cart')
  }
  // Sin productos no hay datos que pedir (por ejemplo, si se vació el pedido en otra pestaña).
  if (view === 'checkout' && lines.length === 0) setView('cart')

  const goTo = (next: Exclude<Step, 'sent'>) => {
    stepChanged.current = true
    setView(next)
  }

  // Al cambiar de paso, el foco va al título para que se anuncie el paso nuevo.
  useEffect(() => {
    if (!stepChanged.current) return
    stepChanged.current = false
    titleRef.current?.focus()
  }, [step])

  const startNewOrder = () => {
    clear()
    setForm(emptyCheckoutForm)
    setView('cart')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="pedido-titulo" variant="drawer">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-linea px-5 py-4">
        <div>
          {step === 'checkout' && (
            <button
              type="button"
              onClick={() => goTo('cart')}
              className="mb-1 text-sm font-semibold text-tinta underline underline-offset-4 hover:text-carbon"
            >
              Volver al pedido
            </button>
          )}
          <h2 id="pedido-titulo" ref={titleRef} tabIndex={-1} className="display text-4xl">
            {step === 'sent'
              ? sentOrderTitle(sentOrder?.code ?? null, sentOrder?.details?.demo ?? sentOrder?.demo === true)
              : titles[step]}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-fondo"
          aria-label="Cerrar pedido"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {step === 'cart' && <CartContents onClose={onClose} onContinue={() => goTo('checkout')} />}
      {step === 'checkout' && (
        <CheckoutForm
          form={form}
          onChange={setForm}
          onSent={(details) => {
            markSent(details)
            goTo('cart')
          }}
          onUnavailable={() => goTo('cart')}
        />
      )}
      {step === 'sent' && sentOrder && (
        <OrderSent
          sent={sentOrder.details}
          code={sentOrder.code ?? null}
          demo={sentOrder.details?.demo ?? sentOrder.demo === true}
          onBackToOrder={() => {
            reopenOrder()
            goTo('cart')
          }}
          onNewOrder={startNewOrder}
        />
      )}
    </Modal>
  )
}
