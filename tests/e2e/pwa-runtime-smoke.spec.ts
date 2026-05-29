import { expect, test } from '@playwright/test'

test('serves install shell metadata used by installed PWAs', async ({
  request,
}) => {
  const response = await request.get('/')

  expect(response.ok()).toBe(true)

  const html = await response.text()

  expect(html).toContain(
    'rel="manifest" href="/api/tenant/manifest.webmanifest"',
  )
  expect(html).toContain('rel="apple-touch-icon"')
  expect(html).toContain('name="mobile-web-app-capable" content="yes"')
  expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"')
  expect(html).toContain(
    'name="apple-mobile-web-app-status-bar-style" content="default"',
  )
  expect(html).toContain('name="theme-color" content="#112540"')
  expect(html).toContain('viewport-fit=cover')
})

test('serves the PWA manifest with installable app metadata', async ({
  request,
}) => {
  const response = await request.get('/api/tenant/manifest.webmanifest')

  expect(response.ok()).toBe(true)
  expect(response.headers()['cache-control']).toBe('no-store')

  const manifest = (await response.json()) as {
    display?: string
    id?: string
    icons?: Array<{ purpose?: string; sizes?: string; src?: string }>
    name?: string
    scope?: string
    short_name?: string
    start_url?: string
    theme_color?: string
  }

  expect(manifest).toMatchObject({
    display: 'standalone',
    scope: '/',
    start_url: '/',
    theme_color: '#112540',
  })
  expect(manifest.id).toMatch(/\/$/)
  expect(manifest.name).toContain('Личный кабинет')
  expect(manifest.short_name).toBeTruthy()
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sizes: '192x192',
        src: expect.stringMatching(/^\/api\/tenant\/icons\/icon-192\.png\?v=/),
      }),
      expect.objectContaining({
        purpose: 'maskable',
        sizes: '512x512',
        src: expect.stringMatching(
          /^\/api\/tenant\/icons\/icon-maskable-512\.png\?v=/,
        ),
      }),
    ]),
  )
})

test('serves PWA icon assets referenced by the manifest', async ({
  request,
}) => {
  for (const iconPath of [
    '/pwa-icons/icon-192.png',
    '/pwa-icons/icon-512.png',
    '/pwa-icons/icon-maskable-512.png',
    '/apple-touch-icon.png',
    '/api/tenant/apple-touch-icon.png',
    '/api/tenant/icons/icon-192.png?v=fallback',
  ]) {
    const response = await request.get(iconPath)

    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  }
})

test('serves service worker foundation without intercepting API routes', async ({
  request,
}) => {
  const response = await request.get('/sw.js')

  expect(response.ok()).toBe(true)

  const serviceWorkerSource = await response.text()

  expect(serviceWorkerSource).toContain(
    "requestUrl.pathname.startsWith('/api/')",
  )
  expect(serviceWorkerSource).toContain('return')
  expect(serviceWorkerSource).toContain('isTenantDynamicMetadataRequest')
  expect(serviceWorkerSource).toContain('handleNavigationRequest')
  expect(serviceWorkerSource).toContain('handleStaticRequest')
  expect(serviceWorkerSource).toContain("event.data?.type === 'SKIP_WAITING'")
  expect(serviceWorkerSource).toContain('shouldHandleStaticRequest')
  expect(serviceWorkerSource).toContain('shouldCacheResponse')
})

test('proxies API health through the frontend origin', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({
    app: 'chatwoot-client-portal-v2',
    status: 'ok',
  })
})
