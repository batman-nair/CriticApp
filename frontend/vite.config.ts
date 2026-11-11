import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  // Vitest runs in 'test' mode and gets an owner from test.env below.
  if (mode !== 'test') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (!env.VITE_OWNER_USERNAME?.trim()) {
      throw new Error(
        'VITE_OWNER_USERNAME is not set. The dev server and the build need the ' +
          'username whose reviews the site shows. Set it in docker-compose.dev.yml, ' +
          'your shell, or frontend/.env.local.',
      )
    }
  }

  return {
    plugins: [react()],
    server: {
      allowedHosts: ['devbox'],
      proxy: {
        // Not the string shorthand: it sets changeOrigin, and Django's CSRF
        // origin check needs the browser's Host to reach it.
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      env: { VITE_OWNER_USERNAME: 'owner' },
    },
  }
})
