import { randomUUID } from 'node:crypto'

import { expect, type Page, test } from '@playwright/test'

import { createChatwootContactForE2e } from './support/chatwoot.ts'
import {
  expectNoMailpitMessage,
  waitForMailpitCode,
} from './support/mailpit.ts'
import { seedPortalUserForE2e } from './support/portalUsers.ts'

const REGISTRATION_EMAIL_SUBJECT = 'Код подтверждения для Client Portal'
const PASSWORD_RESET_EMAIL_SUBJECT =
  'Код восстановления пароля для Client Portal'

function createUniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${randomUUID().slice(0, 8)}@example.test`
}

function createIncorrectCode(actualCode: string) {
  return actualCode === '000000' ? '111111' : '000000'
}

async function fillOtpCode(page: Page, code: string) {
  for (const [index, digit] of Array.from(code).entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await page.getByLabel(label, { exact: true }).fill(digit)
  }
}

async function requestRegistrationVerification({
  email,
  fullName,
  page,
}: {
  email: string
  fullName: string
  page: Page
}) {
  const requestedAt = new Date()

  await page.goto('/auth/register')
  await page.getByLabel('Имя и фамилия').fill(fullName)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/register\/verify$/)

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

test('shows a controlled registration verify guard when opened without request state', async ({
  page,
}) => {
  await page.goto('/auth/register/verify')

  await expect(
    page.getByRole('heading', { name: 'Подтверждение Email' }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Сначала начните регистрацию и запросите код подтверждения.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Перейти к регистрации' }),
  ).toBeVisible()
})

test('shows a controlled registration set-password guard without verified state', async ({
  page,
}) => {
  await page.goto('/auth/register/set-password')

  await expect(
    page.getByRole('heading', { name: 'Создание пароля' }),
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

test('shows a controlled password reset verify guard when opened without request state', async ({
  page,
}) => {
  await page.goto('/auth/password-reset/verify')

  await expect(
    page.getByRole('heading', { name: 'Подтверждение Email' }),
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
    page.getByRole('heading', { name: 'Создание пароля' }),
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

test('keeps registration on verify step when the code is invalid', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.registration.invalid')
  const fullName = 'E2E Invalid Registration User'

  await createChatwootContactForE2e({
    email,
    name: fullName,
  })

  const requestedAt = await requestRegistrationVerification({
    email,
    fullName,
    page,
  })
  const actualCode = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: REGISTRATION_EMAIL_SUBJECT,
    to: email,
  })

  await fillOtpCode(page, createIncorrectCode(actualCode))
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(
    page.getByText(
      'Неверный код подтверждения. Проверьте код и попробуйте еще раз.',
    ),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/register\/verify$/)
  await expect(
    page.getByRole('heading', { name: 'Создание пароля' }),
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

  await fillOtpCode(page, createIncorrectCode(actualCode))
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(
    page.getByText(
      'Неверный код восстановления. Проверьте код и попробуйте еще раз.',
    ),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/password-reset\/verify$/)
  await expect(
    page.getByRole('heading', { name: 'Создание пароля' }),
  ).toHaveCount(0)
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
    page.getByRole('heading', { name: 'Подтверждение Email' }),
  ).toBeVisible()

  await expectNoMailpitMessage({
    sentAfter: requestedAt,
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    to: email,
  })
})
