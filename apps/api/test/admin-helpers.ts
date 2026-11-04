import { randomUUID } from 'node:crypto'
import type { UserRole } from '@rys/contracts'
import type { Express } from 'express'
import request from 'supertest'
import type { Db } from '../src/db/client.ts'
import { UserRepository } from '../src/repositories/user-repository.ts'
import { UserService } from '../src/services/user-service.ts'

/** El origen del panel en desarrollo (está en ALLOWED_ORIGINS por defecto). */
export const PANEL_ORIGIN = 'http://localhost:5174'

export const TEST_PASSWORD = 'una-clave-de-prueba'

export async function createUser(db: Db, role: UserRole = 'staff', email = `${role}-${randomUUID().slice(0, 8)}@local.test`) {
  const user = await new UserService(new UserRepository(db)).create({ email, name: role === 'admin' ? 'Admin' : 'Caja', role, password: TEST_PASSWORD })
  return { ...user, password: TEST_PASSWORD }
}

/** Inicia sesión y devuelve el header Cookie para los requests siguientes. */
export async function login(app: Express, email: string, password = TEST_PASSWORD): Promise<string> {
  const response = await request(app).post('/api/admin/session').set('Origin', PANEL_ORIGIN).send({ email, password })
  if (response.status !== 200) throw new Error(`login respondió ${response.status}: ${JSON.stringify(response.body)}`)
  const cookie = ([] as string[]).concat(response.headers['set-cookie'] ?? []).find((value) => value.startsWith('rys_session='))
  if (!cookie) throw new Error('el login no devolvió la cookie rys_session')
  return cookie.split(';')[0]
}

/** El token que va en la cookie ("rys_session=TOKEN"). */
export const tokenOf = (cookie: string) => decodeURIComponent(cookie.slice('rys_session='.length))

/** Un pedido de retiro válido para POST /api/orders. */
export const pickupOrder = {
  lines: [{ productId: 'suprema', quantity: 1 }],
  customer: { name: 'Juan Pérez', phone: '912345678' },
  fulfillment: 'pickup',
  payment: 'cash',
  expectedTotal: 13000,
}

export const deliveryOrder = {
  lines: [
    { productId: 'suprema', quantity: 2 },
    { productId: 'arma-tu-pizza', ingredientIds: ['tocino', 'choclo'], quantity: 1 },
  ],
  customer: { name: 'Ana Rojas', phone: '987654321' },
  fulfillment: 'delivery',
  zoneId: 'islita',
  address: 'Los Aromos 123',
  payment: 'transfer',
  notes: 'timbre malo',
  expectedTotal: 41000,
}

export async function placeOrder(app: Express, body: object = pickupOrder): Promise<string> {
  const response = await request(app).post('/api/orders').set('Idempotency-Key', randomUUID()).send(body)
  if (response.status !== 201) throw new Error(`POST /api/orders respondió ${response.status}: ${JSON.stringify(response.body)}`)
  return response.body.code as string
}
