// npm run demo: la demo full stack para mostrarle al local (docs/DEMO.md). Levanta PostgreSQL, migra, siembra con
// DEMO_MODE=true, compila la web (en modo api) y el panel, y los sirve con la API para toda la red local: el celular
// pide por http://IP-del-notebook:5173 y el pedido llega al panel. Al final muestra las URL y los usuarios.
// Ctrl+C cierra todo. La base queda arriba (npm run db:down la baja).
import { existsSync } from 'node:fs'
import { get } from 'node:http'
import { connect } from 'node:net'
import { networkInterfaces } from 'node:os'
import { demoSummary, localNetworkAddresses } from './lib/network.mjs'
import { runStep, startTasks } from './lib/processes.mjs'

const API_PORT = 3000
const WEB_PORT = 5173
const PANEL_PORT = 5174
const READY_TIMEOUT_MS = 90_000

// Las variables del entorno mandan sobre apps/api/.env: la demo siempre corre en modo demo, y con los logs de la API
// en warn para que las URL del final no se pierdan entre los requests (salvo que se pida otro nivel).
const DEMO_ENV = { DEMO_MODE: 'true', LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn' }

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

/** ¿Algo escucha ya en ese puerto? Se prueba por IPv4 y por IPv6: Vite en desarrollo suele escuchar solo en ::1. */
function portInUse(port) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const socket = connect({ port, host })
      socket.setTimeout(1000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('error', () => resolve(false))
    })
  return Promise.all([tryHost('127.0.0.1'), tryHost('::1')]).then((results) => results.some(Boolean))
}

/**
 * ¿La URL responde 200? Con node:http y leyendo la respuesta entera: fetch (undici) se cae con un AssertionError
 * cuando la respuesta queda sin leer y el servidor cierra la conexión.
 */
function responds(url) {
  return new Promise((resolve) => {
    const req = get(url, { timeout: 2000 }, (res) => {
      res.resume()
      res.once('end', () => resolve(res.statusCode === 200))
      res.once('error', () => resolve(false))
    })
    req.once('timeout', () => req.destroy())
    req.once('error', () => resolve(false))
  })
}

/** Espera a cada grupo de URL en orden (primero la API, así el proxy de la web no reclama mientras arranca). */
async function waitUntilReady(groups) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  for (const urls of groups) {
    const pending = new Set(urls)
    while (pending.size > 0) {
      if (Date.now() > deadline) return false
      for (const url of [...pending]) if (await responds(url)) pending.delete(url)
      if (pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  return true
}

function step(title, command, env) {
  console.log(`\n» ${title}`)
  if (!runStep(command, { env })) fail(`No se pudo terminar este paso: ${title.replace(/…$/, '').toLowerCase()}. Revisa el mensaje de arriba.`)
}

if (!existsSync(new URL('../apps/api/.env', import.meta.url))) {
  fail(
    'Falta apps/api/.env. Cópialo desde apps/api/.env.example y define DEMO_PASSWORD (la contraseña de los usuarios ' +
      'de demo del panel, mínimo 10 caracteres).',
  )
}

for (const port of [API_PORT, WEB_PORT, PANEL_PORT]) {
  if (await portInUse(port)) {
    fail(`El puerto ${port} ya está en uso. Cierra npm run dev (u otra demo) con Ctrl+C y vuelve a correr npm run demo.`)
  }
}

step('Levantando PostgreSQL…', 'npm run db:up')
step('Aplicando las migraciones…', 'npm run db:migrate', DEMO_ENV)
step('Cargando lo que falte de la carta y los usuarios de demo…', 'npm run db:seed', DEMO_ENV)
step('Compilando la web (con la API)…', 'npm run build:api --workspace apps/web')
step('Compilando el panel…', 'npm run build --workspace apps/admin')

console.log('\n» Levantando la API, la web y el panel para la red local…\n')
// --logLevel warn: Vite no lista sus propias URL (incluiría las de la VPN o WSL); las correctas van en el resumen.
const preview = (port) => `-- --host --port ${port} --strictPort --logLevel warn`
const { stopAll } = startTasks(
  [
    { name: 'api', color: 36, command: 'npm run start --workspace apps/api' },
    { name: 'web', color: 35, command: `npm run preview:api --workspace apps/web ${preview(WEB_PORT)}` },
    { name: 'panel', color: 33, command: `npm run preview --workspace apps/admin ${preview(PANEL_PORT)}` },
  ],
  { env: DEMO_ENV, stopOnExit: true },
)

const ready = await waitUntilReady([
  [`http://localhost:${API_PORT}/health`],
  [
    `http://localhost:${WEB_PORT}/`,
    `http://localhost:${PANEL_PORT}/`,
    // La web y el panel llegan a la API por su proxy.
    `http://localhost:${WEB_PORT}/api/menu`,
  ],
])
if (!ready) {
  console.error('\nLa demo no respondió a tiempo. Revisa los mensajes de arriba.')
  stopAll()
  process.exitCode = 1
} else {
  const addresses = localNetworkAddresses(networkInterfaces())
  console.log(`\n${demoSummary({ addresses, webPort: WEB_PORT, panelPort: PANEL_PORT })}\n`)
}
