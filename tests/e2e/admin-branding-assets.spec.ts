import { expect, type Page, test } from '@playwright/test'

const adminEmail = 'cbr@provgroup.com'
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
  'base64',
)

const logoAsset = {
  assetVersion: '77',
  contentType: 'image/png',
  height: null,
  id: 77,
  kind: 'logo',
  publicUrl: '/api/branding/assets/77?v=77',
  width: null,
} as const

const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authMutedText: '#64748b',
  authText: '#15486b',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
} as const

const defaultBrandingAppearance = {
  authBackgroundOverlay: 'none',
  authButtonStyle: 'solid',
  authColorScheme: 'light',
  authFieldStyle: 'solid',
} as const

const defaultBrandingLayout = {
  authBrandPlacement: 'center',
} as const

const brandingBase = {
  branding: {
    appearance: defaultBrandingAppearance,
    assets: {},
    colors: defaultBrandingColors,
    copy: {
      authSubtitle: 'Введите email и пароль, чтобы продолжить.',
      authTitle: 'Вход в личный кабинет',
      chatEmptyBody: 'Напишите нам, когда будет удобно.',
      chatEmptyTitle: 'Мы на связи',
      chatInfoTitle: 'Информация о чате',
    },
    layout: defaultBrandingLayout,
    portalName: 'Бухфирма',
    supportLabel: 'Команда Бухфирма',
    version: 1,
  },
}

async function mockPublicBrandingRoute(page: Page) {
  await page.route('**/api/branding', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname !== '/api/branding') {
      await route.fallback()
      return
    }

    expect(request.method()).toBe('GET')
    await route.fulfill({
      contentType: 'application/json',
      json: brandingBase,
      status: 200,
    })
  })
}

async function mockAdminBrandingAssetRoutes(page: Page) {
  const assetRequests: string[] = []
  let currentAssets: Record<string, typeof logoAsset> = {}

  await mockPublicBrandingRoute(page)

  await page.route('**/api/tenant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'buhfirma.127.0.0.1.nip.io',
          publicBaseUrl: 'http://buhfirma.127.0.0.1.nip.io:5173',
          slug: 'buhfirma',
        },
      },
      status: 200,
    })
  })

  await page.route('**/api/admin/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 11,
          email: adminEmail,
          role: 'administrator',
        },
        session: {
          expiresAt: '2026-06-07T00:00:00.000Z',
        },
      },
      status: 200,
    })
  })

  await page.route('**/api/admin/branding', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      contentType: 'application/json',
      json: {
        branding: {
          ...brandingBase.branding,
          assets: currentAssets,
        },
      },
      status: 200,
    })
  })

  await page.route('**/api/admin/branding/assets/logo', async (route) => {
    const method = route.request().method()
    assetRequests.push(method)

    if (method === 'POST') {
      expect(route.request().headers()['content-type']).toContain(
        'multipart/form-data',
      )
      currentAssets = { logo: logoAsset }
      await route.fulfill({
        contentType: 'application/json',
        json: { asset: logoAsset },
        status: 200,
      })
      return
    }

    expect(method).toBe('DELETE')
    currentAssets = {}
    await route.fulfill({
      contentType: 'application/json',
      json: { deleted: true },
      status: 200,
    })
  })

  await page.route('**/api/branding/assets/77**', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      body: onePixelPng,
      contentType: 'image/png',
      status: 200,
    })
  })

  return { assetRequests }
}

test('admin uploads and deletes a branding logo asset from the console', async ({
  page,
}) => {
  const { assetRequests } = await mockAdminBrandingAssetRoutes(page)

  await page.goto('/admin/branding')
  await expect(
    page.getByRole('heading', { exact: true, name: 'Брендинг' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Изображения' }).click()
  await expect(page).toHaveURL(/#assets$/)

  await page.getByLabel('Загрузить логотип').setInputFiles({
    buffer: onePixelPng,
    mimeType: 'image/png',
    name: 'logo.png',
  })

  await expect(page.getByRole('status')).toContainText('Логотип загружен.')
  await expect(page.getByLabel('Заменить логотип')).toBeAttached()
  await expect(
    page.locator('label').filter({
      has: page.getByLabel('Заменить логотип'),
    }),
  ).toHaveText('Заменить')
  await expect(
    page.getByRole('button', { name: 'Удалить логотип' }),
  ).toHaveText('Удалить')
  await expect(
    page.getByRole('img', { exact: true, name: 'Логотип' }),
  ).toHaveAttribute('src', '/api/branding/assets/77?v=77')
  const phonePreview = page.getByRole('region', {
    name: 'Телефонный предпросмотр портала',
  })

  await expect(phonePreview.locator('.auth-brand-mark--in-flow')).toHaveClass(
    /brand-mark--uploaded/,
  )
  await expect(phonePreview.locator('.brand-mark-logo')).toHaveClass(
    /brand-mark-logo--uploaded/,
  )
  await expect(phonePreview.locator('.brand-mark-logo')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )

  await page.getByRole('button', { name: 'Удалить логотип' }).click()

  await expect(page.getByRole('status')).toContainText('Логотип удален.')
  await expect(page.getByLabel('Загрузить логотип')).toBeAttached()
  await expect(
    page.locator('label').filter({
      has: page.getByLabel('Загрузить логотип'),
    }),
  ).toHaveText('Загрузить')
  expect(assetRequests).toEqual(['POST', 'DELETE'])
})
