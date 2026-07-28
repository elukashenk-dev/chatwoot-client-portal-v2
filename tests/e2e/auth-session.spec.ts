import { expect, type Page, test } from '@playwright/test'

import {
  createIncorrectOtpCode,
  requestCustomerLoginCode,
  seedAndLoginCustomerWithEmailCode,
  seedUniqueCustomerForCodeLogin,
  submitCustomerLoginCode,
} from './support/customerAuth.ts'

async function expectLoginScreen(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Получить код' })).toBeVisible()
}

async function expectProtectedChatShell(page: Page) {
  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(page.getByRole('heading', { name: 'Личный чат' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Открыть меню чата' }),
  ).toBeVisible()
}

async function logoutFromProtectedChat(page: Page) {
  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Выход' }).click()
}

test('rejects an invalid login code without opening the protected shell', async ({
  page,
}) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  const user = await seedUniqueCustomerForCodeLogin('e2e.auth.invalid-code')
  const actualCode = await requestCustomerLoginCode({
    email: user.email,
    page,
  })
  await submitCustomerLoginCode({
    code: createIncorrectOtpCode(actualCode),
    page,
  })

  await expect(
    page.getByText('Неверный код входа. Проверьте код и попробуйте еще раз.'),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login\/verify$/)
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveCount(0)
  await expect(page.getByText('Чат не подключен')).toHaveCount(0)
})

test('logs in with the seeded portal user and opens the protected app shell', async ({
  page,
}) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  await seedAndLoginCustomerWithEmailCode({
    navigateToLogin: false,
    page,
    prefix: 'e2e.auth.login',
  })

  await expectProtectedChatShell(page)
})

test('returns to the requested protected route after login', async ({
  page,
}) => {
  await page.goto('/app/chat?from=e2e')

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectLoginScreen(page)

  await seedAndLoginCustomerWithEmailCode({
    navigateToLogin: false,
    page,
    prefix: 'e2e.auth.return-route',
  })

  await expect(page).toHaveURL(/\/app\/chat\?from=e2e$/)
  await expectProtectedChatShell(page)
})

test('redirects authenticated users away from public auth routes', async ({
  page,
}) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  await seedAndLoginCustomerWithEmailCode({
    navigateToLogin: false,
    page,
    prefix: 'e2e.auth.public-redirect',
  })
  await expectProtectedChatShell(page)

  await page.goto('/auth/password-reset/request')
  await expectProtectedChatShell(page)
})

test('logs out and blocks the protected route again', async ({ page }) => {
  await page.goto('/auth/login')
  await expectLoginScreen(page)

  await seedAndLoginCustomerWithEmailCode({
    navigateToLogin: false,
    page,
    prefix: 'e2e.auth.logout',
  })
  await expectProtectedChatShell(page)

  await logoutFromProtectedChat(page)

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectLoginScreen(page)

  await page.goto('/app/chat')
  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectLoginScreen(page)
})
