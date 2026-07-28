import { randomUUID } from 'node:crypto'

import { expect, type Page, test } from '@playwright/test'

import { createChatwootContactForE2e } from './support/chatwoot.ts'
import { createIncorrectOtpCode, fillOtpCode } from './support/customerAuth.ts'
import {
  expectNoMailpitMessage,
  waitForMailpitCode,
} from './support/mailpit.ts'
import { seedPortalUserForE2e } from './support/portalUsers.ts'

const LOGIN_EMAIL_SUBJECT = 'Код входа в Client Portal'
const PASSWORD_RESET_EMAIL_SUBJECT =
  'Код восстановления пароля для Client Portal'

function createUniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${randomUUID().slice(0, 8)}@example.test`
}

async function requestLoginVerification({
  email,
  page,
}: {
  email: string
  page: Page
}) {
  const requestedAt = new Date()

  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(page).toHaveURL(/\/auth\/login\/verify$/)

  return requestedAt
}

async function requestPasswordReset({
  email,
  page,
}: {
  email: string
  page: Page
}) {
  const requestedAt = new Date()

  await page.goto('/auth/password-reset/request')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(page).toHaveURL(/\/auth\/password-reset\/verify$/)

  return requestedAt
}

test('shows a controlled code-login verify guard when opened without request state', async ({
  page,
}) => {
  await page.goto('/auth/login/verify')

  await expect(
    page.getByRole('heading', { name: 'Код из почты' }),
  ).toBeVisible()
  await expect(
    page.getByText('Сначала запросите код входа для уже созданного аккаунта.'),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Запросить код входа' }),
  ).toBeVisible()
})

test('shows a controlled legal-consent guard without verified code-login state', async ({
  page,
}) => {
  await page.goto('/auth/login/legal')

  await expect(
    page.getByRole('heading', { name: 'Принять условия' }),
  ).toBeVisible()
  await expect(page.getByText('Сначала подтвердите email кодом.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Получить код' })).toBeVisible()
})

test('shows a controlled password reset verify guard when opened without request state', async ({
  page,
}) => {
  await page.goto('/auth/password-reset/verify')

  await expect(
    page.getByRole('heading', { name: 'Подтверждение почты' }),
  ).toBeVisible()
  await expect(
    page.getByText('Сначала запросите код восстановления пароля.'),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Перейти к восстановлению' }),
  ).toBeVisible()
})

test('shows a controlled password reset set-password guard without verified state', async ({
  page,
}) => {
  await page.goto('/auth/password-reset/set-password')

  await expect(
    page.getByRole('heading', { name: 'Новый пароль' }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Сначала подтвердите email, чтобы открыть шаг установки пароля.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Вернуться к подтверждению' }).first(),
  ).toBeVisible()
})

test('keeps first-access login on verify step when the code is invalid', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.first-access.invalid')

  await createChatwootContactForE2e({
    email,
    name: 'E2E Invalid First Access User',
  })

  const requestedAt = await requestLoginVerification({
    email,
    page,
  })
  const actualCode = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: LOGIN_EMAIL_SUBJECT,
    to: email,
  })

  await fillOtpCode(page, createIncorrectOtpCode(actualCode))
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(
    page.getByText('Неверный код входа. Проверьте код и попробуйте еще раз.'),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login\/verify$/)
  await expect(
    page.getByRole('heading', { name: 'Принять условия' }),
  ).toHaveCount(0)
})

test('keeps password reset on verify step when the code is invalid', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.reset.invalid')
  const fullName = 'E2E Invalid Reset User'

  await seedPortalUserForE2e({
    email,
    fullName,
    password: 'PortalPass123!',
  })

  const requestedAt = await requestPasswordReset({
    email,
    page,
  })
  const actualCode = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    to: email,
  })

  await fillOtpCode(page, createIncorrectOtpCode(actualCode))
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(
    page.getByText(
      'Неверный код восстановления. Проверьте код и попробуйте еще раз.',
    ),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/password-reset\/verify$/)
  await expect(page.getByRole('heading', { name: 'Новый пароль' })).toHaveCount(
    0,
  )
})

test('accepts password reset request for unknown email without sending reset mail', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.reset.unknown')
  const requestedAt = await requestPasswordReset({
    email,
    page,
  })

  await expect(page.getByText(email)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Подтверждение почты' }),
  ).toBeVisible()

  await expectNoMailpitMessage({
    sentAfter: requestedAt,
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    to: email,
  })
})
