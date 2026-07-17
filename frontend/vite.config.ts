import { readFileSync } from 'node:fs'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    define: {
      'import.meta.env.VITE_PRODUCT_VERSION': JSON.stringify(rootPackage.version),
    },
    build: {
      manifest: 'asset-manifest.json',
    },
    plugins: [tailwindcss(), react()],
    server: {
      allowedHosts: ['.127.0.0.1.nip.io'],
      proxy: {
        '/api': {
          changeOrigin: false,
          target: env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:3301',
        },
      },
    },
    test: {
      environment: 'jsdom',
      fileParallelism: false,
      isolate: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
