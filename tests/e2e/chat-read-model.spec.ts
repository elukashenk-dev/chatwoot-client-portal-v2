import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

function createReadySnapshot({
  hasMoreOlder,
  messages,
  nextOlderCursor,
}: {
  hasMoreOlder: boolean
  messages: Array<Record<string, unknown>>
  nextOlderCursor: number | null
}) {
  return {
    hasMoreOlder,
    linkedContact: {
      id: 42,
    },
    messages,
    nextOlderCursor,
    primaryConversation: {
      assigneeName: 'Ольга Support',
      id: 77,
      inboxId: 6,
      lastActivityAt: 1_777_000_000,
      status: 'open',
    },
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

test('renders the ready chat transcript and loads older history through the backend contract', async ({
  page,
}) => {
  const chatMessageRequests: string[] = []

  await page.route('**/api/chat/messages*', async (route) => {
    const requestUrl = new URL(route.request().url())

    chatMessageRequests.push(`${requestUrl.pathname}${requestUrl.search}`)

    if (requestUrl.searchParams.get('beforeMessageId') === '205') {
      await route.fulfill({
        body: JSON.stringify(
          createReadySnapshot({
            hasMoreOlder: false,
            messages: [
              {
                attachments: [],
                authorName: 'Вы',
                content: 'Ранее отправленное сообщение.',
                contentType: 'text',
                createdAt: '2026-04-20T08:00:00.000Z',
                direction: 'outgoing',
                id: 120,
                status: 'sent',
              },
            ],
            nextOlderCursor: null,
          }),
        ),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: JSON.stringify(
        createReadySnapshot({
          hasMoreOlder: true,
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              content: 'Здравствуйте, вижу ваше обращение.',
              contentType: 'text',
              createdAt: '2026-04-21T09:12:00.000Z',
              direction: 'incoming',
              id: 204,
              status: 'sent',
            },
            {
              attachments: [
                {
                  fileSize: 24576,
                  fileType: 'pdf',
                  id: 9,
                  name: 'invoice.pdf',
                  thumbUrl: '',
                  url: 'https://example.test/invoice.pdf',
                },
              ],
              authorName: 'Вы',
              content: 'Последнее сообщение.',
              contentType: 'text',
              createdAt: '2026-04-21T10:00:00.000Z',
              direction: 'outgoing',
              id: 205,
              status: 'sent',
            },
          ],
          nextOlderCursor: 205,
        }),
      ),
      contentType: 'application/json',
      status: 200,
    })
  })

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(
    page.getByRole('heading', { name: 'Клиентский чат' }),
  ).toBeVisible()
  await expect(page.getByText('Ольга Support', { exact: true })).toBeVisible()
  await expect(page.getByText('В работе')).toBeVisible()
  await expect(
    page.getByText('Здравствуйте, вижу ваше обращение.'),
  ).toBeVisible()
  await expect(page.getByText('Последнее сообщение.')).toBeVisible()
  await expect(page.getByText('invoice.pdf')).toBeVisible()

  await page
    .getByRole('button', { name: 'Загрузить более ранние сообщения' })
    .click()

  await expect(page.getByText('Ранее отправленное сообщение.')).toBeVisible()
  expect(chatMessageRequests).toEqual([
    '/api/chat/messages',
    '/api/chat/messages?primaryConversationId=77&beforeMessageId=205',
  ])
})
