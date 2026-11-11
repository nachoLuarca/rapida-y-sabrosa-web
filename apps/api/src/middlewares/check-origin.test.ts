import { describe, expect, it } from 'vitest'
import { isLocalNetworkOrigin, isPrivateIPv4 } from './check-origin.ts'

const ALLOWED = ['http://localhost:5173', 'http://localhost:5174']

describe('isPrivateIPv4', () => {
  it.each(['10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.20'])('%s es de una red local', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1', '127.0.0.1', '169.254.1.1', '192.168.1.256', 'localhost', '::1'])(
    '%s no es de una red local',
    (ip) => {
      expect(isPrivateIPv4(ip)).toBe(false)
    },
  )
})

describe('isLocalNetworkOrigin', () => {
  it('acepta la IP de la red local con el puerto de la web o del panel', () => {
    expect(isLocalNetworkOrigin('http://192.168.1.20:5173', ALLOWED)).toBe(true)
    expect(isLocalNetworkOrigin('http://10.0.0.7:5174', ALLOWED)).toBe(true)
  })

  it.each([
    ['otro puerto', 'http://192.168.1.20:8080'],
    ['sin puerto', 'http://192.168.1.20'],
    ['https', 'https://192.168.1.20:5174'],
    ['una IP pública', 'http://8.8.8.8:5174'],
    ['un nombre de dominio', 'http://sitio-malo.example:5174'],
    ['con ruta', 'http://192.168.1.20:5174/panel'],
    ['algo que no es URL', 'null'],
  ])('rechaza %s', (_case, origin) => {
    expect(isLocalNetworkOrigin(origin, ALLOWED)).toBe(false)
  })

  it('toma los puertos de los orígenes permitidos', () => {
    expect(isLocalNetworkOrigin('http://192.168.1.20:4000', ['http://localhost:4000'])).toBe(true)
    expect(isLocalNetworkOrigin('http://192.168.1.20:5174', ['http://localhost:4000'])).toBe(false)
  })
})
