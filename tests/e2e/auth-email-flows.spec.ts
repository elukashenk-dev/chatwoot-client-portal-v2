import { randomUUID } from 'node:crypto'

import { expect, type Page, test } from '@playwright/test'

import { createChatwootContactForE2e } from './support/chatwoot.ts'
import { waitForMailpitCode } from './support/mailpit.ts'
import {
  findPortalUserContactLinkForE2e,
  seedPortalUserForE2e,
} from './support/portalUsers.ts'

const REGISTRATION_EMAIL_SUBJECT = 'Код подтверждения для Client Portal'
const PASSWORD_RESET_EMAIL_SUBJECT =
  'Код восстановления пароля для Client Portal'

function createUniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${randomUUID().slice(0, 8)}@example.test`
}

async function fillOtpCode(page: Page, code: string) {
  for (const [index, digit] of Array.from(code).entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await page.getByLabel(label, { exact: true }).fill(digit)
  }
}

async function loginAs(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByRole('textbox', { name: 'Пароль' }).fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}

async function expectProtectedChatShell(
  page: Page,
  email: string,
  expectedChatState: string,
) {
  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(
    page.getByRole('heading', { name: 'Клиентский чат' }),
  ).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByText('Защищенная сессия')).toBeVisible()
  await expect(page.getByText(expectedChatState)).toBeVisible()
}

test('registers an eligible Chatwoot contact through Mailpit verification', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.registration')
  const fullName = 'E2E Registration User'
  const password = 'PortalPass123!'
  const chatwootContact = await createChatwootContactForE2e({
    email,
    name: fullName,
  })

  await page.goto('/auth/register')
  await expect(
    page.getByRole('heading', { name: 'Новый аккаунт' }),
  ).toBeVisible()

  const requestedAt = new Date()
  await page.getByLabel('Имя и фамилия').fill(fullName)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/register\/verify$/)
  await expect(page.getByText(email)).toBeVisible()

  const code = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: REGISTRATION_EMAIL_SUBJECT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/register\/set-password$/)
  await expect(
    page.getByRole('heading', { name: 'Создание пароля' }),
  ).toBeVisible()

  await page.getByLabel('Новый пароль').fill(password)
  await page.getByLabel('Подтвердите пароль').fill(password)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()

  await expect(page.getByText(`Пароль сохранен для ${email}.`)).toBeVisible()

  const persistedLink = await findPortalUserContactLinkForE2e(email)

  expect(persistedLink).toMatchObject({
    chatwootContactId: chatwootContact.id,
    email,
  })

  await page.getByRole('link', { name: 'Перейти ко входу' }).first().click()
  await loginAs(page, email, password)
  await expectProtectedChatShell(page, email, 'Переписка пока не создана')
})

test('resets a portal user password through Mailpit and rejects the old password', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.reset')
  const fullName = 'E2E Reset User'
  const oldPassword = 'PortalPass123!'
  const newPassword = 'NewPortalPass123!'

  await seedPortalUserForE2e({
    email,
    fullName,
    password: oldPassword,
  })

  await page.goto('/auth/password-reset/request')
  await expect(
    page.getByRole('heading', { name: 'Восстановление пароля' }),
  ).toBeVisible()

  const requestedAt = new Date()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(page).toHaveURL(/\/auth\/password-reset\/verify$/)
  await expect(page.getByText(email)).toBeVisible()

  const code = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/password-reset\/set-password$/)
  await expect(
    page.getByRole('heading', { name: 'Создание пароля' }),
  ).toBeVisible()

  await page.getByLabel('Новый пароль').fill(newPassword)
  await page.getByLabel('Подтвердите пароль').fill(newPassword)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()

  await expect(page.getByText(`Пароль обновлен для ${email}.`)).toBeVisible()

  await page.getByRole('link', { name: 'Перейти ко входу' }).first().click()
  await loginAs(page, email, oldPassword)
  await expect(page.getByText('Неверный email или пароль.')).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login$/)

  await page.getByRole('textbox', { name: 'Пароль' }).fill(newPassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expectProtectedChatShell(page, email, 'Чат не подключен')
})
