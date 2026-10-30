import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { BuildPizzaModal } from './components/BuildPizzaModal'
import { CartPanel } from './components/CartPanel'
import { DeliverySection } from './components/DeliverySection'
import { FloatingCartBar } from './components/FloatingCartBar'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Menu } from './components/Menu'
import { CartProvider } from './store/CartProvider'

type Overlay = 'cart' | 'build-pizza' | null

export default function App() {
  const [overlay, setOverlay] = useState<Overlay>(null)
  // Botón que abrió el modal: al cerrar, el foco vuelve ahí.
  const openerRef = useRef<HTMLElement | null>(null)
  const previousOverlay = useRef<Overlay>(null)

  useEffect(() => {
    if (previousOverlay.current !== null && overlay === null) openerRef.current?.focus()
    previousOverlay.current = overlay
  }, [overlay])

  const openWith = (next: Exclude<Overlay, null>) => (event: MouseEvent<HTMLElement>) => {
    openerRef.current = event.currentTarget
    setOverlay(next)
  }
  const close = () => setOverlay(null)

  return (
    <CartProvider>
      <a
        href="#carta"
        className="sr-only z-50 rounded-full bg-queso px-4 py-2 font-semibold text-carbon focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar a la carta
      </a>
      <Header onOpenCart={openWith('cart')} />
      <main>
        <Hero onBuildPizza={openWith('build-pizza')} />
        <Menu onChooseIngredients={openWith('build-pizza')} />
        <DeliverySection />
      </main>
      <Footer />
      <FloatingCartBar onOpenCart={openWith('cart')} />

      <BuildPizzaModal open={overlay === 'build-pizza'} onClose={close} onAdded={() => setOverlay('cart')} />
      <CartPanel open={overlay === 'cart'} onClose={close} />
    </CartProvider>
  )
}
