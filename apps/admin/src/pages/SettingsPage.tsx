import { MAX_PROMO_INCLUDED, type AdminSettings, type SettingsPatchInput } from '@rys/contracts'
import { DAY_KEYS, DAY_NAMES, formatChileanMobile, normalizeChileanMobile, type DayKey } from '@rys/domain'
import { useState, type FormEvent } from 'react'
import type { AdminApi } from '../api/admin-api'
import { ConfirmDialog, ErrorNote, Field, PageState, primaryButton, SavedNote, secondaryButton } from '../components/ui'
import {
  fieldErrors,
  MAX_RANGES_PER_DAY,
  parseInteger,
  parsePrice,
  PRICE_ERROR,
  weekErrors,
  weekErrorsFromApi,
  weekFromOpeningHours,
  type WeekDraft,
} from '../lib/forms'
import { useDocumentTitle } from '../lib/use-document-title'
import { useApiFailure, useResource } from '../lib/use-resource'
import { useAuth, useServices } from '../panel-context'

const loadSettings = (api: AdminApi) => api.getSettings()

const sectionClass = 'mt-6 rounded-2xl bg-white p-5'

/** /ajustes: la pausa de pedidos (ambos roles) y, para administración, horario, datos del local y Arma tu pizza. */
export function SettingsPage() {
  const { user } = useAuth()
  const { state, update, retry } = useResource(loadSettings)

  useDocumentTitle('Ajustes | Panel de Rápida y Sabrosa')

  const onSaved = (settings: AdminSettings) => update(() => settings)

  return (
    <>
      <h1 className="display text-5xl">Ajustes</h1>
      {state.status !== 'ready' ? (
        <PageState
          status={state.status}
          loadingText="Cargando los ajustes…"
          message={state.status === 'error' ? state.message : undefined}
          onRetry={retry}
        />
      ) : (
        <>
          <PauseSection settings={state.data} onSaved={onSaved} />
          {user?.role === 'admin' && (
            <>
              <HoursSection settings={state.data} onSaved={onSaved} />
              <BusinessSection settings={state.data} onSaved={onSaved} />
              <BuildPizzaSection settings={state.data} onSaved={onSaved} />
            </>
          )}
        </>
      )}
    </>
  )
}

interface SectionProps {
  settings: AdminSettings
  onSaved: (settings: AdminSettings) => void
}

/** Guardado de una sección: devuelve null si se guardó, o los errores por campo de la API (puede venir vacío). */
function useSettingsSave(onSaved: (settings: AdminSettings) => void) {
  const { api } = useServices()
  const failure = useApiFailure()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const save = async (patch: SettingsPatchInput, savedText = 'Guardado.'): Promise<Record<string, string> | null> => {
    if (Object.keys(patch).length === 0) {
      setError(null)
      setNote('No hay cambios que guardar.')
      return null
    }
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      onSaved(await api.updateSettings(patch))
      setNote(savedText)
      return null
    } catch (caught) {
      const message = failure(caught)
      const details = fieldErrors(caught)
      if (Object.keys(details).length === 0) setError(message)
      return details
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, note, save, clearNote: () => setNote(null) }
}

function PauseSection({ settings, onSaved }: SectionProps) {
  const { busy, error, save } = useSettingsSave(onSaved)
  const [confirming, setConfirming] = useState(false)
  const paused = settings.ordersPaused

  const setPaused = async (ordersPaused: boolean) => {
    await save({ ordersPaused })
    setConfirming(false)
  }

  return (
    <section aria-labelledby="pausa-titulo" className={sectionClass}>
      <h2 id="pausa-titulo" className="text-xl font-bold">
        Pedidos por la web
      </h2>
      <p role="status" className={`mt-3 inline-block rounded-full px-4 py-1.5 font-semibold ${paused ? 'bg-queso' : 'bg-fondo'}`}>
        {paused ? 'Los pedidos están pausados.' : 'Recibiendo pedidos.'}
      </p>
      <p className="mt-3 text-tinta">
        {paused
          ? 'La web muestra el aviso y no deja enviar pedidos hasta que los reanudes.'
          : 'Si el local no da abasto, puedes pausarlos: la carta se sigue viendo, pero no se pueden enviar pedidos.'}
      </p>
      <ErrorNote message={error} />
      <div className="mt-4">
        {paused ? (
          <button type="button" disabled={busy} onClick={() => void setPaused(false)} className={primaryButton}>
            Reanudar pedidos
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={secondaryButton}>
            Pausar pedidos
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title="¿Pausar los pedidos?"
        confirmLabel="Sí, pausar"
        cancelLabel="No pausar"
        busy={busy}
        onConfirm={() => void setPaused(true)}
        onCancel={() => setConfirming(false)}
      >
        <p>La web dejará de recibir pedidos hasta que los reanudes desde aquí. Los pedidos ya hechos no cambian.</p>
      </ConfirmDialog>
    </section>
  )
}

const NO_RANGES_ERROR = 'Agrega al menos un rango en algún día, o desmarca "El local tiene un horario definido".'

function HoursSection({ settings, onSaved }: SectionProps) {
  const { busy, error, note, save, clearNote } = useSettingsSave(onSaved)
  const [defined, setDefined] = useState(settings.openingHours !== null)
  const [week, setWeek] = useState<WeekDraft>(() => weekFromOpeningHours(settings.openingHours))
  const [dayErrors, setDayErrors] = useState<Partial<Record<DayKey, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const changeDay = (day: DayKey, change: (ranges: [string, string][]) => [string, string][]) => {
    clearNote()
    setWeek((current) => ({ ...current, [day]: change(current[day]) }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!defined) {
      setDayErrors({})
      await save({ openingHours: null })
      return
    }
    const found = weekErrors(week)
    setDayErrors(found)
    if (Object.keys(found).length > 0) return
    if (DAY_KEYS.every((day) => week[day].length === 0)) {
      setFormError(NO_RANGES_ERROR)
      return
    }
    const details = await save({ openingHours: week })
    if (details) {
      const fromApi = weekErrorsFromApi(details)
      setDayErrors(fromApi)
      if (Object.keys(fromApi).length === 0 && Object.keys(details).length > 0) setFormError(Object.values(details)[0])
    }
  }

  return (
    <section aria-labelledby="horario-titulo" className={sectionClass}>
      <h2 id="horario-titulo" className="text-xl font-bold">
        Horario
      </h2>
      <form noValidate onSubmit={submit} className="mt-3">
        <label className="inline-flex min-h-10 items-center gap-3 rounded-lg pr-2 font-semibold">
          <input
            type="checkbox"
            checked={defined}
            onChange={(event) => {
              clearNote()
              setFormError(null)
              setDefined(event.target.checked)
            }}
            className="size-5 accent-carbon"
          />
          El local tiene un horario definido
        </label>

        {!defined ? (
          <p className="mt-2 text-tinta">Sin horario definido, la web recibe pedidos a toda hora y no muestra horario.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-tinta">
              Fuera de estos rangos la web avisa que el local está cerrado y no deja enviar pedidos. Si la hora de cierre es
              menor que la de apertura, el rango pasa la medianoche (por ejemplo, 19:00 a 01:00).
            </p>
            <div className="mt-3 divide-y divide-linea border-y border-linea">
              {DAY_KEYS.map((day) => (
                <DayEditor
                  key={day}
                  day={day}
                  ranges={week[day]}
                  error={dayErrors[day]}
                  onChange={(change) => changeDay(day, change)}
                />
              ))}
            </div>
          </>
        )}

        <ErrorNote message={formError ?? error} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Guardando…' : 'Guardar horario'}
          </button>
          <SavedNote message={note} />
        </div>
      </form>
    </section>
  )
}

interface DayEditorProps {
  day: DayKey
  ranges: [string, string][]
  error?: string
  onChange: (change: (ranges: [string, string][]) => [string, string][]) => void
}

const timeClass = 'h-11 rounded-xl border border-campo bg-white px-2 tabular-nums'

function DayEditor({ day, ranges, error, onChange }: DayEditorProps) {
  const name = DAY_NAMES[day]
  const errorId = `horario-${day}-error`
  const setTime = (index: number, position: 0 | 1, value: string) =>
    onChange((current) =>
      current.map((range, i): [string, string] => (i !== index ? range : position === 0 ? [value, range[1]] : [range[0], value])),
    )

  return (
    <fieldset className="py-3" aria-describedby={error ? errorId : undefined}>
      <legend className="float-left w-28 pt-2 font-bold">{name}</legend>
      <div className="ml-0 space-y-2 sm:ml-28">
        {ranges.length === 0 && <p className="pt-2 text-tinta">Cerrado</p>}
        {ranges.map(([start, end], index) => (
          // Los rangos no tienen id propio y solo se agregan al final o se quitan: el índice sirve de key.
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              type="time"
              value={start}
              onChange={(event) => setTime(index, 0, event.target.value)}
              aria-label={`${name}, rango ${index + 1}: abre`}
              aria-invalid={error && !start ? true : undefined}
              className={timeClass}
            />
            <span aria-hidden="true">a</span>
            <input
              type="time"
              value={end}
              onChange={(event) => setTime(index, 1, event.target.value)}
              aria-label={`${name}, rango ${index + 1}: cierra`}
              aria-invalid={error && !end ? true : undefined}
              className={timeClass}
            />
            <button
              type="button"
              onClick={() => onChange((current) => current.filter((_, i) => i !== index))}
              className="inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold underline underline-offset-4"
            >
              Quitar <span className="sr-only">el rango {index + 1} del {name.toLowerCase()}</span>
            </button>
          </div>
        ))}
        {ranges.length < MAX_RANGES_PER_DAY && (
          <button
            type="button"
            onClick={() => onChange((current) => [...current, ['', '']])}
            className="inline-flex h-10 items-center rounded-full border border-campo px-4 text-sm font-semibold hover:bg-fondo"
          >
            Agregar rango <span className="sr-only">al {name.toLowerCase()}</span>
          </button>
        )}
        {error && (
          <p id={errorId} className="text-sm font-semibold text-rojo-oscuro">
            {error}
          </p>
        )}
      </div>
    </fieldset>
  )
}

const WHATSAPP_ERROR = 'Ingresa un celular chileno de 9 dígitos, por ejemplo 9 1234 5678.'

function BusinessSection({ settings, onSaved }: SectionProps) {
  const { busy, error, note, save, clearNote } = useSettingsSave(onSaved)
  const [address, setAddress] = useState(settings.pickupAddress ?? '')
  const [whatsapp, setWhatsapp] = useState(formatChileanMobile(settings.whatsappNumber))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizeChileanMobile(whatsapp)
    if (!normalized) {
      setErrors({ whatsappNumber: WHATSAPP_ERROR })
      return
    }
    setErrors({})
    const patch: SettingsPatchInput = {}
    if (address.trim() !== (settings.pickupAddress ?? '')) patch.pickupAddress = address.trim()
    if (normalized !== settings.whatsappNumber) patch.whatsappNumber = normalized
    const details = await save(patch)
    if (details) setErrors(details)
  }

  return (
    <section aria-labelledby="local-titulo" className={sectionClass}>
      <h2 id="local-titulo" className="text-xl font-bold">
        Datos del local
      </h2>
      <form noValidate onSubmit={submit} className="mt-3">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Dirección de retiro"
            value={address}
            onChange={(value) => {
              clearNote()
              setAddress(value)
            }}
            error={errors.pickupAddress}
            hint="Déjala vacía si todavía no está confirmada: la web no la muestra."
            maxLength={200}
            autoComplete="off"
          />
          <Field
            label="Número de WhatsApp que recibe los pedidos"
            value={whatsapp}
            onChange={(value) => {
              clearNote()
              setWhatsapp(value)
            }}
            error={errors.whatsappNumber}
            hint="Celular chileno, por ejemplo +56 9 1234 5678."
            inputMode="tel"
            autoComplete="off"
          />
        </div>
        <ErrorNote message={error} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Guardando…' : 'Guardar datos del local'}
          </button>
          <SavedNote message={note} />
        </div>
      </form>
    </section>
  )
}

const INCLUDED_ERROR = `Ingresa un número entre 0 y ${MAX_PROMO_INCLUDED}.`

function BuildPizzaSection({ settings, onSaved }: SectionProps) {
  const { busy, error, note, save, clearNote } = useSettingsSave(onSaved)
  const [base, setBase] = useState(String(settings.buildPizzaBasePrice))
  const [promo, setPromo] = useState(String(settings.buildPizzaPromoPrice))
  const [included, setIncluded] = useState(String(settings.buildPizzaPromoIncluded))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const edit = (setter: (value: string) => void) => (value: string) => {
    clearNote()
    setter(value)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const basePrice = parsePrice(base)
    const promoPrice = parsePrice(promo)
    const promoIncluded = parseInteger(included, 0, MAX_PROMO_INCLUDED)
    const found: Record<string, string> = {}
    if (basePrice === null) found.buildPizzaBasePrice = PRICE_ERROR
    if (promoPrice === null) found.buildPizzaPromoPrice = PRICE_ERROR
    if (promoIncluded === null) found.buildPizzaPromoIncluded = INCLUDED_ERROR
    setErrors(found)
    if (basePrice === null || promoPrice === null || promoIncluded === null) return

    const patch: SettingsPatchInput = {}
    if (basePrice !== settings.buildPizzaBasePrice) patch.buildPizzaBasePrice = basePrice
    if (promoPrice !== settings.buildPizzaPromoPrice) patch.buildPizzaPromoPrice = promoPrice
    if (promoIncluded !== settings.buildPizzaPromoIncluded) patch.buildPizzaPromoIncluded = promoIncluded
    const details = await save(patch)
    if (details) setErrors(details)
  }

  return (
    <section aria-labelledby="arma-titulo" className={sectionClass}>
      <h2 id="arma-titulo" className="text-xl font-bold">
        Arma tu pizza
      </h2>
      <p className="mt-1 text-sm text-tinta">
        Al cliente se le cobra lo que más le conviene: el precio base más cada ingrediente, o el precio promo, que ya
        incluye esa cantidad de ingredientes (los más caros que eligió).
      </p>
      <form noValidate onSubmit={submit} className="mt-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Precio base" value={base} onChange={edit(setBase)} error={errors.buildPizzaBasePrice} inputMode="numeric" />
          <Field label="Precio promo" value={promo} onChange={edit(setPromo)} error={errors.buildPizzaPromoPrice} inputMode="numeric" />
          <Field
            label="Ingredientes incluidos en la promo"
            value={included}
            onChange={edit(setIncluded)}
            error={errors.buildPizzaPromoIncluded}
            inputMode="numeric"
          />
        </div>
        <ErrorNote message={error} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Guardando…' : 'Guardar Arma tu pizza'}
          </button>
          <SavedNote message={note} />
        </div>
      </form>
    </section>
  )
}
