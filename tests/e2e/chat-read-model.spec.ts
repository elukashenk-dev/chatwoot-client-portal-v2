import { Buffer } from 'node:buffer'

import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Только вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

function createThreadsResponse() {
  return {
    activeThreadId: privateThread.id,
    threads: [privateThread],
  }
}

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
    activeThread: privateThread,
    hasMoreOlder,
    messages,
    nextOlderCursor,
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

async function routePrivateThreads(page: Page) {
  await page.route('**/api/chat/threads', async (route) => {
    await route.fulfill({
      body: JSON.stringify(createThreadsResponse()),
      contentType: 'application/json',
      status: 200,
    })
  })
}

async function routeStoppedRealtime(page: Page) {
  await page.route('**/api/chat/realtime**', async (route) => {
    await route.fulfill({
      status: 204,
    })
  })
}

test('renders the ready chat transcript and loads older history through the backend contract', async ({
  page,
}) => {
  const chatMessageRequests: string[] = []

  await routePrivateThreads(page)
  await routeStoppedRealtime(page)
  await page.route('**/api/chat/messages**', async (route) => {
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
                authorRole: 'current_user',
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
              authorRole: 'agent',
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
              authorRole: 'current_user',
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
  await expect(page.getByRole('heading', { name: 'Личный чат' })).toBeVisible()
  await expect(page.getByText('Ольга Support', { exact: true })).toBeVisible()
  await expect(page.getByText('Онлайн')).toBeVisible()
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
    '/api/chat/messages?threadId=private%3Ame',
    '/api/chat/messages?threadId=private%3Ame&beforeMessageId=205',
  ])
})

test('sends text through the backend chat contract and renders the canonical response', async ({
  page,
}) => {
  const chatMessageRequests: Array<{
    body: Record<string, unknown> | null
    method: string
    path: string
  }> = []

  await routePrivateThreads(page)
  await routeStoppedRealtime(page)
  await page.route('**/api/chat/messages**', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const method = request.method()

    chatMessageRequests.push({
      body: method === 'POST' ? JSON.parse(request.postData() ?? '{}') : null,
      method,
      path: `${requestUrl.pathname}${requestUrl.search}`,
    })

    if (method === 'POST') {
      await route.fulfill({
        body: JSON.stringify({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: 'Сообщение из портала',
            contentType: 'text',
            createdAt: '2026-04-21T10:10:00.000Z',
            direction: 'outgoing',
            id: 501,
            status: 'sent',
          },
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: JSON.stringify(
        createReadySnapshot({
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
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
  await page
    .getByRole('textbox', { name: 'Сообщение' })
    .fill('Сообщение из портала')
  await page.getByRole('button', { name: 'Отправить' }).click()

  await expect(page.getByText('Сообщение из портала')).toBeVisible()
  expect(chatMessageRequests).toHaveLength(2)
  expect(chatMessageRequests[0]).toMatchObject({
    method: 'GET',
    path: '/api/chat/messages?threadId=private%3Ame',
  })
  expect(chatMessageRequests[1]).toMatchObject({
    body: {
      clientMessageKey: expect.stringMatching(/^portal-send:/),
      content: 'Сообщение из портала',
      threadId: 'private:me',
    },
    method: 'POST',
    path: '/api/chat/messages',
  })
})

test('selects a message as reply target and sends reply metadata through the backend contract', async ({
  page,
}) => {
  const chatMessageRequests: Array<{
    body: Record<string, unknown> | null
    method: string
    path: string
  }> = []

  await routePrivateThreads(page)
  await routeStoppedRealtime(page)
  await page.route('**/api/chat/messages**', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const method = request.method()

    chatMessageRequests.push({
      body: method === 'POST' ? JSON.parse(request.postData() ?? '{}') : null,
      method,
      path: `${requestUrl.pathname}${requestUrl.search}`,
    })

    if (method === 'POST') {
      await route.fulfill({
        body: JSON.stringify({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: 'Ответ из портала',
            contentType: 'text',
            createdAt: '2026-04-21T10:11:00.000Z',
            direction: 'outgoing',
            id: 502,
            replyTo: {
              attachmentName: null,
              authorName: 'Ольга Support',
              content: 'Вопрос от агента.',
              direction: 'incoming',
              messageId: 204,
            },
            status: 'sent',
          },
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: JSON.stringify(
        createReadySnapshot({
          hasMoreOlder: false,
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Вопрос от агента.',
              contentType: 'text',
              createdAt: '2026-04-21T09:12:00.000Z',
              direction: 'incoming',
              id: 204,
              status: 'sent',
            },
          ],
          nextOlderCursor: null,
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
  await page.getByText('Вопрос от агента.').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Ответить' }).click()
  await expect(page.getByText('Ответ на сообщение Ольга Support')).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Сообщение' })
    .fill('Ответ из портала')
  await page.getByRole('button', { name: 'Отправить' }).click()

  await expect(page.getByText('Ответ из портала')).toBeVisible()
  await expect.poll(() => chatMessageRequests.length).toBe(2)
  expect(chatMessageRequests[1]).toMatchObject({
    body: {
      clientMessageKey: expect.stringMatching(/^portal-send:/),
      content: 'Ответ из портала',
      replyToMessageId: 204,
      threadId: 'private:me',
    },
    method: 'POST',
    path: '/api/chat/messages',
  })
})

test('sends an attachment through the backend chat contract and renders the canonical response', async ({
  page,
}) => {
  const chatMessageRequests: Array<{
    contentType: string | null
    method: string
    path: string
  }> = []

  await routePrivateThreads(page)
  await routeStoppedRealtime(page)
  await page.route('**/api/chat/messages**', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const method = request.method()
    const path = `${requestUrl.pathname}${requestUrl.search}`

    chatMessageRequests.push({
      contentType: request.headers()['content-type'] ?? null,
      method,
      path,
    })

    if (method === 'POST' && requestUrl.pathname.endsWith('/attachment')) {
      await route.fulfill({
        body: JSON.stringify({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [
              {
                fileSize: 1024,
                fileType: 'file',
                id: 77,
                name: 'signed-act.pdf',
                thumbUrl: '',
                url: 'https://files.example.test/signed-act.pdf',
              },
            ],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: null,
            contentType: 'text',
            createdAt: '2026-04-21T10:12:00.000Z',
            direction: 'outgoing',
            id: 601,
            status: 'sent',
          },
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: JSON.stringify(
        createReadySnapshot({
          hasMoreOlder: false,
          messages: [],
          nextOlderCursor: null,
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
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('%PDF-1.7\n'),
    mimeType: 'application/pdf',
    name: 'signed-act.pdf',
  })
  await page.getByRole('button', { name: 'Отправить файл' }).click()

  await expect.poll(() => chatMessageRequests.length).toBe(2)
  await expect(page.getByText('signed-act.pdf')).toBeVisible()
  expect(chatMessageRequests).toEqual([
    {
      contentType: null,
      method: 'GET',
      path: '/api/chat/messages?threadId=private%3Ame',
    },
    {
      contentType: expect.stringContaining('multipart/form-data'),
      method: 'POST',
      path: '/api/chat/messages/attachment',
    },
  ])
})

test('renders new backend realtime messages without a manual transcript refresh', async ({
  page,
}) => {
  const realtimeSnapshot = createReadySnapshot({
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Ольга Support',
        authorRole: 'agent',
        content: 'Realtime ответ от агента.',
        contentType: 'text',
        createdAt: '2026-04-21T10:20:00.000Z',
        direction: 'incoming',
        id: 701,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
  })

  await routePrivateThreads(page)
  await page.route('**/api/chat/realtime**', async (route) => {
    await route.fulfill({
      body: `event: messages\ndata: ${JSON.stringify(realtimeSnapshot)}\n\n`,
      contentType: 'text/event-stream',
      status: 200,
    })
  })
  await page.route('**/api/chat/messages**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        createReadySnapshot({
          hasMoreOlder: false,
          messages: [
            {
              attachments: [],
              authorName: 'Вы',
              authorRole: 'current_user',
              content: 'Текущее сообщение в истории.',
              contentType: 'text',
              createdAt: '2026-04-21T10:00:00.000Z',
              direction: 'outgoing',
              id: 700,
              status: 'sent',
            },
          ],
          nextOlderCursor: null,
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
  await expect(page.getByText('Текущее сообщение в истории.')).toBeVisible()
  await expect(page.getByText('Realtime ответ от агента.')).toBeVisible()
})
