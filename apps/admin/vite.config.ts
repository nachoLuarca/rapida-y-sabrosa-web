/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Panel del local (ADR-005): app aparte, puerto 5174. En desarrollo /api va a la API por el proxy: el panel y la
// API comparten origen, así la cookie de sesión funciona sin configuración extra y el SSE pasa directo.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', xfwd: true } },
  },
  preview: { port: 4174 },
  test: {
    css: false,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15_000,
  },
})
