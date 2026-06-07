import { expect, test } from '@playwright/test'

const brandingResponse = {
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

test('admin can edit branding settings and see preview update', async ({
  page,
}) => {
  await page.route('**/api/tenant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'buhfirma.example.test',
          publicBaseUrl: 'https://buhfirma.example.test',
          slug: 'buhfirma',
        },
      },
    })
  })
  await page.route('**/api/admin/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 42,
          email: 'admin@example.test',
          role: 'administrator',
        },
        session: {
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    })
  })
  await page.route('**/api/admin/branding', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        json: brandingResponse,
      })
      return
    }

    await expect(route.request().postDataJSON()).toMatchObject({
      portalName: 'Портал Бухфирма',
    })
    await route.fulfill({
      contentType: 'application/json',
      json: {
        branding: {
          ...brandingResponse.branding,
          portalName: 'Портал Бухфирма',
          version: 2,
        },
      },
    })
  })

  await page.goto('/admin/branding')

  await expect(
    page.getByRole('heading', { exact: true, name: 'Брендинг' }),
  ).toBeVisible()
  await page.getByLabel('Название портала').fill('Портал Бухфирма')
  await expect(
    page.getByRole('heading', { name: 'Портал Бухфирма' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect(page.getByLabel('Название портала')).toHaveValue(
    'Портал Бухфирма',
  )
})
