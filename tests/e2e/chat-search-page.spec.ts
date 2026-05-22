import { expect, type Page, test } from '@playwright/test'

import { E2E_PORTAL_USER } from '../../backend/src/test/e2ePortalUser.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

const groupThread = {
  id: 'group:154',
  subtitle: 'Групповой чат',
  title: 'ООО "Ромашка"',
  type: 'group',
} as const

function createThreadsResponse(threads = [privateThread]) {
  return {
    activeThreadId: privateThread.id,
    threads,
  }
}

function createReadySnapshot({
  activeThread = privateThread,
  messages,
}: {
  activeThread?: typeof privateThread | typeof groupThread
  messages: Array<Record<string, unknown>>
}) {
  return {
    activeThread,
    hasMoreOlder: false,
    messages,
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

async function routeThreads(page: Page, threads = [privateThread]) {
  await page.route('**/api/chat/threads', async (route) => {
    await route.fulfill({
      body: JSON.stringify(createThreadsResponse(threads)),
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

async function routeSupportAvailability(page: Page) {
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

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function routeSearchContext(page: Page, contextRequests: string[]) {
  await page.route(
    '**/api/chat/threads/*/messages/context**',
    async (route) => {
      const requestUrl = new URL(route.request().url())
      const direction = requestUrl.searchParams.get('direction')
      const cursor = requestUrl.searchParams.get('cursor')

      contextRequests.push(`${requestUrl.pathname}${requestUrl.search}`)

      if (direction === 'earlier' && cursor === '600') {
        await route.fulfill({
          body: JSON.stringify({
            activeThread: groupThread,
            earlierCursor: null,
            hasMoreEarlier: false,
            hasMoreLater: true,
            laterCursor: null,
            messages: [
              {
                attachments: [],
                authorName: 'Ольга Support',
                authorRole: 'agent',
                content: 'Еще более ранний контекст.',
                contentType: 'text',
                createdAt: '2026-05-18T08:16:00.000Z',
                direction: 'incoming',
                id: 590,
                status: 'sent',
              },
            ],
            reason: 'none',
            result: 'ready',
            targetMessageId: 602,
          }),
          contentType: 'application/json',
          status: 200,
        })
        return
      }

      if (direction === 'later' && cursor === '604') {
        await route.fulfill({
          body: JSON.stringify({
            activeThread: groupThread,
            earlierCursor: null,
            hasMoreEarlier: true,
            hasMoreLater: false,
            laterCursor: null,
            messages: [
              {
                attachments: [],
                authorName: 'Иван Петров',
                authorRole: 'group_member',
                content: 'Более поздний контекст.',
                contentType: 'text',
                createdAt: '2026-05-18T08:26:00.000Z',
                direction: 'incoming',
                id: 610,
                status: 'sent',
              },
            ],
            reason: 'none',
            result: 'ready',
            targetMessageId: 602,
          }),
          contentType: 'application/json',
          status: 200,
        })
        return
      }

      await route.fulfill({
        body: JSON.stringify({
          activeThread: groupThread,
          earlierCursor: 600,
          hasMoreEarlier: true,
          hasMoreLater: true,
          laterCursor: 604,
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Перед старым договором обсудили оплату.',
              contentType: 'text',
              createdAt: '2026-05-18T08:18:00.000Z',
              direction: 'incoming',
              id: 600,
              status: 'sent',
            },
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Старый договор найден.',
              contentType: 'text',
              createdAt: '2026-05-18T08:20:00.000Z',
              direction: 'incoming',
              id: 602,
              status: 'sent',
            },
            {
              attachments: [],
              authorName: 'Иван Петров',
              authorRole: 'group_member',
              content: 'После старого договора согласовали сроки.',
              contentType: 'text',
              createdAt: '2026-05-18T08:22:00.000Z',
              direction: 'incoming',
              id: 604,
              status: 'sent',
            },
          ],
          reason: 'none',
          result: 'ready',
          targetMessageId: 602,
        }),
        contentType: 'application/json',
        status: 200,
      })
    },
  )
}

test('opens private chat search, finds a visible message, and returns to transcript', async ({
  page,
}) => {
  const searchRequests: string[] = []

  await routeThreads(page)
  await routeStoppedRealtime(page)
  await routeSupportAvailability(page)
  await page.route('**/api/chat/messages**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        createReadySnapshot({
          messages: [
            {
              attachments: [],
              authorName: 'Ольга Support',
              authorRole: 'agent',
              content: 'Договор готов к подписанию.',
              contentType: 'text',
              createdAt: '2026-05-20T08:20:00.000Z',
              direction: 'incoming',
              id: 204,
              status: 'sent',
            },
          ],
        }),
      ),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/threads/*/search**', async (route) => {
    const requestUrl = new URL(route.request().url())

    searchRequests.push(`${requestUrl.pathname}${requestUrl.search}`)
    await wait(250)
    await route.fulfill({
      body: JSON.stringify({
        activeThread: privateThread,
        hasMoreOlder: false,
        items: [
          {
            afterSnippet: null,
            authorName: 'Ольга Support',
            authorRole: 'agent',
            beforeSnippet: null,
            content: 'Договор готов к подписанию.',
            createdAt: '2026-05-20T08:20:00.000Z',
            direction: 'incoming',
            id: 'message:204',
            matchRanges: [{ start: 0, end: 7 }],
            messageId: 204,
          },
        ],
        nextOlderCursor: null,
        query: 'договор',
        reason: 'none',
        result: 'ready',
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(page.getByText('Договор готов к подписанию.')).toBeVisible()
  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Поиск по чату' }).click()

  const searchPage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Поиск по чату' }),
  })

  await expect(
    searchPage.getByRole('heading', { name: 'Поиск по чату' }),
  ).toBeVisible()
  await expect(searchPage.getByText('Личный чат')).toBeVisible()
  await expect(searchPage.getByText('Вы и поддержка')).toBeVisible()
  const searchInput = searchPage.getByLabel('Поиск по чату')

  await searchInput.fill('до')
  await expect(searchPage.getByText('Ищем сообщения.')).toBeVisible()
  await expect(searchInput).toBeFocused()
  await expect(searchPage.getByText('Личный чат')).toBeVisible()
  await searchInput.fill('договор ')
  await expect(searchInput).toHaveValue('договор ')
  await expect(
    searchPage.getByText('Договор готов к подписанию.'),
  ).toBeVisible()
  await expect(searchPage.locator('[data-search-match]').first()).toHaveText(
    'Договор',
  )

  await searchPage.getByRole('button', { name: /Открыть место/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Поиск по чату' }),
  ).toBeHidden()
  await expect(page.getByText('Договор готов к подписанию.')).toBeVisible()
  expect(searchRequests).toEqual([
    '/api/chat/threads/private%3Ame/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80',
  ])
})

test('opens group chat search with context preview and loads older results', async ({
  page,
}) => {
  const contextRequests: string[] = []
  const searchRequests: string[] = []

  await routeThreads(page, [privateThread, groupThread])
  await routeStoppedRealtime(page)
  await routeSupportAvailability(page)
  await routeSearchContext(page, contextRequests)
  await page.route('**/api/chat/messages**', async (route) => {
    const requestUrl = new URL(route.request().url())

    if (requestUrl.searchParams.get('threadId') === 'group:154') {
      await route.fulfill({
        body: JSON.stringify(
          createReadySnapshot({
            activeThread: groupThread,
            messages: [
              {
                attachments: [],
                authorName: 'Иван Петров',
                authorRole: 'group_member',
                content: 'Сообщение из группового чата.',
                contentType: 'text',
                createdAt: '2026-05-19T09:00:00.000Z',
                direction: 'incoming',
                id: 804,
                status: 'sent',
              },
            ],
          }),
        ),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: JSON.stringify(createReadySnapshot({ messages: [] })),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/threads/*/search**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const beforeMessageId = requestUrl.searchParams.get('beforeMessageId')

    searchRequests.push(`${requestUrl.pathname}${requestUrl.search}`)

    if (beforeMessageId === '804') {
      await route.fulfill({
        body: JSON.stringify({
          activeThread: groupThread,
          hasMoreOlder: false,
          items: [
            {
              afterSnippet: null,
              authorName: 'Ольга Support',
              authorRole: 'agent',
              beforeSnippet: 'Вопрос по оплате',
              content: 'Старый договор найден.',
              createdAt: '2026-05-18T08:20:00.000Z',
              direction: 'incoming',
              id: 'message:602',
              matchRanges: [{ start: 7, end: 14 }],
              messageId: 602,
            },
          ],
          nextOlderCursor: null,
          query: 'договор',
          reason: 'none',
          result: 'ready',
        }),
        contentType: 'application/json',
        status: 200,
      })
      return
    }

    await route.fulfill({
      body: JSON.stringify({
        activeThread: groupThread,
        hasMoreOlder: true,
        items: [
          {
            afterSnippet: 'Спасибо, подпишем сегодня.',
            authorName: 'Иван Петров',
            authorRole: 'group_member',
            beforeSnippet: 'Добрый день.',
            content: 'Новый договор готов к подписанию.',
            createdAt: '2026-05-19T10:20:00.000Z',
            direction: 'incoming',
            id: 'message:804',
            matchRanges: [{ start: 6, end: 13 }],
            messageId: 804,
          },
        ],
        nextOlderCursor: 804,
        query: 'договор',
        reason: 'none',
        result: 'ready',
      }),
      contentType: 'application/json',
      status: 200,
    })
  })

  await page.goto('/auth/login')
  await fillLoginForm(page)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/app\/chat/)
  await page.getByRole('button', { name: 'Открыть навигацию' }).click()
  await page.getByRole('menuitem', { name: /ООО "Ромашка"/ }).click()
  await expect(page.getByText('Сообщение из группового чата.')).toBeVisible()

  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Поиск по чату' }).click()

  const searchPage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Поиск по чату' }),
  })

  await expect(searchPage.getByText('ООО "Ромашка"')).toBeVisible()
  await expect(searchPage.getByText('Групповой чат')).toBeVisible()
  await searchPage.getByLabel('Поиск по чату').fill('договор')
  await expect(
    searchPage.getByText('Новый договор готов к подписанию.'),
  ).toBeVisible()
  await expect(searchPage.getByText('Добрый день.')).toBeVisible()
  await expect(searchPage.getByText('Спасибо, подпишем сегодня.')).toBeVisible()

  const viewportSize = page.viewportSize()
  const searchPageBox = await searchPage.boundingBox()

  expect(viewportSize).not.toBeNull()
  expect(searchPageBox).not.toBeNull()
  expect(Math.round(searchPageBox?.width ?? 0)).toBe(
    Math.min(viewportSize?.width ?? 0, 500),
  )

  await searchPage.getByRole('button', { name: 'Показать ещё' }).click()
  await expect(searchPage.getByText('Старый договор найден.')).toBeVisible()
  await searchPage
    .getByRole('button', { name: /Открыть место/ })
    .last()
    .click()

  await expect(
    page.getByRole('heading', { name: 'Поиск по чату' }),
  ).toBeHidden()
  await expect(page.getByText('Показан фрагмент истории')).toBeVisible()
  await expect(
    page.getByText('Перед старым договором обсудили оплату.'),
  ).toBeVisible()
  await expect(page.getByText('Старый договор найден.')).toBeVisible()
  await expect(
    page
      .locator('[data-message-highlighted="true"]')
      .getByText('Старый договор найден.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Показать более ранние' }).click()
  await expect(page.getByText('Еще более ранний контекст.')).toBeVisible()
  await page.getByRole('button', { name: 'Показать более поздние' }).click()
  await expect(page.getByText('Более поздний контекст.')).toBeVisible()
  await page.getByRole('button', { name: 'К последним сообщениям' }).click()
  await expect(page.getByText('Сообщение из группового чата.')).toBeVisible()
  await expect(page.getByText('Показан фрагмент истории')).toBeHidden()
  expect(searchRequests).toEqual([
    '/api/chat/threads/group%3A154/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80',
    '/api/chat/threads/group%3A154/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80&beforeMessageId=804',
  ])
  expect(contextRequests).toEqual([
    '/api/chat/threads/group%3A154/messages/context?messageId=602',
    '/api/chat/threads/group%3A154/messages/context?messageId=602&direction=earlier&cursor=600',
    '/api/chat/threads/group%3A154/messages/context?messageId=602&direction=later&cursor=604',
  ])
})
