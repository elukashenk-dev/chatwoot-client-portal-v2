import { randomUUID } from 'node:crypto'

import { expect, type Page, test } from '@playwright/test'

import { createChatwootContactForE2e } from './support/chatwoot.ts'
import { fillOtpCode } from './support/customerAuth.ts'
import { waitForMailpitCode } from './support/mailpit.ts'
import {
  findPortalUserContactLinkForE2e,
  seedPortalUserForE2e,
} from './support/portalUsers.ts'

const LOGIN_EMAIL_SUBJECT = 'Код входа в Client Portal'
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

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/auth/login/password')
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

async function logoutFromProtectedChat(
  page: Page,
  { confirmPasswordless = false } = {},
) {
  await page.goto('/app/chat')
  await expectProtectedChatShell(page)
  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Выход' }).click()

  if (confirmPasswordless) {
    const dialog = page.getByRole('dialog', { name: 'Выйти из аккаунта?' })

    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Выйти' }).click()
  }

  await expect(page).toHaveURL(/\/auth\/login$/)
}

async function requestFirstAccessLogin({
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

  await page.goto('/auth/login')
  await expect(page.getByLabel('Email')).toBeVisible()

  const requestedAt = new Date()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(page).toHaveURL(/\/auth\/login\/verify$/, {
    timeout: EMAIL_FLOW_TIMEOUT,
  })
  await expect(page.getByText(email)).toBeVisible()

  return {
    chatwootContact,
    requestedAt,
  }
}

async function confirmFirstAccessLogin({
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
    subject: LOGIN_EMAIL_SUBJECT,
    timeoutMs: EMAIL_FLOW_TIMEOUT,
    to: email,
  })

  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/auth\/login\/legal$/)
  await expect(
    page.getByRole('heading', { name: 'Принять условия' }),
  ).toBeVisible()

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
}

async function expectCodeLoginFlowStorageCleared(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.sessionStorage.getItem('portal.passwordless-login-flow'),
      ),
    )
    .toBeNull()
}

async function completeFirstAccess({
  email,
  fullName,
  page,
}: {
  email: string
  fullName: string
  page: Page
}) {
  const { chatwootContact, requestedAt } = await requestFirstAccessLogin({
    email,
    fullName,
    page,
  })

  await confirmFirstAccessLogin({
    email,
    page,
    requestedAt,
  })

  await expectProtectedChatShell(page)
  await expectCodeLoginFlowStorageCleared(page)

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

test('opens chat for an eligible Chatwoot contact through first-access code login', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.first-access')
  const { chatwootContact, persistedLink } = await completeFirstAccess({
    email,
    fullName: 'E2E First Access User',
    page,
  })

  expect(persistedLink).toMatchObject({
    chatwootContactId: chatwootContact.id,
    email,
  })
})

test('sets a first password from profile after first-access code login', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.first-access.setup')
  const fullName = 'E2E Skip Then Setup User'
  const password = 'SetupPortalPass123!'

  await completeFirstAccess({
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

test('sets a first password through reset after first-access code login', async ({
  page,
}) => {
  const email = createUniqueEmail('e2e.first-access.reset')
  const fullName = 'E2E Skip Then Reset User'
  const password = 'ResetPortalPass123!'

  await completeFirstAccess({
    email,
    fullName,
    page,
  })
  await logoutFromProtectedChat(page, { confirmPasswordless: true })

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
  await expect(page).toHaveURL(/\/auth\/login\/password$/)

  await page.getByRole('textbox', { name: 'Пароль' }).fill(newPassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expectProtectedChatShell(page)
})
