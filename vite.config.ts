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
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Con un worker por núcleo (16 en Windows) algunas corridas se quedaban colgadas ~140 s;
      // con 2 son estables y además más rápidas.
      maxWorkers: 2,
    },
  }
})
