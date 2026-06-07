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

const brandingBase = {
  branding: {
    assets: {},
    colors: {
      accent: '#4676b4',
      authBackground: '#f3f7fc',
      chatBackground: '#ffffff',
      chatHeaderBackground: '#112540',
      primary: '#112540',
    },
    copy: {
      authSubtitle: 'Введите email и пароль, чтобы продолжить.',
      authTitle: 'Вход в личный кабинет',
      chatEmptyBody: 'Напишите нам, когда будет удобно.',
      chatEmptyTitle: 'Мы на связи',
      chatInfoTitle: 'Информация о чате',
    },
    portalName: 'Бухфирма',
    supportLabel: 'Команда Бухфирма',
    version: 1,
  },
}

async function mockAdminBrandingAssetRoutes(page: Page) {
  const assetRequests: string[] = []
  let currentAssets: Record<string, typeof logoAsset> = {}

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
    page.getByRole('button', { name: 'Удалить логотип' }),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { exact: true, name: 'Логотип' }),
  ).toHaveAttribute('src', '/api/branding/assets/77?v=77')

  await page.getByRole('button', { name: 'Удалить логотип' }).click()

  await expect(page.getByRole('status')).toContainText('Логотип удален.')
  await expect(page.getByLabel('Загрузить логотип')).toBeAttached()
  expect(assetRequests).toEqual(['POST', 'DELETE'])
})
