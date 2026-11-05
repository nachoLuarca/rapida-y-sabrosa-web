import { createHash } from 'node:crypto'
import { errorResponseSchema } from '@rys/contracts'
import { eq } from 'drizzle-orm'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adminUsers, sessions } from '../src/db/schema/index.ts'
import { seedDemoUsers } from '../src/db/seed-demo-users.ts'
import { AppError } from '../src/errors/app-error.ts'
import { requireRole } from '../src/middlewares/auth.ts'
import { errorHandler } from '../src/middlewares/error-handler.ts'
import { INVALID_CREDENTIALS_MESSAGE } from '../src/services/auth-service.ts'
import { UserRepository } from '../src/repositories/user-repository.ts'
import { UserInputError, UserService } from '../src/services/user-service.ts'
import { parseUserArgs } from '../src/scripts/user-args.ts'
import { createUser, login, PANEL_ORIGIN, TEST_PASSWORD, tokenOf } from './admin-helpers.ts'
import { reseed, silentLogger, truncateAll, useTestDatabase } from './test-database.ts'

const ctx = useTestDatabase()

beforeEach(async () => {
  await truncateAll(ctx.database)
  await reseed(ctx.database)
})

let now = new Date('2026-11-03T22:00:00Z')
const clock = () => now
afterEach(() => {
  now = new Date('2026-11-03T22:00:00Z')
})

const app = () => ctx.app({ clock })
const errorOf = (body: unknown) => errorResponseSchema.parse(body).error
const loginRequest = (body: object, origin: string | null = PANEL_ORIGIN, target = app()) => {
  const req = request(target).post('/api/admin/session').send(body)
  return origin ? req.set('Origin', origin) : req
}

describe('POST /api/admin/session (login)', () => {
  it('con email y contraseña correctos responde el usuario y setea la cookie de sesión', async () => {
    const user = await createUser(ctx.db, 'admin', 'admin@local.test')
    const response = await loginRequest({ email: '  ADMIN@local.test ', password: TEST_PASSWORD })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ user: { id: user.id, email: 'admin@local.test', name: 'Admin', role: 'admin' } })
    const cookie = String(response.headers['set-cookie'])
    expect(cookie).toMatch(/^rys_session=[\w-]{43};/)
    expect(cookie).toContain('Path=/api')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    // Fuera de producción la web va por HTTP: la cookie no puede ser Secure.
    expect(cookie).not.toContain('Secure')
    // Dura 12 horas.
    expect(cookie).toContain(`Expires=${new Date(now.getTime() + 12 * 3600_000).toUTCString()}`)
  })

  it('en producción la cookie es Secure', async () => {
    await createUser(ctx.db, 'staff', 'caja@local.test')
    const response = await loginRequest({ email: 'caja@local.test', password: TEST_PASSWORD }, PANEL_ORIGIN, ctx.app({ secureCookies: true }))
    expect(String(response.headers['set-cookie'])).toContain('Secure')
  })

  it('guarda solo el SHA-256 del token y la contraseña con argon2id', async () => {
    const user = await createUser(ctx.db, 'staff', 'caja@local.test')
    const cookie = await login(app(), 'caja@local.test')
    const [session] = await ctx.db.select().from(sessions)
    expect(session?.tokenHash).toBe(createHash('sha256').update(tokenOf(cookie)).digest('hex'))
    expect(session?.tokenHash).not.toContain(tokenOf(cookie))
    const [row] = await ctx.db.select().from(adminUsers).where(eq(adminUsers.id, user.id))
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('contraseña mala, email que no existe y usuario desactivado reciben el mismo error', async () => {
    const user = await createUser(ctx.db, 'staff', 'caja@local.test')
    const wrongPassword = await loginRequest({ email: 'caja@local.test', password: 'otra-clave-cualquiera' })
    const unknownEmail = await loginRequest({ email: 'nadie@local.test', password: TEST_PASSWORD })
    await ctx.db.update(adminUsers).set({ active: false }).where(eq(adminUsers.id, user.id))
    const inactive = await loginRequest({ email: 'caja@local.test', password: TEST_PASSWORD })

    for (const response of [wrongPassword, unknownEmail, inactive]) {
      expect(response.status).toBe(401)
      expect(errorOf(response.body)).toMatchObject({ code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE, details: {} })
      expect(response.headers['set-cookie']).toBeUndefined()
    }
    expect(await ctx.db.$count(sessions)).toBe(0)
  })

  it('después de 5 intentos fallidos por IP responde 429 por 15 minutos; los correctos no cuentan', async () => {
    await createUser(ctx.db, 'staff', 'caja@local.test')
    const target = app()
    // Entrar bien no suma intentos.
    for (let i = 0; i < 3; i += 1) expect((await loginRequest({ email: 'caja@local.test', password: TEST_PASSWORD }, PANEL_ORIGIN, target)).status).toBe(200)
    for (let i = 0; i < 5; i += 1) expect((await loginRequest({ email: 'caja@local.test', password: 'mala-mala-mala' }, PANEL_ORIGIN, target)).status).toBe(401)
    const blocked = await loginRequest({ email: 'caja@local.test', password: TEST_PASSWORD }, PANEL_ORIGIN, target)
    expect(blocked.status).toBe(429)
    expect(errorOf(blocked.body).code).toBe('RATE_LIMITED')
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(14 * 60)
  })

  it('sin Origin o desde un origen ajeno responde 403 INVALID_ORIGIN, aunque la contraseña sea correcta', async () => {
    await createUser(ctx.db, 'staff', 'caja@local.test')
    for (const origin of [null, 'https://sitio-ajeno.example']) {
      const response = await loginRequest({ email: 'caja@local.test', password: TEST_PASSWORD }, origin)
      expect(response.status).toBe(403)
      expect(errorOf(response.body).code).toBe('INVALID_ORIGIN')
    }
    expect(await ctx.db.$count(sessions)).toBe(0)
  })

  it('valida el body', async () => {
    const response = await loginRequest({ email: '' })
    expect(response.status).toBe(400)
    expect(errorOf(response.body).code).toBe('VALIDATION_ERROR')
  })
})

describe('sesión', () => {
  it('GET /api/admin/me sin cookie responde 401 UNAUTHENTICATED; con cookie, el usuario', async () => {
    const user = await createUser(ctx.db, 'staff', 'caja@local.test')
    const anonymous = await request(app()).get('/api/admin/me')
    expect(anonymous.status).toBe(401)
    expect(errorOf(anonymous.body)).toMatchObject({ code: 'UNAUTHENTICATED', message: 'Inicia sesión para continuar.' })

    const cookie = await login(app(), 'caja@local.test')
    const me = await request(app()).get('/api/admin/me').set('Cookie', cookie)
    expect(me.status).toBe(200)
    expect(me.body.user).toMatchObject({ id: user.id, role: 'staff' })
  })

  it('una cookie inventada no sirve', async () => {
    const response = await request(app()).get('/api/admin/me').set('Cookie', 'rys_session=inventado')
    expect(response.status).toBe(401)
  })

  it('una sesión vencida responde 401 y se borra', async () => {
    await createUser(ctx.db, 'staff', 'caja@local.test')
    const cookie = await login(app(), 'caja@local.test')
    now = new Date(now.getTime() + 12 * 3600_000 + 1000)
    expect((await request(app()).get('/api/admin/me').set('Cookie', cookie)).status).toBe(401)
    expect(await ctx.db.$count(sessions)).toBe(0)
  })

  it('se renueva con el uso: después de un rato, cada request corre el vencimiento 12 horas más', async () => {
    await createUser(ctx.db, 'staff', 'caja@local.test')
    const cookie = await login(app(), 'caja@local.test')

    now = new Date(now.getTime() + 11 * 3600_000)
    const used = await request(app()).get('/api/admin/me').set('Cookie', cookie)
    expect(String(used.headers['set-cookie'])).toContain(`Expires=${new Date(now.getTime() + 12 * 3600_000).toUTCString()}`)

    // 11 horas después del uso (22 desde el login) sigue viva.
    now = new Date(now.getTime() + 11 * 3600_000)
    expect((await request(app()).get('/api/admin/me').set('Cookie', cookie)).status).toBe(200)
  })

  it('el logout borra la sesión en la base y la cookie; el token viejo ya no sirve', async () => {
    await createUser(ctx.db, 'staff', 'caja@local.test')
    const cookie = await login(app(), 'caja@local.test')
    const logout = await request(app()).delete('/api/admin/session').set('Cookie', cookie).set('Origin', PANEL_ORIGIN)
    expect(logout.status).toBe(204)
    expect(String(logout.headers['set-cookie'])).toMatch(/^rys_session=;.*Expires=Thu, 01 Jan 1970/)
    expect(await ctx.db.$count(sessions)).toBe(0)
    expect((await request(app()).get('/api/admin/me').set('Cookie', cookie)).status).toBe(401)
  })

  it('el logout desde un origen ajeno responde 403 y no cierra la sesión', async () => {
    await createUser(ctx.db, 'staff', 'caja@local.test')
    const cookie = await login(app(), 'caja@local.test')
    const response = await request(app()).delete('/api/admin/session').set('Cookie', cookie).set('Origin', 'https://ajeno.example')
    expect(response.status).toBe(403)
    expect(await ctx.db.$count(sessions)).toBe(1)
  })

  it('desactivar un usuario invalida todas sus sesiones', async () => {
    const user = await createUser(ctx.db, 'staff', 'caja@local.test')
    const phone = await login(app(), 'caja@local.test')
    const notebook = await login(app(), 'caja@local.test')
    expect(await ctx.db.$count(sessions)).toBe(2)

    await ctx.db.update(adminUsers).set({ active: false }).where(eq(adminUsers.id, user.id))
    expect((await request(app()).get('/api/admin/me').set('Cookie', phone)).status).toBe(401)
    expect(await ctx.db.$count(sessions)).toBe(0)
    expect((await request(app()).get('/api/admin/me').set('Cookie', notebook)).status).toBe(401)
  })
})

describe('requireRole', () => {
  // Las rutas solo de admin llegan en la Fase 9; el middleware se prueba aquí con una ruta propia.
  const appWithRoles = (role: 'admin' | 'staff' | null) => {
    const test = express()
    test.use((req, _res, next) => {
      if (role) req.user = { id: '3f0e0b8c-6d3f-4a51-9c5e-2b1b5a1f8a10', email: 'x@local.test', name: 'X', role }
      next()
    })
    test.get('/solo-admin', requireRole('admin'), (_req, res) => {
      res.json({ ok: true })
    })
    test.use(errorHandler(silentLogger))
    return test
  }

  it('deja pasar al rol permitido y responde 403 FORBIDDEN al otro, o 401 sin sesión', async () => {
    expect((await request(appWithRoles('admin')).get('/solo-admin')).status).toBe(200)
    const staff = await request(appWithRoles('staff')).get('/solo-admin')
    expect(staff.status).toBe(403)
    expect(errorOf(staff.body).code).toBe('FORBIDDEN')
    expect((await request(appWithRoles(null)).get('/solo-admin')).status).toBe(401)
    expect(new AppError('FORBIDDEN', 'x').status).toBe(403)
  })
})

describe('usuarios', () => {
  const service = () => new UserService(new UserRepository(ctx.db))

  it('user:create exige email, nombre y rol; la contraseña, mínimo 10 caracteres; el email no se repite', async () => {
    expect(parseUserArgs(['--email', 'Caja@Local.cl', '--name', 'Caja', '--role', 'STAFF'])).toEqual({
      email: 'Caja@Local.cl',
      name: 'Caja',
      role: 'staff',
    })
    expect(parseUserArgs(['--email=caja@local.cl', '--name=Caja Uno', '--role=admin']).name).toBe('Caja Uno')
    expect(() => parseUserArgs(['--email', 'x@y.cl'])).toThrow('Falta --name, --role.')
    expect(() => parseUserArgs(['--email', 'x@y.cl', '--name', 'X', '--role', 'jefe'])).toThrow('El rol debe ser admin o staff.')

    const created = await service().create({ email: ' Caja@Local.cl ', name: ' Caja ', role: 'staff', password: 'diez-letras' })
    expect(created).toMatchObject({ email: 'caja@local.cl', name: 'Caja', role: 'staff' })
    await expect(service().create({ email: 'caja@local.cl', name: 'Otra', role: 'admin', password: 'diez-letras' })).rejects.toThrow(
      UserInputError,
    )
    await expect(service().create({ email: 'otra@local.cl', name: 'Otra', role: 'staff', password: 'corta' })).rejects.toThrow(
      'La contraseña debe tener al menos 10 caracteres.',
    )
    await expect(service().create({ email: 'no-es-email', name: 'Otra', role: 'staff', password: 'diez-letras' })).rejects.toThrow(
      'no es un email válido',
    )
  })

  it('en modo demo el seed crea admin@demo.local y caja@demo.local con DEMO_PASSWORD', async () => {
    const created = await seedDemoUsers(ctx.db, 'clave-de-la-demo')
    expect(created.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: 'admin@demo.local', role: 'admin' },
      { email: 'caja@demo.local', role: 'staff' },
    ])
    expect(await login(app(), 'caja@demo.local', 'clave-de-la-demo')).toMatch(/^rys_session=/)
    // Correrlo de nuevo no los duplica ni les cambia la contraseña; el modo reset sí.
    expect(await seedDemoUsers(ctx.db, 'otra-clave-de-demo')).toEqual([])
    expect(await login(app(), 'admin@demo.local', 'clave-de-la-demo')).toMatch(/^rys_session=/)
    await seedDemoUsers(ctx.db, 'otra-clave-de-demo', 'reset')
    expect(await login(app(), 'admin@demo.local', 'otra-clave-de-demo')).toMatch(/^rys_session=/)
  })
})
