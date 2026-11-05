import { useEffect } from 'react'

/** El título de la pestaña: así se ve, por ejemplo, cuántos pedidos pendientes hay con el panel en segundo plano. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    window.document.title = title
  }, [title])
}
