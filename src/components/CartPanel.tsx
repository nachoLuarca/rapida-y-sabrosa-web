import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { emptyCheckoutForm, type CheckoutForm as CheckoutFormData } from '../domain/checkout'
import { useCart } from '../store/use-cart'
import { CartContents } from './CartContents'
import { CheckoutForm, type SentOrder } from './CheckoutForm'
import { OrderSent } from './OrderSent'
import { Modal } from './ui/Modal'

type Step = 'cart' | 'checkout' | 'sent'

const titles: Record<Step, string> = {
  cart: 'Tu pedido',
  checkout: 'Tus datos',
  sent: 'Pedido listo',
}

interface CartPanelProps {
  open: boolean
  onClose: () => void
}

export function CartPanel({ open, onClose }: CartPanelProps) {
  const { lines, clear } = useCart()
  const [step, setStep] = useState<Step>('cart')
  const [form, setForm] = useState<CheckoutFormData>(emptyCheckoutForm)
  const [sent, setSent] = useState<SentOrder | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const stepChanged = useRef(false)

  // Al abrir se parte del pedido, salvo que haya una confirmación pendiente. Los datos se conservan.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && step === 'checkout') setStep('cart')
  }
  // Sin productos no hay datos que pedir (por ejemplo, si se vació el pedido en otra pestaña).
  if (step === 'checkout' && lines.length === 0) setStep('cart')

  const goTo = (next: Step) => {
    stepChanged.current = true
    setStep(next)
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
    setSent(null)
    setStep('cart')
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
            {titles[step]}
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
          onSent={(order) => {
            setSent(order)
            goTo('sent')
          }}
        />
      )}
      {step === 'sent' && sent && <OrderSent sent={sent} onNewOrder={startNewOrder} />}
    </Modal>
  )
}
