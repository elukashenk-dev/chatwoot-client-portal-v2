import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

function createReadySnapshot() {
  return {
    activeThread: privateThread,
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Здравствуйте, вижу ваше обращение.',
        contentType: 'text',
        createdAt: '2026-05-20T08:20:00.000Z',
        direction: 'incoming',
        id: 204,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

async function fillLoginForm(page: Page) {
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page
    .getByRole('textbox', { name: 'Пароль' })
    .fill(E2E_PORTAL_USER.password)
}

async function routeChatShell(page: Page) {
  await page.route('**/api/chat/threads', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeThreadId: privateThread.id,
        threads: [{ ...privateThread, unreadCount: 0 }],
        totalUnreadCount: 0,
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/messages**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(createReadySnapshot()),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/realtime**', async (route) => {
    await route.fulfill({
      status: 204,
    })
  })
  await page.route('**/api/chat/support-availability', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        currentStatus: 'online',
        outOfOfficeMessage: null,
        reason: 'none',
        result: 'ready',
        workingHours: {
          enabled: false,
          isWithinWorkingHours: null,
          rows: [],
          timezone: 'UTC',
        },
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
}

test('opens profile from the right chat menu and uploads an avatar through portal API', async ({
  page,
}) => {
  const profileRequests: string[] = []
  const avatarRequests: string[] = []

  await routeChatShell(page)
  await page.route('**/api/profile', async (route) => {
    profileRequests.push(route.request().method())
    await route.fulfill({
      body: JSON.stringify({
        avatarUrl: null,
        email: E2E_PORTAL_USER.email,
        fullName: E2E_PORTAL_USER.fullName,
        phoneNumber: '+79991234567',
        result: 'ready',
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/profile/avatar', async (route) => {
    avatarRequests.push(route.request().method())

    if (route.request().method() === 'POST') {
      await route.fulfill({
        body: JSON.stringify({
          avatarUrl: '/api/profile/avatar',
          result: 'updated',
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
        'base64',
      ),
      contentType: 'image/png',
      status: 200,
    })
  })

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(
    page.getByText('Здравствуйте, вижу ваше обращение.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Открыть навигацию' }).click()
  const navMenu = page.getByRole('menu')

  await expect(navMenu).toBeVisible()
  await expect(navMenu).toHaveCSS(
    'background-color',
    'rgba(255, 255, 255, 0.22)',
  )
  await expect(navMenu).toHaveCSS('border-color', /0\.65\)/)
  await expect(navMenu).toHaveCSS('backdrop-filter', /blur\(32px\)/)

  const navMenuBackground = await navMenu.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  )

  expect(navMenuBackground).toContain('linear-gradient')
  expect(navMenuBackground).toContain('rgba(255, 255, 255, 0.74)')
  expect(navMenuBackground).toContain('rgba(255, 255, 255, 0.62)')
  await page.getByRole('button', { name: 'Закрыть навигацию' }).click()

  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  const chatMenu = page.getByRole('menu')

  await expect(chatMenu).toBeVisible()
  await expect(chatMenu).toHaveCSS(
    'background-color',
    'rgba(255, 255, 255, 0.22)',
  )
  await expect(chatMenu).toHaveCSS('border-color', /0\.65\)/)
  await expect(chatMenu).toHaveCSS('backdrop-filter', /blur\(32px\)/)

  const chatMenuBackground = await chatMenu.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  )

  expect(chatMenuBackground).toContain('linear-gradient')
  expect(chatMenuBackground).toContain('rgba(255, 255, 255, 0.74)')
  expect(chatMenuBackground).toContain('rgba(255, 255, 255, 0.62)')
  await expect(page.getByText('Аккаунт', { exact: true })).toBeVisible()
  await expect(page.getByText('Чат', { exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Профиль' }).click()

  const profilePage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Профиль' }),
  })

  await expect(
    profilePage.getByRole('heading', { name: 'Профиль' }),
  ).toBeVisible()
  await expect(profilePage.getByText(E2E_PORTAL_USER.fullName)).toBeVisible()
  await expect(profilePage.getByText(E2E_PORTAL_USER.email)).toBeVisible()
  await expect(profilePage.getByText('+79991234567')).toBeVisible()
  await expect(profilePage.getByRole('textbox')).toHaveCount(0)
  const profileGlassCard = profilePage.locator('.chat-glass-card-surface')

  await expect(profileGlassCard).toBeVisible()
  await expect(profileGlassCard).toHaveCSS(
    'background-color',
    'rgba(255, 255, 255, 0.01)',
  )

  const profileGlassCardBackground = await profileGlassCard.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  )

  expect(profileGlassCardBackground).toContain('linear-gradient')
  expect(profileGlassCardBackground).toContain('rgba(255, 255, 255, 0.28)')
  expect(profileGlassCardBackground).toContain('rgba(255, 255, 255, 0.34)')

  await profilePage.getByLabel('Загрузить аватар').setInputFiles({
    buffer: Buffer.from('avatar-bytes'),
    mimeType: 'image/png',
    name: 'avatar.png',
  })

  await expect(profilePage.getByText('Аватар обновлен.')).toBeVisible()
  await expect(profilePage.getByLabel('Заменить аватар')).toBeAttached()
  expect(profileRequests.length).toBeGreaterThanOrEqual(1)
  expect(profileRequests.every((method) => method === 'GET')).toBe(true)
  expect(avatarRequests).toContain('POST')
})
