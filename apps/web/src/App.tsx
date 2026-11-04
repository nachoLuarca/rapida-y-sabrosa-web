import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { BuildPizzaModal } from './components/BuildPizzaModal'
import { CartPanel } from './components/CartPanel'
import { DeliverySection } from './components/DeliverySection'
import { FloatingCartBar } from './components/FloatingCartBar'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Menu } from './components/Menu'
import { StoreNotice } from './components/StoreNotice'
import { defaultDataSources, type DataSources } from './data-source'
import { CartProvider } from './store/CartProvider'
import { MenuProvider } from './store/MenuProvider'
import { useCart } from './store/use-cart'
import { useMenu } from './store/use-menu'

type Overlay = 'cart' | 'build-pizza' | null

function Page() {
  const { sentOrder } = useCart()
  // Al recargar con un pedido ya enviado se vuelve a la confirmación, para no reenviarlo sin querer.
  const [overlay, setOverlay] = useState<Overlay>(sentOrder ? 'cart' : null)
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
    <>
      <a
        href="#carta"
        className="sr-only z-50 rounded-full bg-queso px-4 py-2 font-semibold text-carbon focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar a la carta
      </a>
      <Header onOpenCart={openWith('cart')} />
      <StoreNotice />
      <main>
        <Hero onBuildPizza={openWith('build-pizza')} />
        <Menu onChooseIngredients={openWith('build-pizza')} />
        <DeliverySection />
      </main>
      <Footer />
      <FloatingCartBar onOpenCart={openWith('cart')} />

      <BuildPizzaModal open={overlay === 'build-pizza'} onClose={close} onAdded={() => setOverlay('cart')} />
      <CartPanel open={overlay === 'cart'} onClose={close} />
    </>
  )
}

/**
 * El pedido se arma con la carta que haya: la del bundle o la de la API (null mientras carga). Cuando llega la
 * carta, el carrito se vuelve a montar (key) para leer el pedido guardado con ella.
 */
function CartWithMenu() {
  const { menu } = useMenu()
  return (
    <CartProvider key={menu ? 'con-carta' : 'cargando'} catalog={menu}>
      <Page />
    </CartProvider>
  )
}

interface AppProps {
  /** De dónde salen la carta y a dónde van los pedidos. Por defecto, según VITE_DATA_SOURCE. */
  sources?: DataSources
}

export default function App({ sources }: AppProps) {
  const [resolved] = useState(() => sources ?? defaultDataSources())
  return (
    <MenuProvider sources={resolved}>
      <CartWithMenu />
    </MenuProvider>
  )
}
