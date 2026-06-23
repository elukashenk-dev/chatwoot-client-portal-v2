import { Buffer } from 'node:buffer'

import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
} as const

const tenant = {
  displayName: 'Бухфирма',
  primaryDomain: '127.0.0.1',
  publicBaseUrl: 'http://127.0.0.1:4173',
  slug: 'buhfirma',
}

const avatarPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
  'base64',
)

async function fillLoginForm(page: Page) {
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page
    .getByRole('textbox', { name: 'Пароль' })
    .fill(E2E_PORTAL_USER.password)
}

async function routeAuthBootstrap(page: Page) {
  let isAuthenticated = false

  await page.route('**/api/tenant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { tenant },
      status: 200,
    })
  })
  await page.route('**/api/branding', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {},
      status: 200,
    })
  })
  await page.route('**/api/auth/me', async (route) => {
    if (!isAuthenticated) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Требуется вход.',
          },
        },
        status: 401,
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        session: {
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        user: {
          email: E2E_PORTAL_USER.email,
          fullName: E2E_PORTAL_USER.fullName,
          id: 7,
        },
      },
      status: 200,
    })
  })
  await page.route('**/api/auth/login', async (route) => {
    isAuthenticated = true
    await route.fulfill({
      contentType: 'application/json',
      json: {
        session: {
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        user: {
          email: E2E_PORTAL_USER.email,
          fullName: E2E_PORTAL_USER.fullName,
          id: 7,
        },
      },
      status: 200,
    })
  })
  await page.route('**/api/notifications/settings', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        newMessagesEnabled: true,
        pushEnabled: false,
        soundEnabled: true,
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
}

async function routeChatShell(page: Page) {
  await page.route('**/api/chat/threads', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeThreadId: groupThread.id,
        threads: [{ ...groupThread, unreadCount: 0 }],
        totalUnreadCount: 0,
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/messages**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeThread: groupThread,
        hasMoreOlder: false,
        messages: [
          {
            attachments: [],
            authorAvatarUrl:
              '/api/chat/threads/group%3A154/participants/8/avatar',
            authorName: 'Мария Соколова',
            authorRole: 'group_member',
            content: 'Сообщение из общего чата с аватаркой.',
            contentType: 'text',
            createdAt: '2026-05-19T09:00:00.000Z',
            direction: 'incoming',
            id: 804,
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
  await page.route('**/api/chat/realtime**', async (route) => {
    await route.fulfill({ status: 204 })
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
  await page.route(
    '**/api/chat/threads/*/notification-settings',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          effective: {
            newMessagesEnabled: true,
            soundEnabled: true,
          },
          global: {
            newMessagesEnabled: true,
            soundEnabled: true,
          },
          overrides: {
            newMessagesEnabled: null,
            soundEnabled: null,
          },
          threadId: groupThread.id,
        }),
        contentType: 'application/json',
        status: 200,
      })
    },
  )
  await page.route('**/api/chat/threads/*/read', async (route) => {
    await route.fulfill({ status: 204 })
  })
}

async function routeChatInfo(page: Page) {
  await page.route('**/api/chat/threads/*/info', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        accessLabel: 'Участники группы и поддержка',
        activeThread: groupThread,
        curatorName: 'Анна Маттина',
        lastActivityAt: '2026-05-19T10:20:00.000Z',
        participants: [
          {
            avatarUrl: '/api/chat/threads/group%3A154/participants/7/avatar',
            displayName: 'Иван Петров',
            id: 'portal-user:7',
            isCurrentUser: true,
          },
          {
            avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
            displayName: 'Мария Соколова',
            id: 'portal-user:8',
            isCurrentUser: false,
          },
        ],
        reason: 'none',
        result: 'ready',
        startedAt: '2026-05-18T09:00:00.000Z',
        supportLabel: 'Команда Local Test Tenant',
        threadTypeLabel: 'Групповой',
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route(
    '**/api/chat/threads/*/participants/*/avatar',
    async (route) => {
      await route.fulfill({
        body: avatarPng,
        contentType: 'image/png',
        status: 200,
      })
    },
  )
}

test('shows group participant avatars through portal URLs', async ({
  page,
}) => {
  await routeAuthBootstrap(page)
  await routeChatShell(page)
  await routeChatInfo(page)

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(
    page.getByText('Сообщение из общего чата с аватаркой.'),
  ).toBeVisible()

  const transcriptAvatar = page.locator(
    '[data-author-avatar] img[src^="/api/chat/threads/"][src*="/participants/8/avatar"]',
  )

  await expect(transcriptAvatar).toBeVisible()
  await expect(transcriptAvatar).toHaveAttribute(
    'src',
    '/api/chat/threads/group%3A154/participants/8/avatar',
  )

  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Информация о чате' }).click()

  const infoPage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Информация о чате' }),
  })

  await expect(
    infoPage.getByRole('heading', { name: 'Информация о чате' }),
  ).toBeVisible()
  await expect(
    infoPage.getByRole('img', { name: 'Мария Соколова' }),
  ).toHaveAttribute(
    'src',
    '/api/chat/threads/group%3A154/participants/8/avatar',
  )
})
