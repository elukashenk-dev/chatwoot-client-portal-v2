import { expect, type Page, test } from '@playwright/test'

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
          email: 'admin@example.test',
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
      email: 'admin@example.test',
    })

    await route.fulfill({
      contentType: 'application/json',
      json: {
        delivery: 'sent',
        email: 'admin@example.test',
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
      email: 'admin@example.test',
    })
    isAdminAuthenticated = true

    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 11,
          email: 'admin@example.test',
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

  await page.getByLabel('Email администратора').fill('admin@example.test')
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
    page.getByRole('heading', { name: 'Фоны и изображения' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Страницы портала' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('shows controlled mobile state for admin branding shell', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await mockAdminUiRoutes(page)
  await page.goto('/admin/login')
  await page.getByLabel('Email администратора').fill('admin@example.test')
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
    page.getByRole('heading', { name: 'Фоны и изображения' }),
  ).not.toBeVisible()
})
