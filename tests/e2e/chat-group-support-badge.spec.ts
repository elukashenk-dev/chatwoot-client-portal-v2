import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
} as const

async function fillLoginForm(page: Page) {
  await page.getByLabel('Email').fill(E2E_PORTAL_USER.email)
  await page
    .getByRole('textbox', { name: 'Пароль' })
    .fill(E2E_PORTAL_USER.password)
}

async function routeGroupChat(page: Page) {
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
            authorName: 'Анна Support',
            authorRole: 'agent',
            content: 'Проверила документы.',
            contentType: 'text',
            createdAt: '2026-05-19T09:00:00.000Z',
            direction: 'incoming',
            id: 804,
            status: 'sent',
          },
          {
            attachments: [],
            authorName: 'Анна Support',
            authorRole: 'agent',
            content: 'Счет-фактура нужна в том же треде.',
            contentType: 'text',
            createdAt: '2026-05-19T09:00:30.000Z',
            direction: 'incoming',
            id: 805,
            status: 'sent',
          },
          {
            attachments: [],
            authorName: 'Иван Петров',
            authorRole: 'group_member',
            content: 'Сейчас добавлю.',
            contentType: 'text',
            createdAt: '2026-05-19T09:01:00.000Z',
            direction: 'incoming',
            id: 806,
            status: 'sent',
          },
          {
            attachments: [],
            authorName: 'Анна Support',
            authorRole: 'agent',
            content: 'Спасибо, вижу файл.',
            contentType: 'text',
            createdAt: '2026-05-19T09:02:00.000Z',
            direction: 'incoming',
            id: 807,
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

test('shows support badges only on first messages of group support blocks', async ({
  page,
}) => {
  await routeGroupChat(page)

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(page.getByText('Проверила документы.')).toBeVisible()
  await expect(
    page.getByText('Счет-фактура нужна в том же треде.'),
  ).toBeVisible()
  await expect(page.getByText('Сейчас добавлю.')).toBeVisible()
  await expect(page.getByText('Спасибо, вижу файл.')).toBeVisible()
  await expect(page.getByText('Поддержка')).toHaveCount(2)
})
