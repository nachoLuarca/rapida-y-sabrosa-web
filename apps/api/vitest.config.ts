import { defineConfig } from 'vitest/config'

// Tests de la API contra un PostgreSQL real (base rys_test). Antes de todo, test/global-setup.ts aplica las
// migraciones; cada archivo vacía la base y carga el seed (test/test-database.ts). Como comparten la base,
// los archivos corren uno tras otro.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
})
