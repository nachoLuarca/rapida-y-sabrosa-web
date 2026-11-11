import type { AdminProduct, MenuResponse, ProductPatch, VariantDto, VariantPatch } from '@rys/contracts'
import { formatClp } from '@rys/domain'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { AdminApi } from '../api/admin-api'
import {
  ErrorNote,
  Field,
  inputClass,
  PageState,
  primaryButton,
  SavedNote,
  secondaryButton,
  StateBadge,
  Switch,
} from '../components/ui'
import { fieldErrors, NAME_ERROR, parsePrice, PRICE_ERROR } from '../lib/forms'
import { useDocumentTitle } from '../lib/use-document-title'
import { useApiFailure, useResource } from '../lib/use-resource'
import { useAuth, useServices } from '../panel-context'
import { Link } from '../router/RouterProvider'

/** Un producto de la carta para el panel. Arma tu pizza es uno más, sin precio propio (está en los ajustes). */
interface MenuItem extends AdminProduct {
  priceInSettings: boolean
}

interface MenuSection {
  id: string
  name: string
  items: MenuItem[]
}

/** La carta de la web agrupada por categoría, con Arma tu pizza como producto de la suya. */
function toSections(menu: MenuResponse): MenuSection[] {
  return menu.categories.map((category) => ({
    id: category.id,
    name: category.name,
    items:
      category.kind === 'build_pizza'
        ? [
            {
              id: menu.buildPizza.productId,
              name: menu.buildPizza.name,
              description: menu.buildPizza.description,
              price: null,
              variants: [],
              available: menu.buildPizza.available,
              priceInSettings: true,
            },
          ]
        : category.products.map(({ id, name, description, price, variants, available }) => ({
            id,
            name,
            description,
            price,
            variants,
            available,
            priceInSettings: false,
          })),
  }))
}

const loadSections = async (api: AdminApi) => toSections(await api.getMenu())

const mapItem = (sections: MenuSection[], id: string, change: (item: MenuItem) => MenuItem): MenuSection[] =>
  sections.map((section) => ({ ...section, items: section.items.map((item) => (item.id === id ? change(item) : item)) }))

/** /carta: por categoría. Caja marca agotados; administración además edita nombre, descripción y precios. */
export function MenuPage() {
  const { api } = useServices()
  const { user } = useAuth()
  const { state, update, retry } = useResource(loadSections)

  useDocumentTitle('Carta | Panel de Rápida y Sabrosa')

  const saveProduct = async (id: string, patch: ProductPatch) => {
    const saved = await api.updateProduct(id, patch)
    update((sections) => mapItem(sections, id, (item) => ({ ...item, ...saved })))
  }

  const saveVariant = async (productId: string, variantId: string, patch: VariantPatch) => {
    const saved = await api.updateVariant(variantId, patch)
    update((sections) =>
      mapItem(sections, productId, (item) => ({
        ...item,
        variants: item.variants.map((variant) => (variant.id === saved.id ? saved : variant)),
      })),
    )
  }

  return (
    <>
      <h1 className="display text-5xl">Carta</h1>
      <p className="mt-2 text-tinta">
        Un producto agotado sigue en la web, atenuado y sin botón para agregarlo. Los clientes ven los cambios al
        recargar la página o al volver a ella.
      </p>

      {state.status !== 'ready' ? (
        <PageState
          status={state.status}
          loadingText="Cargando la carta…"
          message={state.status === 'error' ? state.message : undefined}
          onRetry={retry}
        />
      ) : (
        state.data.map((section) => (
          <section key={section.id} aria-labelledby={`categoria-${section.id}`} className="mt-6 rounded-2xl bg-white px-5 py-4">
            <h2 id={`categoria-${section.id}`} className="text-xl font-bold">
              {section.name}
            </h2>
            <ul className="mt-1 divide-y divide-linea">
              {section.items.map((item) => (
                <ProductRow
                  key={item.id}
                  item={item}
                  canEdit={user?.role === 'admin'}
                  onSaveProduct={(patch) => saveProduct(item.id, patch)}
                  onSaveVariant={(variantId, patch) => saveVariant(item.id, variantId, patch)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}

interface ProductRowProps {
  item: MenuItem
  canEdit: boolean
  onSaveProduct: (patch: ProductPatch) => Promise<void>
  onSaveVariant: (variantId: string, patch: VariantPatch) => Promise<void>
}

const priceText = (item: MenuItem) =>
  item.priceInSettings
    ? 'Precio en Ajustes'
    : item.variants.length > 0
      ? item.variants.map((variant) => `${variant.label} ${formatClp(variant.price)}`).join(' · ')
      : item.price === null
        ? 'Sin precio'
        : formatClp(item.price)

function ProductRow({ item, canEdit, onSaveProduct, onSaveVariant }: ProductRowProps) {
  const failure = useApiFailure()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false
      editButton.current?.focus()
    }
  }, [editing])

  const close = (wasSaved: boolean) => {
    returnFocus.current = true
    setSaved(wasSaved)
    setEditing(false)
  }

  const toggle = async (available: boolean) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await onSaveProduct({ available })
    } catch (caught) {
      setError(failure(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-44">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className={`font-semibold ${item.available ? '' : 'text-tinta'}`}>{item.name}</h3>
            {!item.available && <StateBadge>Agotado</StateBadge>}
          </div>
          <p className="text-sm text-tinta tabular-nums">{priceText(item)}</p>
        </div>
        <Switch
          checked={item.available}
          label={`${item.name} disponible`}
          text="Disponible"
          disabled={busy}
          onChange={(available) => void toggle(available)}
        />
        {canEdit && !editing && (
          <button
            ref={editButton}
            type="button"
            onClick={() => {
              setError(null)
              setSaved(false)
              setEditing(true)
            }}
            className={secondaryButton}
          >
            Editar <span className="sr-only">{item.name}</span>
          </button>
        )}
      </div>

      {editing && (
        <ProductForm
          item={item}
          onSaveProduct={onSaveProduct}
          onSaveVariant={onSaveVariant}
          onSaved={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
      <ErrorNote message={error} />
      <SavedNote message={saved && !editing ? 'Guardado.' : null} />
    </li>
  )
}

interface ProductFormProps extends Pick<ProductRowProps, 'item' | 'onSaveProduct' | 'onSaveVariant'> {
  onSaved: () => void
  onCancel: () => void
}

const variantKey = (id: string, field: 'label' | 'price') => `variant:${id}:${field}`

/** Edición en línea de un producto: nada cambia hasta "Guardar", y solo se manda lo que cambió. */
function ProductForm({ item, onSaveProduct, onSaveVariant, onSaved, onCancel }: ProductFormProps) {
  const failure = useApiFailure()
  const descriptionId = useId()
  const [name, setName] = useState(item.name)
  const [description, setDescription] = useState(item.description ?? '')
  const [price, setPrice] = useState(item.price === null ? '' : String(item.price))
  const [variants, setVariants] = useState(() =>
    item.variants.map((variant) => ({ id: variant.id, label: variant.label, price: String(variant.price) })),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const hasOwnPrice = item.price !== null && item.variants.length === 0

  const setVariant = (id: string, change: { label?: string; price?: string }) =>
    setVariants((current) => current.map((variant) => (variant.id === id ? { ...variant, ...change } : variant)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, string> = {}
    const productPatch: ProductPatch = {}

    if (!name.trim()) found.name = NAME_ERROR
    else if (name.trim() !== item.name) productPatch.name = name.trim()

    if (description.trim() !== (item.description ?? '')) productPatch.description = description.trim() || null

    if (hasOwnPrice) {
      const parsed = parsePrice(price)
      if (parsed === null) found.price = PRICE_ERROR
      else if (parsed !== item.price) productPatch.price = parsed
    }

    const variantPatches: { original: VariantDto; patch: VariantPatch }[] = []
    for (const draft of variants) {
      const original = item.variants.find((variant) => variant.id === draft.id)
      if (!original) continue
      const patch: VariantPatch = {}
      if (!draft.label.trim()) found[variantKey(draft.id, 'label')] = NAME_ERROR
      else if (draft.label.trim() !== original.label) patch.label = draft.label.trim()
      const parsed = parsePrice(draft.price)
      if (parsed === null) found[variantKey(draft.id, 'price')] = PRICE_ERROR
      else if (parsed !== original.price) patch.price = parsed
      if (Object.keys(patch).length > 0) variantPatches.push({ original, patch })
    }

    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    setError(null)
    // Si falla una variante, el error se muestra en esa variante; lo ya guardado queda guardado.
    let failing: string | null = null
    try {
      if (Object.keys(productPatch).length > 0) await onSaveProduct(productPatch)
      for (const { original, patch } of variantPatches) {
        failing = original.id
        await onSaveVariant(original.id, patch)
      }
      onSaved()
    } catch (caught) {
      const message = failure(caught)
      const details = fieldErrors(caught)
      const byField: Record<string, string> = {}
      for (const [field, text] of Object.entries(details)) {
        if (failing && (field === 'label' || field === 'price')) byField[variantKey(failing, field)] = text
        else if (!failing && ['name', 'description', 'price'].includes(field)) byField[field] = text
      }
      if (Object.keys(byField).length > 0) setErrors(byField)
      else setError(message)
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-label={`Editar ${item.name}`} className="mt-3 rounded-xl bg-fondo p-4">
      <div className={`grid gap-3 ${hasOwnPrice ? 'sm:grid-cols-[2fr_1fr]' : ''}`}>
        <Field label="Nombre" value={name} onChange={setName} error={errors.name} maxLength={80} autoFocus />
        {hasOwnPrice && <Field label="Precio" value={price} onChange={setPrice} error={errors.price} inputMode="numeric" />}
      </div>

      <div className="mt-3">
        <label htmlFor={descriptionId} className="text-sm font-semibold">
          Descripción
        </label>
        <textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={300}
          rows={2}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          className={`${inputClass} h-auto py-2`}
        />
        {errors.description && (
          <p id={`${descriptionId}-error`} className="mt-1 text-sm font-semibold text-rojo-oscuro">
            {errors.description}
          </p>
        )}
      </div>

      {variants.map((variant, index) => (
        <fieldset key={variant.id} className="mt-3">
          <legend className="text-sm font-bold">Variante {index + 1}</legend>
          <div className="mt-1 grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field
              label={`Nombre de la variante ${index + 1}`}
              value={variant.label}
              onChange={(label) => setVariant(variant.id, { label })}
              error={errors[variantKey(variant.id, 'label')]}
              maxLength={80}
            />
            <Field
              label={`Precio de la variante ${index + 1}`}
              value={variant.price}
              onChange={(value) => setVariant(variant.id, { price: value })}
              error={errors[variantKey(variant.id, 'price')]}
              inputMode="numeric"
            />
          </div>
        </fieldset>
      ))}

      {item.priceInSettings && (
        <p className="mt-3 text-sm text-tinta">
          Los precios de {item.name} se cambian en{' '}
          <Link href="/ajustes" className="font-semibold underline underline-offset-4">
            Ajustes
          </Link>
          .
        </p>
      )}

      <ErrorNote message={error} />
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
