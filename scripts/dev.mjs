// npm run dev: levanta a la vez la API (tsx en modo watch), la web y el panel (Vite), con el prefijo [api], [web] o
// [panel] en cada línea. Requiere la base arriba (npm run db:up); si no lo está, la API lo explica y termina, y la web
// y el panel siguen. Ctrl+C cierra los tres, incluidos sus procesos hijos.
import { startTasks } from './lib/processes.mjs'

startTasks([
  { name: 'api', color: 36, command: 'npm run dev --workspace apps/api' },
  { name: 'web', color: 35, command: 'npm run dev --workspace apps/web' },
  { name: 'panel', color: 33, command: 'npm run dev --workspace apps/admin' },
])
