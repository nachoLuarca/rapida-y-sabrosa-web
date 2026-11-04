import { Clock } from 'lucide-react'
import { storeBlockMessage } from '../domain/store-messages'
import { useMenu } from '../store/use-menu'

/** Aviso arriba de todo cuando el local está cerrado o pausó los pedidos. La carta se puede ver igual. */
export function StoreNotice() {
  const { menu } = useMenu()
  const message = menu ? storeBlockMessage(menu.store) : null

  return (
    // role="status" anuncia el aviso si aparece o cambia mientras la página está abierta.
    <div role="status">
      {message && (
        <div className="border-b border-queso bg-queso-claro">
          <p className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 font-semibold">
            <Clock className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>
              {message} <span className="font-normal">Puedes ver la carta igual.</span>
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
