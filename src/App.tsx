import { business } from './config/business'

// Fase 0: solo comprueba tokens y fuentes. El header y el hero definitivos llegan en la Fase 2.
export default function App() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-rojo text-white">
        <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-3">
          <a href="#inicio" className="display text-3xl">
            {business.name}
          </a>
          <span className="text-sm font-semibold text-queso">{business.branch}</span>
        </div>
      </header>

      <main id="inicio" className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="display text-[clamp(4rem,19vw,8.5rem)] text-rojo">{business.name}</h1>
        <p className="mt-6 max-w-prose text-tinta">
          Pizzas de élite en {business.city}. Muy pronto, la carta completa y pedidos por WhatsApp.
        </p>
      </main>
    </>
  )
}
