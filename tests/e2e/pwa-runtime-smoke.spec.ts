import { expect, test } from '@playwright/test'

test('serves the PWA manifest with installable app metadata', async ({
  request,
}) => {
  const response = await request.get('/manifest.webmanifest')

  expect(response.ok()).toBe(true)

  const manifest = (await response.json()) as {
    display?: string
    icons?: Array<{ purpose?: string; sizes?: string; src?: string }>
    name?: string
    scope?: string
    start_url?: string
  }

  expect(manifest).toMatchObject({
    display: 'standalone',
    name: 'ProvGroup Клиентский портал',
    scope: '/',
    start_url: '/',
  })
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sizes: '192x192',
        src: '/pwa-icons/icon-192.png',
      }),
      expect.objectContaining({
        purpose: 'maskable',
        sizes: '512x512',
        src: '/pwa-icons/icon-maskable-512.png',
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
