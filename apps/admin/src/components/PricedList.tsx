import { formatClp } from '@rys/domain'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fieldErrors, NAME_ERROR, parsePrice, PRICE_ERROR } from '../lib/forms'
import { useApiFailure } from '../lib/use-resource'
import { ErrorNote, Field, primaryButton, SavedNote, secondaryButton, StateBadge, Switch } from './ui'

/** Una fila con nombre, monto e interruptor: sirve para los ingredientes (precio, disponible) y las zonas (costo, activa). */
export interface PricedItem {
  id: string
  name: string
  price: number
  on: boolean
}

export interface PricedChanges {
  name?: string
  price?: number
}

export interface PricedListTexts {
  priceLabel: string
  /** Texto visible del interruptor: "Disponible". */
  on: string
  /** Etiqueta junto al nombre cuando está apagado: "Agotado". */
  off: string
  /** Nombre accesible del interruptor: "Tocino disponible". */
  switchLabel: (name: string) => string
}

interface PricedListProps {
  items: PricedItem[]
  /** Administración edita nombre y monto; caja solo ve el interruptor. */
  canEdit: boolean
  texts: PricedListTexts
  /** Aplican el cambio en la API y actualizan la lista; si fallan, lanzan el error. */
  onToggle: (id: string, on: boolean) => Promise<void>
  onSave: (id: string, changes: PricedChanges) => Promise<void>
}

export function PricedList({ items, ...rest }: PricedListProps) {
  return (
    <ul className="divide-y divide-linea">
      {items.map((item) => (
        <PricedRow key={item.id} item={item} {...rest} />
      ))}
    </ul>
  )
}

function PricedRow({ item, canEdit, texts, onToggle, onSave }: Omit<PricedListProps, 'items'> & { item: PricedItem }) {
  const failure = useApiFailure()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  // Al cerrar el formulario, el foco vuelve al botón "Editar" de la fila.
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false
      editButton.current?.focus()
    }
  }, [editing])

  const startEditing = () => {
    setName(item.name)
    setPrice(String(item.price))
    setErrors({})
    setError(null)
    setSaved(false)
    setEditing(true)
  }

  const stopEditing = () => {
    returnFocus.current = true
    setEditing(false)
  }

  const toggle = async (on: boolean) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await onToggle(item.id, on)
    } catch (caught) {
      setError(failure(caught))
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const parsedPrice = parsePrice(price)
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = NAME_ERROR
    if (parsedPrice === null) found.price = PRICE_ERROR
    setErrors(found)
    if (Object.keys(found).length > 0 || parsedPrice === null) return

    const changes: PricedChanges = {}
    if (name.trim() !== item.name) changes.name = name.trim()
    if (parsedPrice !== item.price) changes.price = parsedPrice
    if (Object.keys(changes).length === 0) {
      stopEditing()
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onSave(item.id, changes)
      setSaved(true)
      stopEditing()
    } catch (caught) {
      const message = failure(caught)
      const details = fieldErrors(caught)
      // La API llama "fee" al costo de una zona y "price" al precio de un ingrediente.
      const byField: Record<string, string> = {}
      if (details.name) byField.name = details.name
      if (details.price ?? details.fee) byField.price = details.price ?? details.fee
      if (Object.keys(byField).length > 0) setErrors(byField)
      else setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-44">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={`font-semibold ${item.on ? '' : 'text-tinta'}`}>{item.name}</span>
            {!item.on && <StateBadge>{texts.off}</StateBadge>}
          </p>
          <p className="text-sm text-tinta tabular-nums">{formatClp(item.price)}</p>
        </div>
        <Switch
          checked={item.on}
          label={texts.switchLabel(item.name)}
          text={texts.on}
          aria-disabled={busy || undefined}
          onChange={(on) => void toggle(on)}
        />
        {canEdit && !editing && (
          <button ref={editButton} type="button" onClick={startEditing} className={secondaryButton}>
            Editar <span className="sr-only">{item.name}</span>
          </button>
        )}
      </div>

      {editing && (
        <form noValidate onSubmit={submit} aria-label={`Editar ${item.name}`} className="mt-3 rounded-xl bg-fondo p-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Nombre" value={name} onChange={setName} error={errors.name} maxLength={80} autoFocus />
            <Field label={texts.priceLabel} value={price} onChange={setPrice} error={errors.price} inputMode="numeric" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" aria-disabled={busy || undefined} className={primaryButton}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={stopEditing} className={secondaryButton}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <ErrorNote message={error} />
      <SavedNote message={saved && !editing ? 'Guardado.' : null} />
    </li>
  )
}
