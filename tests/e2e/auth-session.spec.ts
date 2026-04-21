import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

async function expectLoginScreen(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Клиентский портал' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Пароль' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
}

async function fillLoginForm(page: Page, password = E2E_PORTAL_USER.password) {
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page.getByRole('textbox', { name: 'Пароль' }).fill(password)
}

async function expectProtectedChatShell(page: Page) {
  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(
    page.getByRole('heading', { name: 'Клиентский чат' }),
  ).toBeVisible()
  await expect(page.getByText(E2E_PORTAL_USER.email)).toBeVisible()
  await expect(page.getByText('Защищенная сессия')).toBeVisible()
  await expect(page.getByText('Чат не подключен')).toBeVisible()
}

test('rejects invalid credentials without opening the protected shell', async ({
  page,
}) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  await fillLoginForm(page, 'WrongPortalPass123!')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByText('Неверный email или пароль.')).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login$/)
  await expect(
    page.getByRole('heading', { name: 'Клиентский чат' }),
  ).toHaveCount(0)
  await expect(page.getByText('Чат не подключен')).toHaveCount(0)
})

test('logs in with the seeded portal user and opens the protected app shell', async ({
  page,
}) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expectProtectedChatShell(page)
})

test('returns to the requested protected route after login', async ({
  page,
}) => {
  await page.goto('/app/chat?from=e2e')

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectLoginScreen(page)

  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat\?from=e2e$/)
  await expectProtectedChatShell(page)
})

test('redirects authenticated users away from public auth routes', async ({
  page,
}) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expectProtectedChatShell(page)

  await page.goto('/auth/password-reset/request')
  await expectProtectedChatShell(page)
})

test('logs out and blocks the protected route again', async ({ page }) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expectProtectedChatShell(page)

  await page.getByRole('button', { name: 'Выйти' }).click()

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectLoginScreen(page)

  await page.goto('/app/chat')
  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectLoginScreen(page)
})
