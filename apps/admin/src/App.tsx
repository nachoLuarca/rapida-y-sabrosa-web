import { useState } from 'react'
import { createAdminApi } from './api/admin-api'
import { browserEventSource } from './api/order-stream'
import { createWebAudioChime } from './lib/chime'
import { Layout } from './pages/Layout'
import { LoginPage } from './pages/LoginPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { ServicesContext, useAuth, type PanelServices } from './panel-context'
import { AuthProvider, LiveProvider } from './providers'
import { Link, RouterProvider } from './router/RouterProvider'
import { matchRoute, useRouter } from './router/router-context'

function Routes() {
  const { status, user } = useAuth()
  const { path } = useRouter()
  const route = matchRoute(path)

  if (status === 'checking') {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-tinta">Cargando el panel…</p>
      </main>
    )
  }

  // Sin sesión, cualquier página muestra el login y, al entrar, se queda donde estaba.
  if (!user) return <LoginPage redirectTo={route.name === 'login' ? '/pedidos' : path} />

  return (
    <LiveProvider>
      <Layout>
        {route.name === 'orders' || route.name === 'login' ? (
          <OrdersPage />
        ) : route.name === 'order' ? (
          <OrderDetailPage key={route.code} code={route.code} />
        ) : (
          <div className="rounded-xl bg-white p-6">
            <h1 className="text-xl font-bold">No encontramos esa página.</h1>
            <Link href="/pedidos" className="mt-3 inline-block font-semibold underline underline-offset-4">
              Ir a los pedidos
            </Link>
          </div>
        )}
      </Layout>
    </LiveProvider>
  )
}

interface AppProps {
  /** Para los tests: la API, el EventSource y el sonido de mentira. */
  services?: Partial<PanelServices>
}

export default function App({ services }: AppProps) {
  const [resolved] = useState<PanelServices>(() => ({
    api: createAdminApi(),
    createEventSource: browserEventSource,
    chime: createWebAudioChime(),
    ...services,
  }))
  return (
    <ServicesContext value={resolved}>
      <RouterProvider>
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </RouterProvider>
    </ServicesContext>
  )
}
