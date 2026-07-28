import { expect, test } from '@playwright/test'

test('opens the public login screen', async ({ page }) => {
  await page.goto('/auth/login')

  await expect(
    page.getByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Получить код' })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Войти по паролю' }),
  ).toHaveAttribute('href', '/auth/login/password')
})

test('redirects unauthenticated app chat visits to login', async ({ page }) => {
  await page.goto('/app/chat')

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expect(
    page.getByRole('heading', { name: 'ВХОД ДЛЯ КЛИЕНТОВ' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Получить код' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Клиентский чат' }),
  ).toHaveCount(0)
  await expect(page.getByText('Чат не подключен')).toHaveCount(0)
})
