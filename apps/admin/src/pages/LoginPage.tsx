import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/admin-api'
import { useDocumentTitle } from '../lib/use-document-title'
import { useAuth } from '../panel-context'
import { useRouter } from '../router/router-context'

const inputClass = 'mt-1.5 h-12 w-full rounded-xl border border-campo bg-white px-4'

/**
 * /login. Los errores son genéricos (los da la API): no dicen si el email existe. Si se llegó aquí desde otra
 * página del panel, después de entrar se queda en esa página.
 */
export function LoginPage({ redirectTo }: { redirectTo: string }) {
  const { login } = useAuth()
  const { navigate, path } = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useDocumentTitle('Entrar | Panel de Rápida y Sabrosa')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (!email.trim() || !password) {
      setError('Ingresa tu email y tu contraseña.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await login(email, password)
      if (path !== redirectTo) navigate(redirectTo, { replace: true })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos iniciar sesión. Inténtalo de nuevo.')
      setSending(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm">
        <p className="display text-4xl text-rojo">Rápida y Sabrosa</p>
        <h1 className="mt-2 text-xl font-bold">Panel del local</h1>
        <form noValidate onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="login-email" className="font-semibold">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="font-semibold">
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <div role="alert">
            {error && (
              <p id="login-error" className="rounded-xl bg-queso-claro px-4 py-2 text-sm font-semibold">
                {error}
              </p>
            )}
          </div>
          <button
            type="submit"
            aria-disabled={sending || undefined}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-rojo px-6 font-semibold text-white hover:bg-rojo-oscuro aria-disabled:opacity-60"
          >
            {sending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
