// Lógica pura de npm run demo: qué IP del notebook darle al celular y qué mostrar al final. Sin efectos: los tests
// (network.test.mjs, con node --test) le pasan interfaces de mentira.

/** Adaptadores que no son la red Wi-Fi del local: virtuales (WSL, Hyper-V, VirtualBox, Docker…) y VPN. */
const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|loopback|bluetooth|tun|tap|vpn|tailscale|zerotier|wireguard|hamachi/i

/** 10.0.0.0/8, 172.16.0.0/12 y 192.168.0.0/16 (la misma regla que acepta la API en modo demo). */
export function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

const rank = (name) => (/wi-?fi|wlan|wireless|inal[aá]mbrica/i.test(name) ? 0 : /ethernet|^eth|^en/i.test(name) ? 1 : 2)

/**
 * Las IP del notebook en la red local, la más probable primero (Wi-Fi, luego cable, luego el resto). Recibe lo que
 * devuelve os.networkInterfaces().
 */
export function localNetworkAddresses(interfaces) {
  const found = []
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (VIRTUAL.test(name)) continue
    for (const info of addresses ?? []) {
      const ipv4 = info.family === 'IPv4' || info.family === 4
      if (ipv4 && !info.internal && isPrivateIPv4(info.address)) found.push({ name, address: info.address })
    }
  }
  return found.sort((x, y) => rank(x.name) - rank(y.name))
}

/** Usuarios del panel que crea el seed en modo demo (los mismos de apps/api/src/db/seed-demo-users.ts). */
export const DEMO_USERS = [
  { email: 'admin@demo.local', role: 'administración: todo' },
  { email: 'caja@demo.local', role: 'caja: pedidos, agotados y pausa' },
]

/** El cuadro final de npm run demo, con las URL para el notebook y el celular. */
export function demoSummary({ addresses, webPort = 5173, panelPort = 5174 }) {
  const lines = [
    'Demo de Rápida y Sabrosa lista',
    '',
    'En este notebook',
    `  Web (carta):  http://localhost:${webPort}`,
    `  Panel:        http://localhost:${panelPort}`,
    '',
  ]
  if (addresses.length === 0) {
    lines.push(
      'Desde el celular: no encontré una red Wi-Fi.',
      '  Conecta el notebook a la misma red que el celular y vuelve a correr npm run demo.',
    )
  } else {
    const [main, ...others] = addresses
    lines.push(
      `Desde el celular (conectado al mismo Wi-Fi: ${main.name})`,
      `  Web (carta):  http://${main.address}:${webPort}`,
      `  Panel:        http://${main.address}:${panelPort}`,
    )
    if (others.length > 0) {
      lines.push(`  Si no abre, prueba con: ${others.map((other) => `http://${other.address}:${webPort} (${other.name})`).join(', ')}`)
    }
  }
  lines.push(
    '',
    'Usuarios del panel (contraseña: la de DEMO_PASSWORD en apps/api/.env)',
    ...DEMO_USERS.map((user) => `  ${user.email.padEnd(18)} ${user.role}`),
    '',
    'Si el celular no conecta: docs/DEMO.md, "Si el celular no conecta".',
    'Para empezar de cero: npm run demo:reset (con la demo andando o no). Ctrl+C cierra todo.',
  )
  const width = Math.max(...lines.map((line) => line.length))
  const rule = '─'.repeat(width + 4)
  return [rule, ...lines.map((line) => `  ${line}`), rule].join('\n')
}
