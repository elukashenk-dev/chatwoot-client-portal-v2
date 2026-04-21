import { expect, test } from '@playwright/test'

test('opens the public login screen', async ({ page }) => {
  await page.goto('/auth/login')

  await expect(
    page.getByRole('heading', { name: 'Клиентский портал' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Пароль' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
})

test('redirects unauthenticated app chat visits to login', async ({ page }) => {
  await page.goto('/app/chat')

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expect(
    page.getByRole('heading', { name: 'Клиентский портал' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Пароль' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Клиентский чат' }),
  ).toHaveCount(0)
  await expect(page.getByText('Чат пока готовится')).toHaveCount(0)
})
