import type { BuildPizzaConfig, Ingredient } from './types'

export interface BuildPizzaQuote {
  total: number
  /** 'base': base + cada ingrediente. 'promo': precio promoción con los más caros incluidos. */
  mode: 'base' | 'promo'
  /** Ingredientes que cubre la promoción (vacío en modo base). */
  included: Ingredient[]
  /** Ingredientes que se cobran a su valor, en el orden en que se eligieron. */
  charged: Ingredient[]
  /** Cuántos ingredientes más caben en la promoción sin costo extra. */
  includedRemaining: number
  /** Detalle para mostrar: "Base", "Base + ingredientes", "Promoción", "Promoción + 1 extra"… */
  label: string
}

const sum = (items: Ingredient[]) => items.reduce((total, item) => total + item.price, 0)

/**
 * Precio de Arma tu pizza (docs/SPEC.md): base + ingredientes, o promoción con N ingredientes
 * incluidos (los más caros) y el resto a su valor. Siempre gana la opción más barata; si empatan, la base.
 */
export function quoteBuildPizza(selected: Ingredient[], config: BuildPizzaConfig): BuildPizzaQuote {
  const includedRemaining = Math.max(0, config.includedInPromo - selected.length)
  const baseTotal = config.basePrice + sum(selected)

  // sort es estable: ante el mismo precio, quedan incluidos los que se eligieron primero.
  const byPriceDesc = [...selected].sort((a, b) => b.price - a.price)
  const included = byPriceDesc.slice(0, config.includedInPromo)
  const extras = selected.filter((ingredient) => !included.includes(ingredient))
  const promoTotal = config.promoPrice + sum(extras)

  if (promoTotal < baseTotal) {
    const label =
      extras.length === 0
        ? 'Promoción'
        : `Promoción + ${extras.length} ${extras.length === 1 ? 'extra' : 'extras'}`
    return { total: promoTotal, mode: 'promo', included, charged: extras, includedRemaining, label }
  }

  return {
    total: baseTotal,
    mode: 'base',
    included: [],
    charged: [...selected],
    includedRemaining,
    label: selected.length === 0 ? 'Base' : 'Base + ingredientes',
  }
}
