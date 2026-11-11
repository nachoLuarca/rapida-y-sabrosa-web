import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { demoSummary, isPrivateIPv4, localNetworkAddresses } from './network.mjs'

const ipv4 = (address, internal = false) => ({ family: 'IPv4', address, internal })

describe('isPrivateIPv4', () => {
  it('reconoce las redes locales', () => {
    for (const ip of ['10.0.0.5', '172.16.0.1', '172.31.0.1', '192.168.1.8']) assert.equal(isPrivateIPv4(ip), true, ip)
    for (const ip of ['8.8.8.8', '172.32.0.1', '127.0.0.1', '169.254.3.4', '192.168.1', '192.168.1.300']) {
      assert.equal(isPrivateIPv4(ip), false, ip)
    }
  })
})

describe('localNetworkAddresses', () => {
  it('pone el Wi-Fi primero y deja fuera la VPN, WSL y la interfaz interna (el caso de este notebook)', () => {
    const interfaces = {
      ProTUN: [ipv4('10.2.0.2')],
      'Wi-Fi': [{ family: 'IPv6', address: 'fe80::1', internal: false }, ipv4('192.168.1.8')],
      'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true)],
      'vEthernet (WSL (Hyper-V firewall))': [ipv4('172.27.48.1')],
    }
    assert.deepEqual(localNetworkAddresses(interfaces), [{ name: 'Wi-Fi', address: '192.168.1.8' }])
  })

  it('ordena Wi-Fi, cable y el resto, y acepta family numérica', () => {
    const interfaces = {
      Otra: [ipv4('10.0.0.9')],
      Ethernet: [{ family: 4, address: '192.168.0.20', internal: false }],
      wlan0: [ipv4('192.168.1.30')],
      'VirtualBox Host-Only Network': [ipv4('192.168.56.1')],
    }
    assert.deepEqual(
      localNetworkAddresses(interfaces).map((found) => found.name),
      ['wlan0', 'Ethernet', 'Otra'],
    )
  })

  it('sin red local devuelve una lista vacía', () => {
    assert.deepEqual(localNetworkAddresses({ 'Wi-Fi': [ipv4('200.1.2.3')] }), [])
    assert.deepEqual(localNetworkAddresses({}), [])
  })
})

describe('demoSummary', () => {
  it('muestra las URL del notebook y del celular, y los usuarios sin la contraseña', () => {
    const text = demoSummary({ addresses: [{ name: 'Wi-Fi', address: '192.168.1.8' }] })
    assert.match(text, /http:\/\/localhost:5173/)
    assert.match(text, /http:\/\/localhost:5174/)
    assert.match(text, /mismo Wi-Fi: Wi-Fi/)
    assert.match(text, /http:\/\/192\.168\.1\.8:5173/)
    assert.match(text, /http:\/\/192\.168\.1\.8:5174/)
    assert.match(text, /admin@demo\.local/)
    assert.match(text, /caja@demo\.local/)
    assert.match(text, /DEMO_PASSWORD en apps\/api\/\.env/)
  })

  it('ofrece las otras IP por si la primera no abre', () => {
    const text = demoSummary({
      addresses: [
        { name: 'Wi-Fi', address: '192.168.1.8' },
        { name: 'Ethernet', address: '10.0.0.4' },
      ],
    })
    assert.match(text, /Si no abre, prueba con: http:\/\/10\.0\.0\.4:5173 \(Ethernet\)/)
  })

  it('sin red local explica qué hacer', () => {
    assert.match(demoSummary({ addresses: [] }), /no encontré una red Wi-Fi/)
  })
})
