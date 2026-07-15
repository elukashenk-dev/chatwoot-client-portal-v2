import { randomUUID } from 'node:crypto'

import { expect, type Page, test } from '@playwright/test'

import { createChatwootContactForE2e } from './support/chatwoot.ts'
import { waitForMailpitCode } from './support/mailpit.ts'

const LOGIN_EMAIL_SUBJECT = 'Код входа в Client Portal'
const EMAIL_FLOW_TIMEOUT = 20_000

test.describe.configure({
  timeout: 60_000,
})

function createUniqueEmail() {
  return `e2e.code-login.person.${Date.now()}.${randomUUID().slice(0, 8)}@example.test`
}

async function fillOtpCode(page: Page, code: string) {
  for (const [index, digit] of Array.from(code).entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await page.getByLabel(label, { exact: true }).fill(digit)
  }
}

test('opens private chat after email-code login for a person without a group flag', async ({
  page,
}) => {
  const email = createUniqueEmail()

  await createChatwootContactForE2e({
    customAttributes: {
      portal_enabled: true,
    },
    email,
    name: 'E2E Code Login Person',
  })

  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email)

  const requestedAt = new Date()
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(page).toHaveURL(/\/auth\/login\/verify$/, {
    timeout: EMAIL_FLOW_TIMEOUT,
  })

  const code = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: LOGIN_EMAIL_SUBJECT,
    timeoutMs: EMAIL_FLOW_TIMEOUT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/auth\/login\/legal$/)
  await page
    .getByRole('checkbox', {
      name: /Я принимаю условия Пользовательского соглашения/i,
    })
    .check()
  await page
    .getByRole('checkbox', {
      name: /Я даю согласие на обработку персональных данных/i,
    })
    .check()
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/app\/chat$/)
  await expect(page.getByRole('heading', { name: 'Личный чат' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Мы на связи' })).toBeVisible()
  await expect(
    page.getByText('Напишите нам, когда будет удобно. Мы ответим здесь.'),
  ).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Чат временно недоступен' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Чат не подключён' }),
  ).toHaveCount(0)
})
