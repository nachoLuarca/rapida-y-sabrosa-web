// Procesos de npm run dev y npm run demo: cada uno con el prefijo [api], [web] o [panel] en sus líneas, y Ctrl+C
// cierra todos con sus hijos (npm → node → tsx/vite). En Windows eso exige taskkill /T: si no, los hijos sobreviven.
import { spawn, spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
export const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

export const label = (task) => (useColor ? `\x1b[${task.color}m[${task.name}]\x1b[0m` : `[${task.name}]`)

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

/** El entorno de los hijos: escriben a un pipe, no a la terminal, así que hay que decirles si usar colores. */
export function childEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  if (useColor) env.FORCE_COLOR = '1'
  else {
    delete env.FORCE_COLOR
    env.NO_COLOR = '1'
  }
  return env
}

/** Corre un comando hasta que termine, con la salida directo a la terminal. Devuelve true si salió bien. */
export function runStep(command, { env } = {}) {
  // Un solo string con la shell: en Windows npm es npm.cmd, y así Node no advierte por argumentos sin escapar.
  const result = spawnSync(command, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } })
  return result.status === 0
}

/**
 * Levanta las tareas ({ name, color, command }) a la vez. Con `stopOnExit`, si una termina sola se cierran todas
 * (en la demo no sirve una web sin API); si no, las demás siguen (en desarrollo).
 */
export function startTasks(tasks, { env = {}, stopOnExit = false } = {}) {
  const running = new Map()
  let stopping = false
  // Una tarea terminó sola en la demo: se cierra todo y se sale con error.
  let failed = false

  function stopAll() {
    if (stopping) return
    stopping = true
    for (const child of running.values()) {
      if (child.pid === undefined) continue
      if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      else child.kill('SIGTERM')
    }
  }

  for (const task of tasks) {
    const child = spawn(task.command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(env) })
    running.set(task.name, child)
    pipeWithPrefix(child.stdout, task, process.stdout)
    pipeWithPrefix(child.stderr, task, process.stderr)
    child.on('exit', (code, signal) => {
      running.delete(task.name)
      if (!stopping) {
        console.log(`${label(task)} terminó (${signal ?? `código ${code}`}).`)
        if (stopOnExit) {
          console.log('La demo necesita la API, la web y el panel: cerrando todo.')
          failed = true
          stopAll()
        }
      }
      if (running.size === 0) process.exit(failed ? 1 : stopping ? 0 : (code ?? 1))
    })
  }

  process.on('SIGINT', stopAll)
  process.on('SIGTERM', stopAll)
  process.on('exit', stopAll)
  return { stopAll }
}
