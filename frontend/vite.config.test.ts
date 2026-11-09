// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer, resolveConfig, type ViteDevServer } from 'vite'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'

const seen: { url?: string; host?: string }[] = []
let upstream: http.Server
let vite: ViteDevServer

function get(path: string, host: string) {
  const { port } = vite.httpServer!.address() as AddressInfo
  return new Promise<number>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      .on('error', reject)
  })
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, host: req.headers.host })
    res.end('{}')
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const { port } = upstream.address() as AddressInfo
  vi.stubEnv('VITE_API_PROXY_TARGET', `http://127.0.0.1:${port}`)
  vite = await createServer({
    configFile: 'vite.config.ts',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0, watch: null },
  })
  await vite.listen()
  vi.unstubAllEnvs()
})

afterEach(() => {
  seen.length = 0
})

afterAll(async () => {
  await vite.close()
  upstream.close()
})

it('forwards /api to the target and keeps the browser Host for the CSRF check', async () => {
  expect(await get('/api/v3/categories', 'devbox:5173')).toBe(200)
  expect(seen).toEqual([{ url: '/api/v3/categories', host: 'devbox:5173' }])
})

it('rejects unknown hosts', async () => {
  expect(await get('/api/v3/categories', 'evil.example:5173')).toBe(403)
  expect(seen).toEqual([])
})

it('defaults the proxy target to localhost:8000', async () => {
  vi.stubEnv('VITE_API_PROXY_TARGET', undefined)
  const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'serve')
  vi.unstubAllEnvs()
  expect(config.server.proxy?.['/api']).toMatchObject({
    target: 'http://localhost:8000',
  })
})
