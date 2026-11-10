import type { AdminApi } from '../api/admin-api'
import { PricedList, type PricedListTexts } from '../components/PricedList'
import { PageState } from '../components/ui'
import { useDocumentTitle } from '../lib/use-document-title'
import { useResource } from '../lib/use-resource'
import { useAuth, useServices } from '../panel-context'

const loadIngredients = async (api: AdminApi) => (await api.getMenu()).ingredients

const TEXTS: PricedListTexts = {
  priceLabel: 'Precio',
  on: 'Disponible',
  off: 'Agotado',
  switchLabel: (name) => `${name} disponible`,
}

/** /ingredientes: los de Arma tu pizza. Caja marca agotados; administración además cambia nombre y precio. */
export function IngredientsPage() {
  const { api } = useServices()
  const { user } = useAuth()
  const { state, update, retry } = useResource(loadIngredients)

  useDocumentTitle('Ingredientes | Panel de Rápida y Sabrosa')

  const apply = async (id: string, patch: Parameters<AdminApi['updateIngredient']>[1]) => {
    const saved = await api.updateIngredient(id, patch)
    update((ingredients) => ingredients.map((ingredient) => (ingredient.id === saved.id ? saved : ingredient)))
  }

  return (
    <>
      <h1 className="display text-5xl">Ingredientes</h1>
      <p className="mt-2 text-tinta">
        Son los de Arma tu pizza. Un ingrediente agotado se ve en la web, pero no se puede elegir.
      </p>

      {state.status !== 'ready' ? (
        <PageState
          status={state.status}
          loadingText="Cargando los ingredientes…"
          message={state.status === 'error' ? state.message : undefined}
          onRetry={retry}
        />
      ) : (
        <section aria-label="Ingredientes" className="mt-6 rounded-2xl bg-white px-5 py-2">
          <PricedList
            items={state.data.map(({ id, name, price, available }) => ({ id, name, price, on: available }))}
            canEdit={user?.role === 'admin'}
            texts={TEXTS}
            onToggle={(id, available) => apply(id, { available })}
            onSave={(id, changes) => apply(id, changes)}
          />
        </section>
      )}
    </>
  )
}
