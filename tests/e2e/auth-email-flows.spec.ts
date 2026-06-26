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
const PASSWORD_SETUP_EMAIL_SUBJECT = 'Код для создания пароля в Client Portal'
const EMAIL_FLOW_TIMEOUT = 20_000

test.describe.configure({
  timeout: 60_000,
})

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
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('textbox', { name: 'Пароль' }).fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}

async function expectProtectedChatShell(page: Page) {
  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(page.getByRole('heading', { name: 'Личный чат' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Открыть меню чата' }),
  ).toBeVisible()
}

async function logoutFromProtectedChat(page: Page) {
  await page.goto('/app/chat')
  await expectProtectedChatShell(page)
  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Завершить диалог' }).click()
  await expect(page).toHaveURL(/\/auth\/login$/)
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
  const chatwootContact = await createChatwootContactForE2e({
    email,
    name: fullName,
  })

  await page.goto('/auth/register')
  await expect(
    page.getByRole('heading', { name: 'Создать аккаунт' }),
  ).toBeVisible()

  const requestedAt = new Date()
  await page.getByLabel('Имя и фамилия').fill(fullName)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/register\/verify$/, {
    timeout: EMAIL_FLOW_TIMEOUT,
  })
  await expect(page.getByText(email)).toBeVisible()

  return {
    chatwootContact,
    requestedAt,
  }
}

async function confirmRegistrationEmail({
  email,
  page,
  requestedAt,
}: {
  email: string
  page: Page
  requestedAt: Date
}) {
  const code = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: REGISTRATION_EMAIL_SUBJECT,
    timeoutMs: EMAIL_FLOW_TIMEOUT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/register\/set-password$/)
  await expect(
    page.getByRole('heading', { name: 'Завершение регистрации' }),
  ).toBeVisible()
}

async function expectRegistrationFlowStorageCleared(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.sessionStorage.getItem('portal.registration-flow'),
      ),
    )
    .toBeNull()
}

async function registerAndSkipPassword({
  email,
  fullName,
  page,
}: {
  email: string
  fullName: string
  page: Page
}) {
  const { chatwootContact, requestedAt } =
    await requestRegistrationVerification({
      email,
      fullName,
      page,
    })

  await confirmRegistrationEmail({
    email,
    page,
    requestedAt,
  })

  await page.getByRole('button', { name: 'Продолжить без пароля' }).click()
  await expectProtectedChatShell(page)
  await expectRegistrationFlowStorageCleared(page)

  const persistedLink = await findPortalUserContactLinkForE2e(email)

  expect(persistedLink).toMatchObject({
    chatwootContactId: chatwootContact.id,
    email,
  })

  return {
    chatwootContact,
    persistedLink,
  }
}

test('registers an eligible Chatwoot contact with a password and opens chat', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.registration')
  const fullName = 'E2E Registration User'
  const password = 'PortalPass123!'
  const { chatwootContact, requestedAt } =
    await requestRegistrationVerification({
      email,
      fullName,
      page,
    })

  await confirmRegistrationEmail({
    email,
    page,
    requestedAt,
  })

  await page.getByLabel('Новый пароль').fill(password)
  await page.getByLabel('Подтвердите пароль').fill(password)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expectProtectedChatShell(page)
  await expectRegistrationFlowStorageCleared(page)

  const persistedLink = await findPortalUserContactLinkForE2e(email)

  expect(persistedLink).toMatchObject({
    chatwootContactId: chatwootContact.id,
    email,
  })
})

test('registers with password skip, sets first password from profile, and logs in with it', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.registration.skip.setup')
  const fullName = 'E2E Skip Then Setup User'
  const password = 'SetupPortalPass123!'

  await registerAndSkipPassword({
    email,
    fullName,
    page,
  })

  await page.goto('/app/profile')
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible()
  await expect(page.getByText('Пароль не задан')).toBeVisible()

  const requestedAt = new Date()
  await page.getByRole('button', { name: 'Настроить пароль' }).click()
  await expect(page.getByText(`Код отправлен на ${email}.`)).toBeVisible()

  const code = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: PASSWORD_SETUP_EMAIL_SUBJECT,
    timeoutMs: EMAIL_FLOW_TIMEOUT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Подтвердить код' }).click()
  await expect(
    page.getByText('Email подтвержден. Теперь задайте пароль.'),
  ).toBeVisible()

  await page.getByLabel('Новый пароль').fill(password)
  await page.getByLabel('Подтвердите пароль').fill(password)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByText('Пароль настроен')).toBeVisible()

  await logoutFromProtectedChat(page)
  await loginAs(page, email, password)
  await expectProtectedChatShell(page)
})

test('registers with password skip, resets password after logout, and logs in with it', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.registration.skip.reset')
  const fullName = 'E2E Skip Then Reset User'
  const password = 'ResetPortalPass123!'

  await registerAndSkipPassword({
    email,
    fullName,
    page,
  })
  await logoutFromProtectedChat(page)

  await page.goto('/auth/password-reset/request')
  await expect(
    page.getByRole('heading', { name: 'Восстановить пароль' }),
  ).toBeVisible()

  const requestedAt = new Date()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(page).toHaveURL(/\/auth\/password-reset\/verify$/, {
    timeout: EMAIL_FLOW_TIMEOUT,
  })
  await expect(page.getByText(email)).toBeVisible()

  const code = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    timeoutMs: EMAIL_FLOW_TIMEOUT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/password-reset\/set-password$/)
  await expect(
    page.getByRole('heading', { name: 'Новый пароль' }),
  ).toBeVisible()

  await page.getByLabel('Новый пароль').fill(password)
  await page.getByLabel('Подтвердите пароль').fill(password)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()

  await expect(page.getByText(`Пароль обновлен для ${email}.`)).toBeVisible()
  await loginAs(page, email, password)
  await expectProtectedChatShell(page)
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
    page.getByRole('heading', { name: 'Восстановить пароль' }),
  ).toBeVisible()

  const requestedAt = new Date()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(page).toHaveURL(/\/auth\/password-reset\/verify$/, {
    timeout: EMAIL_FLOW_TIMEOUT,
  })
  await expect(page.getByText(email)).toBeVisible()

  const code = await waitForMailpitCode({
    sentAfter: requestedAt,
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    timeoutMs: EMAIL_FLOW_TIMEOUT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(/\/auth\/password-reset\/set-password$/)
  await expect(
    page.getByRole('heading', { name: 'Новый пароль' }),
  ).toBeVisible()

  await page.getByLabel('Новый пароль').fill(newPassword)
  await page.getByLabel('Подтвердите пароль').fill(newPassword)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()

  await expect(page.getByText(`Пароль обновлен для ${email}.`)).toBeVisible()

  await loginAs(page, email, oldPassword)
  await expect(page.getByText('Неверный email или пароль.')).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login$/)

  await page.getByRole('textbox', { name: 'Пароль' }).fill(newPassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expectProtectedChatShell(page)
})
