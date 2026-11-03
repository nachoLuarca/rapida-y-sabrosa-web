// npm run dev: levanta a la vez la API (tsx en modo watch) y la web (Vite), con el prefijo [api] o [web] en cada
// línea. Requiere la base arriba (npm run db:up); si no lo está, la API lo explica y termina, y la web sigue.
// Ctrl+C cierra los dos, incluidos sus procesos hijos.
import { spawn, spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'

const tasks = [
  { name: 'api', color: 36, workspace: 'apps/api' },
  { name: 'web', color: 35, workspace: 'apps/web' },
]

const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const label = (task) => (useColor ? `\x1b[${task.color}m[${task.name}]\x1b[0m` : `[${task.name}]`)

/** Escribe cada línea completa con su prefijo; guarda el resto hasta que llegue el salto de línea. */
function pipeWithPrefix(stream, task, output) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    const lines = (pending + chunk).split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) output.write(`${label(task)} ${line}\n`)
  })
  stream.on('end', () => {
    if (pending) output.write(`${label(task)} ${pending}\n`)
  })
}

const running = new Map()
let stopping = false

// Los hijos escriben a un pipe, no a la terminal: hay que decirles explícitamente si usar colores.
const childEnv = { ...process.env }
if (useColor) childEnv.FORCE_COLOR = '1'
else {
  delete childEnv.FORCE_COLOR
  childEnv.NO_COLOR = '1'
}

for (const task of tasks) {
  // Un solo string con la shell: en Windows npm es npm.cmd, y así Node no advierte por argumentos sin escapar.
  const child = spawn(`npm run dev --workspace ${task.workspace}`, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  })
  running.set(task.name, child)
  pipeWithPrefix(child.stdout, task, process.stdout)
  pipeWithPrefix(child.stderr, task, process.stderr)
  child.on('exit', (code, signal) => {
    running.delete(task.name)
    if (!stopping) console.log(`${label(task)} terminó (${signal ?? `código ${code}`}).`)
    if (running.size === 0) process.exit(stopping ? 0 : (code ?? 1))
  })
}

/** Cierra cada proceso con todos sus hijos (npm → node → tsx/vite). */
function stopAll() {
  if (stopping) return
  stopping = true
  for (const child of running.values()) {
    if (child.pid === undefined) continue
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
  }
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)
process.on('exit', stopAll)
