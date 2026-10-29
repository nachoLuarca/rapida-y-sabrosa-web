import { DeliverySection } from './components/DeliverySection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Menu } from './components/Menu'
import { CartProvider } from './store/CartProvider'

export default function App() {
  return (
    <CartProvider>
      <a
        href="#carta"
        className="sr-only z-50 rounded-full bg-queso px-4 py-2 font-semibold text-carbon focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar a la carta
      </a>
      <Header />
      <main>
        <Hero />
        <Menu />
        <DeliverySection />
      </main>
      <Footer />
    </CartProvider>
  )
}
