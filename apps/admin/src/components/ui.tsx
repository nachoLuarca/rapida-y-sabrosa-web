import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react'

// Piezas genéricas de las pantallas de gestión.

export const primaryButton =
  'inline-flex h-10 items-center justify-center rounded-full bg-rojo px-5 font-semibold text-white hover:bg-rojo-oscuro disabled:opacity-60'
export const secondaryButton =
  'inline-flex h-10 items-center justify-center rounded-full border-2 border-carbon bg-white px-5 font-semibold hover:bg-carbon hover:text-white disabled:opacity-60'
export const inputClass =
  'mt-1.5 h-11 w-full rounded-xl border border-campo bg-white px-3 aria-invalid:border-2 aria-invalid:border-rojo'

interface SwitchProps {
  checked: boolean
  /** Nombre accesible completo: "Suprema disponible". Debe contener `text` (WCAG 2.5.3, la etiqueta en el nombre). */
  label: string
  /** Texto visible junto al interruptor, siempre el mismo ("Disponible"): el estado lo dicen el interruptor y aria-checked. */
  text: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

/**
 * Interruptor (role="switch"): se cambia con clic, Espacio o Enter y aplica el cambio al tiro. Su texto visible no
 * cambia con el estado, para que quien lo maneja por voz lo encuentre siempre por ese nombre; el estado apagado se
 * muestra aparte, con una StateBadge junto al nombre del producto.
 */
export function Switch({ checked, label, text, disabled, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full pr-2 text-sm font-semibold disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-6 w-11 rounded-full border-2 transition-colors ${
          checked ? 'border-carbon bg-carbon' : 'border-campo bg-white'
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full transition-[left] ${checked ? 'left-[22px] bg-queso' : 'left-0.5 bg-campo'}`}
        />
      </span>
      <span aria-hidden="true" className="text-left">
        {text}
      </span>
    </button>
  )
}

/** Etiqueta de estado junto a un nombre: "Agotado", "Desactivada". */
export function StateBadge({ children }: { children: string }) {
  return <span className="rounded-full bg-queso-claro px-2 py-0.5 text-xs font-bold text-carbon">{children}</span>
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  hint?: string
}

/** Campo de texto con su label, su ayuda y su error asociados (aria-describedby). */
export function Field({ label, value, onChange, error, hint, className, ...rest }: FieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={inputClass}
        {...rest}
      />
      {hint && (
        <p id={`${id}-ayuda`} className="mt-1 text-sm text-tinta">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-rojo-oscuro">
          {error}
        </p>
      )}
    </div>
  )
}

/** Aviso de un error de la API. El contenedor siempre existe para que el lector de pantalla anuncie el cambio. */
export function ErrorNote({ message }: { message: string | null }) {
  return (
    <div role="alert">
      {message && <p className="mt-3 rounded-xl bg-queso-claro px-4 py-2 text-sm font-semibold">{message}</p>}
    </div>
  )
}

/** "Guardado": confirmación breve que también se anuncia. */
export function SavedNote({ message }: { message: string | null }) {
  return (
    <p role="status" className="text-sm font-semibold text-tinta">
      {message}
    </p>
  )
}

interface PageStateProps {
  status: 'loading' | 'error'
  loadingText: string
  message?: string
  onRetry: () => void
}

/** Cargando o error con "Reintentar", igual en todas las páginas de gestión. */
export function PageState({ status, loadingText, message, onRetry }: PageStateProps) {
  if (status === 'loading') return <p className="mt-6 text-tinta">{loadingText}</p>
  return (
    <div role="alert" className="mt-6 rounded-xl bg-white p-6">
      <p className="font-semibold">{message}</p>
      <button type="button" onClick={onRetry} className={`mt-3 ${primaryButton}`}>
        Reintentar
      </button>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmación con <dialog> nativo: atrapa el foco, se cierra con Esc y devuelve el foco al botón que lo abrió. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: se cierra por el estado, no por su cuenta.
        event.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl p-6 backdrop:bg-carbon/60"
    >
      <h2 id={titleId} className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-2 text-tinta">{children}</div>
      <div className="mt-5 flex flex-wrap gap-3">
        {/* Primero el que no cambia nada: es el que recibe el foco al abrir. */}
        <button type="button" onClick={onCancel} className={secondaryButton}>
          {cancelLabel}
        </button>
        <button type="button" disabled={busy} onClick={onConfirm} className={primaryButton}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
