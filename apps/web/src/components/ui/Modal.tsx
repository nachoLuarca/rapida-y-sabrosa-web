import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  /** Se llama al cerrar con Esc, con el fondo o con dialog.close(). */
  onClose: () => void
  labelledBy: string
  /** 'drawer': panel desde la derecha (ancho completo en celular). 'center': modal centrado. */
  variant: 'drawer' | 'center'
  children: ReactNode
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * El <dialog> nativo deja salir el foco hacia la interfaz del navegador al pasar el último elemento;
 * aquí Tab y Shift+Tab dan la vuelta dentro del modal.
 */
function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return
  const focusables = [...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)]
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (!active) return
  // Incluye lo que está antes del primero (el título) o después del último (zonas con scroll).
  const atStart = active === first || Boolean(first.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_PRECEDING)
  const atEnd = active === last || Boolean(last.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING)

  if (event.shiftKey && atStart) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && atEnd) {
    event.preventDefault()
    first.focus()
  }
}

const variants = {
  drawer: 'drawer m-0 ml-auto h-dvh max-h-none w-full max-w-none sm:max-w-md',
  center: 'm-auto h-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl rounded-3xl',
}

/**
 * <dialog> nativo en modo modal: atrapa el foco, deja inerte el resto de la página y cierra con Esc.
 * El foco vuelve al botón que lo abrió (lo maneja quien controla `open`).
 */
export function Modal({ open, onClose, labelledBy, variant, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // Si lo cerramos nosotros (open pasó a false), el evento close no debe volver a avisar.
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={() => {
        if (openRef.current) onClose()
      }}
      onKeyDown={trapFocus}
      // Un clic en el fondo (fuera del contenido) llega al propio <dialog>.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={`${variants[variant]} overflow-hidden bg-white p-0 text-carbon shadow-2xl backdrop:bg-carbon/60 open:flex open:flex-col`}
    >
      {children}
    </dialog>
  )
}
