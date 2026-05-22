import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

async function fillLoginForm(page: Page) {
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page
    .getByRole('textbox', { name: 'Пароль' })
    .fill(E2E_PORTAL_USER.password)
}

async function routeStoppedRealtime(page: Page) {
  await page.route('**/api/chat/realtime**', async (route) => {
    await route.fulfill({
      status: 204,
    })
  })
}

async function routeChatShell(page: Page) {
  await page.route('**/api/chat/threads', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeThreadId: privateThread.id,
        threads: [privateThread],
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/messages**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeThread: privateThread,
        hasMoreOlder: false,
        messages: [
          {
            attachments: [],
            authorName: 'Ольга Support',
            authorRole: 'agent',
            content: 'Проверяем уведомления.',
            contentType: 'text',
            createdAt: '2026-05-23T08:20:00.000Z',
            direction: 'incoming',
            id: 204,
            status: 'sent',
          },
        ],
        nextOlderCursor: null,
        reason: 'none',
        result: 'ready',
      }),
      contentType: 'application/json',
      status: 200,
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
  await routeStoppedRealtime(page)
}

async function routePushUnavailable(page: Page) {
  await page.route('**/api/notifications/push/public-key', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        available: false,
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
}

function resolveEffectiveSettings({
  globalSettings,
  overrides,
}: {
  globalSettings: {
    newMessagesEnabled: boolean
    pushEnabled: boolean
    soundEnabled: boolean
  }
  overrides: {
    newMessagesEnabled: boolean | null
    pushEnabled: boolean | null
    soundEnabled: boolean | null
  }
}) {
  const newMessagesEnabled =
    globalSettings.newMessagesEnabled && (overrides.newMessagesEnabled ?? true)

  return {
    newMessagesEnabled,
    pushEnabled:
      newMessagesEnabled &&
      (overrides.pushEnabled ?? globalSettings.pushEnabled),
    soundEnabled:
      newMessagesEnabled &&
      (overrides.soundEnabled ?? globalSettings.soundEnabled),
  }
}

async function routeNotificationSettings(page: Page) {
  const globalSettings = {
    newMessagesEnabled: true,
    pushEnabled: false,
    soundEnabled: true,
  }
  const chatOverrides = {
    newMessagesEnabled: null as boolean | null,
    pushEnabled: null as boolean | null,
    soundEnabled: null as boolean | null,
  }

  await page.route('**/api/notifications/settings', async (route) => {
    if (route.request().method() === 'PATCH') {
      const patch = (await route.request().postDataJSON()) as Partial<
        typeof globalSettings
      >

      Object.assign(globalSettings, patch)
    }

    await route.fulfill({
      body: JSON.stringify(globalSettings),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route(
    '**/api/chat/threads/*/notification-settings',
    async (route) => {
      if (route.request().method() === 'PATCH') {
        const patch = (await route.request().postDataJSON()) as Partial<
          typeof chatOverrides
        >

        Object.assign(chatOverrides, patch)
      }

      await route.fulfill({
        body: JSON.stringify({
          effective: resolveEffectiveSettings({
            globalSettings,
            overrides: chatOverrides,
          }),
          global: globalSettings,
          overrides: chatOverrides,
          threadId: privateThread.id,
        }),
        contentType: 'application/json',
        status: 200,
      })
    },
  )
}

test('opens global and chat notification settings and toggles visible controls', async ({
  page,
}) => {
  await routeChatShell(page)
  await routeNotificationSettings(page)
  await routePushUnavailable(page)

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(page.getByText('Проверяем уведомления.')).toBeVisible()

  await page.getByRole('button', { name: 'Открыть навигацию' }).click()
  await page.getByRole('menuitem', { name: 'Настройки' }).click()
  await expect(page).toHaveURL(/\/app\/settings/)
  await page.getByRole('button', { name: /Уведомления/ }).click()
  await expect(page).toHaveURL(/\/app\/settings\/notifications/)

  const globalPage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Уведомления' }),
  })
  const globalMessagesSwitch = globalPage.getByRole('switch', {
    name: /Новые сообщения/,
  })
  const globalSoundSwitch = globalPage.getByRole('switch', { name: /Звук/ })

  await expect(globalMessagesSwitch).toHaveAttribute('aria-checked', 'true')
  await globalMessagesSwitch.click()
  await expect(globalMessagesSwitch).toHaveAttribute('aria-checked', 'false')
  await globalMessagesSwitch.click()
  await expect(globalMessagesSwitch).toHaveAttribute('aria-checked', 'true')
  await globalSoundSwitch.click()
  await expect(globalSoundSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(
    globalPage.getByRole('switch', { name: /Push-уведомления/ }),
  ).toBeDisabled()

  await page.goto('/app/chat')
  await expect(page.getByText('Проверяем уведомления.')).toBeVisible()
  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: /^Уведомления/ }).click()

  const chatPage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Уведомления' }),
  })

  await expect(
    chatPage.getByRole('heading', { name: 'Личный чат' }),
  ).toBeVisible()
  await expect(chatPage.getByText('Используются общие настройки')).toBeVisible()
  await chatPage.getByRole('switch', { name: /Звук/ }).click()
  await expect(
    chatPage.getByText('Есть настройки для этого чата'),
  ).toBeVisible()
  await chatPage
    .getByRole('button', { name: 'Сбросить к общим настройкам' })
    .click()
  await expect(chatPage.getByText('Используются общие настройки')).toBeVisible()
})
