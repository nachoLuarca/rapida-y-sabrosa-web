import { useState } from 'react'
import { business } from '../config/business'
import { whatsappUrl } from '../domain/order-message'
import type { SentOrder } from './CheckoutForm'
import { copyToClipboard } from './ui/clipboard'

interface OrderSentProps {
  sent: SentOrder
  onNewOrder: () => void
}

const secondaryButton =
  'inline-flex h-12 w-full items-center justify-center rounded-full border-2 border-carbon px-6 font-semibold transition-colors hover:bg-carbon hover:text-white'

/** Paso 3 del panel: confirmación con el mensaje enviado (o copiado, en modo demo). */
export function OrderSent({ sent, onNewOrder }: OrderSentProps) {
  const [copiedAgain, setCopiedAgain] = useState<boolean | null>(null)

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {business.isDemo ? (
          <div className="rounded-xl bg-queso-claro p-4">
            <p className="font-bold">Modo demo: el pedido no llega al local.</p>
            <p className="mt-1 text-sm" role="status">
              {(copiedAgain ?? sent.copied)
                ? 'Copiamos el mensaje al portapapeles.'
                : 'No pudimos copiar el mensaje; selecciónalo abajo para copiarlo.'}
            </p>
          </div>
        ) : (
          <p>
            Abrimos WhatsApp con tu pedido. <strong>Envía el mensaje</strong> para que el local lo reciba; ahí te
            confirman el tiempo de entrega.
          </p>
        )}

        <h3 className="mt-6 font-semibold">Tu mensaje</h3>
        <pre className="mt-2 rounded-xl bg-fondo p-4 font-sans text-sm whitespace-pre-wrap">{sent.message}</pre>
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-linea px-5 py-4">
        {business.isDemo ? (
          <button
            type="button"
            onClick={async () => setCopiedAgain(await copyToClipboard(sent.message))}
            className={secondaryButton}
          >
            Copiar el mensaje otra vez
          </button>
        ) : (
          <button
            type="button"
            onClick={() => window.open(whatsappUrl(business.whatsappNumber, sent.message), '_blank', 'noopener,noreferrer')}
            className={secondaryButton}
          >
            Abrir WhatsApp otra vez
          </button>
        )}
        <button
          type="button"
          onClick={onNewOrder}
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-rojo px-6 font-semibold text-white transition-colors hover:bg-rojo-oscuro"
        >
          Empezar un pedido nuevo
        </button>
      </div>
    </>
  )
}
