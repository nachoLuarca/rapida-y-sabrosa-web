import type { AdminZone } from '@rys/contracts'
import { useState, type FormEvent } from 'react'
import type { AdminApi } from '../api/admin-api'
import { PricedList, type PricedListTexts } from '../components/PricedList'
import { ErrorNote, Field, PageState, primaryButton, SavedNote } from '../components/ui'
import { fieldErrors, NAME_ERROR, parsePrice, PRICE_ERROR } from '../lib/forms'
import { useDocumentTitle } from '../lib/use-document-title'
import { useApiFailure, useResource } from '../lib/use-resource'
import { useAuth, useServices } from '../panel-context'

const loadZones = (api: AdminApi) => api.listZones()

const TEXTS: PricedListTexts = {
  priceLabel: 'Costo de despacho',
  on: 'Activa',
  off: 'Desactivada',
  switchLabel: (name) => `${name} activa`,
}

/** /zonas: solo administración. Las zonas no se borran: se desactivan y dejan de ofrecerse en la web. */
export function ZonesPage() {
  const { user } = useAuth()
  useDocumentTitle('Zonas | Panel de Rápida y Sabrosa')

  return (
    <>
      <h1 className="display text-5xl">Zonas de despacho</h1>
      {user?.role === 'admin' ? <ZonesManager /> : <p className="mt-4 rounded-xl bg-white p-6 font-semibold">Esta sección es solo para administración.</p>}
    </>
  )
}

function ZonesManager() {
  const { api } = useServices()
  const { state, update, retry } = useResource(loadZones)

  const apply = async (id: string, patch: Parameters<AdminApi['updateZone']>[1]) => {
    const saved = await api.updateZone(id, patch)
    update((zones) => zones.map((zone) => (zone.id === saved.id ? saved : zone)))
  }

  if (state.status !== 'ready') {
    return (
      <PageState
        status={state.status}
        loadingText="Cargando las zonas…"
        message={state.status === 'error' ? state.message : undefined}
        onRetry={retry}
      />
    )
  }

  return (
    <>
      <p className="mt-2 text-tinta">
        Una zona desactivada deja de ofrecerse en la web. Las zonas no se borran, porque los pedidos anteriores las nombran.
      </p>
      <section aria-label="Zonas" className="mt-6 rounded-2xl bg-white px-5 py-2">
        <PricedList
          items={state.data.map(({ id, name, fee, active }) => ({ id, name, price: fee, on: active }))}
          canEdit
          texts={TEXTS}
          onToggle={(id, active) => apply(id, { active })}
          onSave={(id, { name, price }) => apply(id, { ...(name === undefined ? {} : { name }), ...(price === undefined ? {} : { fee: price }) })}
        />
      </section>
      <NewZoneForm onCreated={(zone) => update((zones) => [...zones, zone])} />
    </>
  )
}

function NewZoneForm({ onCreated }: { onCreated: (zone: AdminZone) => void }) {
  const { api } = useServices()
  const failure = useApiFailure()
  const [name, setName] = useState('')
  const [fee, setFee] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsedFee = parsePrice(fee)
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = NAME_ERROR
    if (parsedFee === null) found.fee = PRICE_ERROR
    setErrors(found)
    setCreated(null)
    if (Object.keys(found).length > 0 || parsedFee === null) return

    setBusy(true)
    setError(null)
    try {
      const zone = await api.createZone({ name: name.trim(), fee: parsedFee })
      onCreated(zone)
      setCreated(`Zona ${zone.name} agregada.`)
      setName('')
      setFee('')
    } catch (caught) {
      const message = failure(caught)
      const details = fieldErrors(caught)
      if (details.name || details.fee) setErrors(details)
      else setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="zona-nueva-titulo" className="mt-6 rounded-2xl bg-white p-5">
      <h2 id="zona-nueva-titulo" className="text-xl font-bold">
        Agregar zona
      </h2>
      <form noValidate onSubmit={submit} className="mt-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Nombre de la zona" value={name} onChange={setName} error={errors.name} maxLength={80} />
          <Field label="Costo de despacho" value={fee} onChange={setFee} error={errors.fee} inputMode="numeric" />
        </div>
        <ErrorNote message={error} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Agregando…' : 'Agregar zona'}
          </button>
          <SavedNote message={created} />
        </div>
      </form>
    </section>
  )
}
