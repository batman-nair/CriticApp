import { expect, test, type Page, type Route } from '@playwright/test'
import type { components } from '../src/api/schema.d.ts'

// Smoke test for the production image: nginx serving the built app. Every
// /api call and poster request is answered here, so nothing leaves the
// machine.

type Schemas = components['schemas']

const POSTER_URL =
  'https://images.igdb.com/igdb/image/upload/t_cover_big/smoke.jpg'
// A 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const review: Schemas['Review'] = {
  id: 1,
  user: { username: 'ci-owner' },
  item: {
    id: 'igdb:1',
    category: 'game',
    title: 'Smoke Test Quest',
    // On an allowed host, so the poster goes through the CSP.
    image_url: POSTER_URL,
    start_year: 2020,
    end_year: null,
    genres: ['Adventure'],
    creators: ['Smoke Studio'],
    languages: ['English'],
    description: 'A game that only exists in the smoke test.',
    provider_rating: 8.1,
    details: { platforms: ['PC'] },
  },
  rating: 8.5,
  text: 'Checks that the image works.',
  tags: [],
  created_at: '2025-03-01T12:00:00Z',
  updated_at: '2025-03-02T12:00:00Z',
}

const responses: Record<string, unknown> = {
  '/api/auth/session': {
    data: { user: null },
    meta: {},
  } satisfies Schemas['SessionDataResponse'],
  '/api/v3/categories': {
    data: [
      {
        id: 'game',
        label: 'Games',
        source: 'IGDB',
        rating_label: 'IGDB',
        subcategories: [],
      },
    ],
    meta: {},
  } satisfies Schemas['CategoryListResponse'],
  '/api/v3/reviews': {
    data: [review],
    meta: { pagination: { count: 1, limit: 20, offset: 0 } },
  } satisfies Schemas['ReviewPageResponse'],
  '/api/v3/reviews/facets': {
    data: {
      total: 1,
      categories: [{ id: 'game', count: 1 }],
      languages: [{ name: 'English', count: 1 }],
    },
    meta: {},
  } satisfies Schemas['ReviewFacetsResponse'],
  '/api/v3/reviews/1': {
    data: review,
    meta: {},
  } satisfies Schemas['ReviewResponse'],
}

async function answerApi(route: Route) {
  const { pathname } = new URL(route.request().url())
  if (pathname === '/api/auth/csrf') return route.fulfill({ status: 204 })
  const body = responses[pathname]
  if (body) return route.fulfill({ json: body })
  // An unexpected call shows up as a console error, which fails the test.
  return route.fulfill({
    status: 404,
    json: {
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: `Not mocked in the smoke test: ${pathname}`,
    } satisfies Schemas['Problem'],
  })
}

async function expectThemeSet(page: Page) {
  // Set by the inline script, so it ran under the CSP.
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    /^(light|dark)$/,
  )
}

test.describe('pages', () => {
  let errors: string[] = []

  test.beforeEach(async ({ page }) => {
    errors = []
    // CSP violations ("Refused to ...") and failed loads are console errors.
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/**', answerApi)
    await page.route('https://images.igdb.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: PNG }),
    )
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('the list renders', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Smoke Test Quest' }),
    ).toBeVisible()
    await expect(page.locator(`img[src="${POSTER_URL}"]`)).toBeVisible()
    await expectThemeSet(page)
  })

  test('a review loads directly by its URL', async ({ page }) => {
    const response = await page.goto('/reviews/1')
    expect(response?.status()).toBe(200)
    await expect(
      page
        .getByRole('dialog')
        .getByRole('heading', { name: 'Smoke Test Quest' }),
    ).toBeVisible()
    await expectThemeSet(page)
  })

  test('an unknown URL shows the 404 page', async ({ page }) => {
    const response = await page.goto('/no-such-page')
    // The app decides what is a page, so nginx answers 200.
    expect(response?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { name: /isn’t on the shelf/ }),
    ).toBeVisible()
  })
})

test('the HTML revalidates and hashed assets are cached for a year', async ({
  request,
}) => {
  const page = await request.get('/')
  expect(page.headers()['cache-control']).toBe('no-cache')

  const html = await page.text()
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
    (match) => match[1] ?? '',
  )
  expect(assets.some((path) => path.endsWith('.js'))).toBe(true)
  expect(assets.some((path) => path.endsWith('.css'))).toBe(true)
  for (const path of assets) {
    const asset = await request.get(path)
    expect(asset.status(), path).toBe(200)
    expect(asset.headers()['cache-control'], path).toBe(
      'public, max-age=31536000, immutable',
    )
  }

  // Not index.html: that would be cached for a year under an asset's name.
  const missing = await request.get('/assets/does-not-exist.js')
  expect(missing.status()).toBe(404)
})

test('security headers, gzip and the health check', async ({ request }) => {
  const health = await request.get('/healthz')
  expect(health.status()).toBe(200)

  const html = await (await request.get('/')).text()
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? ''
  expect(script).not.toBe('')

  for (const path of ['/', script, '/assets/does-not-exist.js']) {
    const headers = (await request.get(path)).headers()
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['referrer-policy'], path).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(headers['content-security-policy'], path).toContain(
      "script-src 'self' 'sha256-",
    )
  }

  const gzipped = await request.get(script, {
    headers: { 'Accept-Encoding': 'gzip' },
  })
  expect(gzipped.headers()['content-encoding']).toBe('gzip')
  expect(gzipped.headers()['vary']).toBe('Accept-Encoding')

  const manifest = await request.get('/site.webmanifest')
  expect(manifest.headers()['content-type']).toBe('application/manifest+json')
})
