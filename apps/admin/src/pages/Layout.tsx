import { LogOut, Volume2, VolumeX } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAuth, useLive } from '../panel-context'
import { Link } from '../router/RouterProvider'
import { useRouter } from '../router/router-context'

const STATUS_TEXT = {
  online: 'En vivo',
  connecting: 'Conectando…',
  offline: 'Sin conexión: reintentando…',
} as const

/** Marco de las páginas con sesión: header con el usuario, el estado de la conexión en vivo y el aviso sonoro. */
export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { status, soundOn, toggleSound } = useLive()
  const { navigate } = useRouter()
  const [leaving, setLeaving] = useState(false)

  return (
    <>
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-queso px-4 py-2 font-semibold text-carbon focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <header className="bg-carbon text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/pedidos" className="flex items-baseline gap-2 rounded-sm">
            <span className="display text-2xl text-queso">Rápida y Sabrosa</span>
            <span className="text-sm font-semibold text-white/80">Panel</span>
          </Link>

          <p
            role="status"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
              status === 'offline' ? 'bg-queso text-carbon' : 'bg-white/10'
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${status === 'online' ? 'bg-green-400' : status === 'offline' ? 'bg-rojo' : 'bg-white/60'}`}
            />
            {STATUS_TEXT[status]}
          </p>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-pressed={soundOn}
              onClick={toggleSound}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/30 px-4 text-sm font-semibold hover:bg-white/10"
            >
              {soundOn ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
              Aviso sonoro
            </button>
            {user && (
              <span className="text-sm">
                {user.name} <span className="text-white/80">({user.role === 'admin' ? 'administración' : 'caja'})</span>
              </span>
            )}
            <button
              type="button"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true)
                await logout().catch(() => undefined)
                navigate('/login')
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-carbon hover:bg-queso-claro disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </>
  )
}
