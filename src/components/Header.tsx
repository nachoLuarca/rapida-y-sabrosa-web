import { ShoppingBag } from 'lucide-react'
import { business } from '../config/business'
import { formatClp } from '../domain/format'
import { useCart } from '../store/use-cart'

const links = [
  { href: '#carta', label: 'Carta' },
  { href: '#arma-tu-pizza', label: 'Arma tu pizza' },
  { href: '#despacho', label: 'Despacho' },
]

interface HeaderProps {
  onOpenCart?: () => void
}

export function Header({ onOpenCart }: HeaderProps) {
  const { totals } = useCart()

  return (
    <header className="sticky top-0 z-30 bg-rojo text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <a href="#inicio" className="flex min-w-0 items-baseline gap-2 rounded-sm">
          <span className="display text-2xl whitespace-nowrap sm:text-3xl">{business.name}</span>
          <span className="hidden text-sm font-semibold text-queso lg:inline">{business.branch}</span>
        </a>

        <nav aria-label="Secciones" className="ml-auto hidden md:block">
          <ul className="flex gap-6 font-semibold">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="rounded-sm underline-offset-4 hover:underline">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          onClick={onOpenCart}
          className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-white pr-4 pl-3 font-semibold text-carbon transition-colors hover:bg-queso-claro md:ml-0"
        >
          <ShoppingBag className="size-5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Pedido</span>{' '}
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-rojo px-1.5 text-sm text-white tabular-nums">
            {totals.itemCount}
          </span>{' '}
          <span className="sr-only">{totals.itemCount === 1 ? 'producto,' : 'productos,'}</span>{' '}
          <span className="tabular-nums">{formatClp(totals.subtotal)}</span>
        </button>
      </div>
    </header>
  )
}
