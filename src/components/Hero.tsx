import type { MouseEvent } from 'react'
import { business } from '../config/business'
import { zones } from '../data/zones'
import { minDeliveryFee } from '../domain/delivery'
import { formatClp } from '../domain/format'
import { PizzaIllustration } from './PizzaIllustration'

interface HeroProps {
  onBuildPizza: (event: MouseEvent<HTMLElement>) => void
}

export function Hero({ onBuildPizza }: HeroProps) {
  const minFee = minDeliveryFee(zones)

  return (
    <section id="inicio" aria-labelledby="hero-title" className="overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_24rem] lg:pt-16 lg:pb-20">
        <div>
          <h1 id="hero-title" className="display text-[clamp(4rem,19vw,8.5rem)] text-rojo">
            <span className="block">Rápida</span>{' '}
            <span className="block pl-[0.4em] whitespace-nowrap">y sabrosa</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-tinta">
            Pizzas de élite en {business.city}, hechas al momento.{' '}
            {minFee === null
              ? 'Retiro en el local.'
              : `Despacho desde ${formatClp(minFee)} o retiro en el local.`}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#carta"
              className="inline-flex h-12 items-center rounded-full bg-rojo px-6 font-semibold text-white transition-colors hover:bg-rojo-oscuro"
            >
              Ver la carta
            </a>
            <button
              type="button"
              onClick={onBuildPizza}
              className="inline-flex h-12 items-center rounded-full border-2 border-carbon px-6 font-semibold transition-colors hover:bg-carbon hover:text-white"
            >
              Arma tu pizza
            </button>
          </div>
        </div>
        <PizzaIllustration className="mx-auto w-full max-w-[18rem] drop-shadow-[14px_18px_0_var(--color-queso)] motion-safe:animate-pizza-in sm:max-w-[22rem] lg:max-w-none" />
      </div>
    </section>
  )
}
