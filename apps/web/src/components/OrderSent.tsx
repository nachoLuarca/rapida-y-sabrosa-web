import { useState } from 'react'
import { whatsappUrl } from '@rys/domain'
import { business } from '../config/business'
import type { SentDetails } from '../domain/sent-order'
import { copyToClipboard } from './ui/clipboard'

interface OrderSentProps {
  /** null después de recargar: el mensaje no se guarda porque trae los datos del cliente. */
  sent: SentDetails | null
  /** Código del pedido si se creó en la API (también después de recargar). */
  code: string | null
  onBackToOrder: () => void
  onNewOrder: () => void
}

const secondaryButton =
  'inline-flex h-12 w-full items-center justify-center rounded-full border-2 border-carbon px-6 font-semibold transition-colors hover:bg-carbon hover:text-white'

function NewOrderButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-rojo px-6 font-semibold text-white transition-colors hover:bg-rojo-oscuro"
    >
      Empezar un pedido nuevo
    </button>
  )
}

function Message({ text }: { text: string }) {
  return (
    <>
      <h3 className="mt-6 font-semibold">Tu mensaje</h3>
      <pre className="mt-2 rounded-xl bg-fondo p-4 font-sans text-sm whitespace-pre-wrap">{text}</pre>
    </>
  )
}

/**
 * Confirmación creada en la API: el pedido ya existe con su código. El cliente abre WhatsApp con su clic (así el
 * navegador no lo bloquea como popup). No se ofrece volver al pedido: reenviarlo crearía otro.
 */
function ApiOrderSent({ sent, code, onNewOrder }: Omit<OrderSentProps, 'onBackToOrder'> & { code: string }) {
  if (!sent) {
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <p>
            Tu pedido <strong>{code}</strong> ya quedó registrado en el local. Si tienes dudas, escríbele al local por
            WhatsApp con ese código.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-linea px-5 py-4">
          <NewOrderButton onClick={onNewOrder} />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {sent.demo || !sent.whatsappUrl ? (
          <p className="rounded-xl bg-queso-claro p-4 font-bold">
            Modo demo: el pedido quedó registrado, pero no se envía por WhatsApp.
          </p>
        ) : (
          <p>
            El local ya tiene tu pedido <strong>{code}</strong>. <strong>Envíalo por WhatsApp</strong> para que te
            confirmen el tiempo de entrega.
          </p>
        )}
        <Message text={sent.message} />
      </div>
      <div className="flex shrink-0 flex-col gap-3 border-t border-linea px-5 py-4">
        {!sent.demo && sent.whatsappUrl && (
          <button
            type="button"
            onClick={() => window.open(sent.whatsappUrl ?? undefined, '_blank', 'noopener,noreferrer')}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-whatsapp px-6 font-semibold text-white transition-colors hover:bg-whatsapp-oscuro"
          >
            Abrir WhatsApp
          </button>
        )}
        <NewOrderButton onClick={onNewOrder} />
      </div>
    </>
  )
}

/** Paso 3 del panel: confirmación con el mensaje enviado (o copiado, en modo demo). */
export function OrderSent({ sent, code, onBackToOrder, onNewOrder }: OrderSentProps) {
  const [copiedAgain, setCopiedAgain] = useState<boolean | null>(null)

  if (code) return <ApiOrderSent sent={sent} code={code} onNewOrder={onNewOrder} />

  if (!sent) {
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {business.isDemo ? (
            <>
              <p>Ya preparamos tu pedido. Si quieres probar de nuevo, vuelve a tu pedido.</p>
              <p className="mt-4 rounded-xl bg-queso-claro p-4 font-bold">Modo demo: el pedido no llega al local.</p>
            </>
          ) : (
            <p>Ya abrimos WhatsApp con tu pedido. Si no alcanzaste a enviarlo, vuelve a tu pedido y envíalo de nuevo.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-linea px-5 py-4">
          <button type="button" onClick={onBackToOrder} className={secondaryButton}>
            Volver a mi pedido
          </button>
          <NewOrderButton onClick={onNewOrder} />
        </div>
      </>
    )
  }

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

        <Message text={sent.message} />
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
        <NewOrderButton onClick={onNewOrder} />
      </div>
    </>
  )
}
