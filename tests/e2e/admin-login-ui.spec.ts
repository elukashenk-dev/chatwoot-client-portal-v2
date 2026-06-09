import { expect, type Page, test } from '@playwright/test'

const adminEmail = 'cbr@provgroup.com'

const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authMutedText: '#64748b',
  authText: '#0f172a',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
} as const

const brandingResponse = {
  branding: {
    assets: {},
    colors: defaultBrandingColors,
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

async function mockAdminUiRoutes(page: Page) {
  let isAdminAuthenticated = false

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
    if (!isAdminAuthenticated) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          error: {
            code: 'TENANT_ADMIN_UNAUTHORIZED',
            message: 'Требуется вход администратора.',
          },
        },
        status: 401,
      })
      return
    }

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

  await page.route('**/api/admin/auth/request', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(await route.request().postDataJSON()).toEqual({
      email: adminEmail,
    })

    await route.fulfill({
      contentType: 'application/json',
      json: {
        delivery: 'sent',
        email: adminEmail,
        expiresInSeconds: 900,
        nextStep: 'verify_code',
        purpose: 'tenant_admin_login',
        resendAvailableInSeconds: 0,
        result: 'admin_login_challenge_requested',
      },
      status: 200,
    })
  })

  await page.route('**/api/admin/auth/verify', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(await route.request().postDataJSON()).toEqual({
      code: '123456',
      email: adminEmail,
    })
    isAdminAuthenticated = true

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

  await page.route('**/api/admin/auth/logout', async (route) => {
    expect(route.request().method()).toBe('POST')
    isAdminAuthenticated = false
    await route.fulfill({ status: 204 })
  })

  await page.route('**/api/admin/branding', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      contentType: 'application/json',
      json: brandingResponse,
      status: 200,
    })
  })
}

async function fillOtpCode(page: Page) {
  for (const [index, digit] of Array.from('123456').entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await page.getByLabel(label, { exact: true }).fill(digit)
  }
}

test('logs into admin console through email code UI and logs out', async ({
  page,
}) => {
  await mockAdminUiRoutes(page)

  await page.goto('/admin/login')
  await expect(
    page.getByRole('heading', { name: 'Вход в админ-консоль' }),
  ).toBeVisible()

  await page.getByLabel('Email администратора').fill(adminEmail)
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(
    page.getByRole('heading', { name: 'Подтвердите вход' }),
  ).toBeVisible()

  await fillOtpCode(page)
  await page.getByRole('button', { name: 'Войти в админ-консоль' }).click()

  await expect(page).toHaveURL(/\/admin\/branding$/)
  await expect(
    page.getByRole('heading', { exact: true, name: 'Брендинг' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Настройки брендинга' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Основное' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Цвета' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Auth-экран' })).toBeVisible()

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('shows controlled mobile state for admin branding shell', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await mockAdminUiRoutes(page)
  await page.goto('/admin/login')
  await page.getByLabel('Email администратора').fill(adminEmail)
  await page.getByRole('button', { name: 'Получить код' }).click()
  await fillOtpCode(page)
  await page.getByRole('button', { name: 'Войти в админ-консоль' }).click()

  await expect(page).toHaveURL(/\/admin\/branding$/)
  await expect(
    page.getByRole('heading', {
      name: 'Админ-консоль доступна с широкого экрана',
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Настройки и предпросмотр требуют desktop ширину.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Настройки брендинга' }),
  ).not.toBeVisible()
})
