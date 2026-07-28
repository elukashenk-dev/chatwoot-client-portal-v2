import { randomUUID } from 'node:crypto'

import { expect, type Page } from '@playwright/test'

import { waitForMailpitCode } from './mailpit.ts'
import { seedPortalUserForE2e } from './portalUsers.ts'

export const E2E_LOGIN_CODE = '123456'

const LOGIN_EMAIL_SUBJECT = 'Код входа в Client Portal'
const EMAIL_FLOW_TIMEOUT = 20_000

export function createCodeLoginRequestResponse(email: string) {
  return {
    accepted: true,
    email,
    expiresInSeconds: 900,
    nextStep: 'verify_code',
    purpose: 'passwordless_login',
    resendAvailableInSeconds: 60,
    result: 'passwordless_login_requested',
  }
}

export function createCodeLoginCompletedResponse({
  expiresAt,
  user,
}: {
  expiresAt: string
  user: {
    email: string
    fullName: string
    id: number
  }
}) {
  return {
    nextStep: 'chat',
    purpose: 'passwordless_login',
    result: 'passwordless_login_completed',
    session: {
      expiresAt,
    },
    user: {
      ...user,
      passwordConfigured: true,
    },
  }
}

export async function seedUniqueCustomerForCodeLogin(prefix: string) {
  const user = {
    email: `${prefix}.${Date.now()}.${randomUUID().slice(0, 8)}@example.test`,
    fullName: 'E2E Code Login User',
    password: 'PortalPass123!',
  }

  await seedPortalUserForE2e(user)

  return user
}

export async function fillOtpCode(page: Page, code: string) {
  for (const [index, digit] of Array.from(code).entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await page.getByLabel(label, { exact: true }).fill(digit)
  }
}

export function createIncorrectOtpCode(actualCode: string) {
  return actualCode === '000000' ? '111111' : '000000'
}

export async function requestCustomerLoginCode({
  code,
  email,
  page,
}: {
  code?: string
  email: string
  page: Page
}) {
  const requestedAt = new Date()

  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Получить код' }).click()
  await expect(page).toHaveURL(/\/auth\/login\/verify$/, {
    timeout: EMAIL_FLOW_TIMEOUT,
  })

  return (
    code ??
    waitForMailpitCode({
      sentAfter: requestedAt,
      subject: LOGIN_EMAIL_SUBJECT,
      timeoutMs: EMAIL_FLOW_TIMEOUT,
      to: email,
    })
  )
}

export async function submitCustomerLoginCode({
  code,
  page,
}: {
  code: string
  page: Page
}) {
  await fillOtpCode(page, code)
  await page.getByRole('button', { name: 'Войти' }).click()
}

export async function acceptCustomerLegalIfRequired(page: Page) {
  if (!new URL(page.url()).pathname.endsWith('/auth/login/legal')) {
    return
  }

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

export async function loginCustomerWithEmailCode({
  code,
  email,
  navigateToLogin = true,
  page,
}: {
  code?: string
  email: string
  navigateToLogin?: boolean
  page: Page
}) {
  if (navigateToLogin) {
    await page.goto('/auth/login')
  }

  const loginCode = await requestCustomerLoginCode({
    code,
    email,
    page,
  })

  await submitCustomerLoginCode({
    code: loginCode,
    page,
  })
  await page.waitForURL((url) => !url.pathname.endsWith('/auth/login/verify'), {
    timeout: EMAIL_FLOW_TIMEOUT,
  })
  await acceptCustomerLegalIfRequired(page)
}

export async function seedAndLoginCustomerWithEmailCode({
  navigateToLogin = true,
  page,
  prefix,
}: {
  navigateToLogin?: boolean
  page: Page
  prefix: string
}) {
  const user = await seedUniqueCustomerForCodeLogin(prefix)

  await loginCustomerWithEmailCode({
    email: user.email,
    navigateToLogin,
    page,
  })

  return user
}
