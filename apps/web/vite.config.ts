/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// En la demo todo va en un solo index.html, así que el favicon se incrusta como data URI.
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml(html) {
      const svg = readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf8')
      const dataUri = `data:image/svg+xml,${encodeURIComponent(svg.trim())}`
      return html.replace(/href="[^"]*favicon\.svg"/, `href="${dataUri}"`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDemo = mode === 'demo'

  return {
    plugins: [react(), tailwindcss(), ...(isDemo ? [viteSingleFile(), inlineFavicon()] : [])],
    build: isDemo ? { outDir: 'dist-demo', copyPublicDir: false } : {},
    // En desarrollo /api va a la API: la web y la API comparten origen y no hace falta CORS. La web todavía
    // no la usa (eso llega en la Fase 7). API_PROXY_TARGET permite apuntar a otro puerto.
    server: {
      proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000' } },
    },
    test: {
      css: false,
      // Los tests no dependen de ningún .env local: siempre corren en modo normal y con el número del local.
      // Los del modo demo lo activan explícitamente (ver src/demo-mode.test.tsx).
      env: { VITE_DEMO: 'false', VITE_WHATSAPP_NUMBER: '56974314602' },
      projects: [
        // Lógica pura: sin jsdom ni Testing Library, que son lo más caro de levantar.
        { extends: true, test: { name: 'logica', environment: 'node', include: ['src/**/*.test.ts'] } },
        {
          extends: true,
          test: {
            name: 'ui',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['./src/test/setup.ts'],
            // Son CPU pura en jsdom: en un notebook a batería los más pesados rozan los 5 s por defecto.
            testTimeout: 15_000,
          },
        },
      ],
    },
  }
})
