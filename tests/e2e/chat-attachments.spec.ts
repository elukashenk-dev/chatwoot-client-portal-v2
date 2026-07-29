import { Buffer } from 'node:buffer'

import { expect, test, type Page, type Route } from '@playwright/test'

import { seedAndLoginCustomerWithEmailCode } from './support/customerAuth.ts'
import { readLastActiveIdentity } from './support/offlinePwaStorage.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

type AttachmentPostHandler = (route: Route) => Promise<void>

async function installEmptyChatRuntime({
  onAttachmentPost,
  page,
}: {
  onAttachmentPost: AttachmentPostHandler
  page: Page
}) {
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
          isWithinWorkingHours: true,
          rows: [],
          timezone: 'Europe/Samara',
        },
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/messages**', async (route) => {
    const requestUrl = new URL(route.request().url())

    if (
      route.request().method() === 'POST' &&
      requestUrl.pathname === '/api/chat/messages/attachments'
    ) {
      await onAttachmentPost(route)
      return
    }

    await route.fulfill({
      body: JSON.stringify({
        activeThread: privateThread,
        hasMoreOlder: false,
        messages: [],
        nextOlderCursor: null,
        reason: 'none',
        result: 'ready',
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
}

async function openMockedChat({
  page,
  prefix,
}: {
  page: Page
  prefix: string
}) {
  await seedAndLoginCustomerWithEmailCode({ page, prefix })
  await expect(page).toHaveURL(/\/app\/chat/)
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toBeVisible()
}

function createAttachmentSendResult({
  content = null,
  id,
  names,
}: {
  content?: string | null
  id: number
  names: string[]
}) {
  return {
    activeThread: privateThread,
    reason: 'none',
    result: 'ready',
    sentMessage: {
      attachments: names.map((name, index) => ({
        fileSize: null,
        fileType: 'file',
        id: 100 + index,
        name,
        thumbUrl: '',
        url: `/api/chat/threads/private%3Ame/attachments/${id}/${100 + index}`,
      })),
      authorName: 'Вы',
      authorRole: 'current_user',
      content,
      contentType: 'text',
      createdAt: '2026-07-29T12:00:00.000Z',
      direction: 'outgoing',
      id,
      status: 'sent',
    },
  }
}

async function fulfillAttachmentSuccess({
  content,
  id,
  names,
  route,
}: {
  content?: string | null
  id: number
  names: string[]
  route: Route
}) {
  await route.fulfill({
    body: JSON.stringify(createAttachmentSendResult({ content, id, names })),
    contentType: 'application/json',
    status: 200,
  })
}

function readMultipartField(body: string, fieldName: string) {
  return (
    new RegExp(`name="${fieldName}"\\r\\n\\r\\n([^\\r\\n]+)`).exec(body)?.[1] ??
    null
  )
}

async function seedPendingShareDraft({
  draftId,
  fileName,
  page,
  userIdOffset = 0,
}: {
  draftId: string
  fileName: string
  page: Page
  userIdOffset?: number
}) {
  const identity = await readLastActiveIdentity(page)

  await page.evaluate(
    async ({ draftId, fileName, identity, userIdOffset }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portal-offline', 3)

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          'pending_share_drafts',
          'readwrite',
        )
        const pngBytes = Uint8Array.from(
          atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          ),
          (character) => character.charCodeAt(0),
        )

        transaction.objectStore('pending_share_drafts').put({
          createdAt: new Date().toISOString(),
          draftId,
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          files: [
            {
              blob: new Blob([pngBytes], { type: 'image/png' }),
              fileName,
              lastModified: Date.now(),
              mimeType: 'image/png',
            },
          ],
          host: window.location.host,
          tenantSlug: identity.tenantSlug,
          userId: identity.userId + userIdOffset,
        })
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () => {
          database.close()
          reject(transaction.error)
        }
        transaction.onabort = () => {
          database.close()
          reject(transaction.error)
        }
      })
    },
    { draftId, fileName, identity, userIdOffset },
  )

  return identity
}

async function pendingShareDraftExists(page: Page, draftId: string) {
  return page.evaluate(async (pendingDraftId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('portal-offline', 3)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction(
        'pending_share_drafts',
        'readonly',
      )
      const request = transaction
        .objectStore('pending_share_drafts')
        .get(pendingDraftId)

      request.onsuccess = () => resolve(request.result !== undefined)
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => database.close()
      transaction.onabort = () => database.close()
    })
  }, draftId)
}

test('prepares, edits and sends two files as one canonical attachment batch', async ({
  page,
}) => {
  const attachmentPosts: Array<{
    body: string
    path: string
  }> = []

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
          isWithinWorkingHours: true,
          rows: [],
          timezone: 'Europe/Samara',
        },
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/chat/messages**', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())

    if (
      request.method() === 'POST' &&
      requestUrl.pathname === '/api/chat/messages/attachments'
    ) {
      attachmentPosts.push({
        body: request.postDataBuffer()?.toString('utf8') ?? '',
        path: requestUrl.pathname,
      })
      await route.fulfill({
        body: JSON.stringify({
          activeThread: privateThread,
          reason: 'none',
          result: 'ready',
          sentMessage: {
            attachments: [
              {
                fileSize: 9,
                fileType: 'file',
                id: 77,
                name: 'first.pdf',
                thumbUrl: '',
                url: '/api/chat/threads/private%3Ame/attachments/601/77',
              },
              {
                fileSize: 6,
                fileType: 'file',
                id: 78,
                name: 'second.txt',
                thumbUrl: '',
                url: '/api/chat/threads/private%3Ame/attachments/601/78',
              },
            ],
            authorName: 'Вы',
            authorRole: 'current_user',
            content: null,
            contentType: 'text',
            createdAt: '2026-07-29T12:00:00.000Z',
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
      body: JSON.stringify({
        activeThread: privateThread,
        hasMoreOlder: false,
        messages: [],
        nextOlderCursor: null,
        reason: 'none',
        result: 'ready',
      }),
      contentType: 'application/json',
      status: 200,
    })
  })

  await seedAndLoginCustomerWithEmailCode({
    page,
    prefix: 'e2e.chat-attachments',
  })

  await expect(page).toHaveURL(/\/app\/chat/)

  const fileInput = page.getByLabel('Файл вложения')

  await fileInput.setInputFiles([
    {
      buffer: Buffer.from('%PDF-1.7\n'),
      mimeType: 'application/pdf',
      name: 'first.pdf',
    },
    {
      buffer: Buffer.from('second'),
      mimeType: 'text/plain',
      name: 'second.txt',
    },
  ])

  const tray = page.locator('[data-composer-panel="attachments"]')

  await expect(tray).toContainText('2/5 · 15 Б')
  await expect(tray.locator('span[title]')).toHaveText([
    'first.pdf',
    'second.txt',
  ])

  await page.getByRole('button', { name: 'Убрать файл second.txt' }).click()
  await expect(tray).toContainText('1/5 · 9 Б')
  await expect(tray).not.toContainText('second.txt')

  await fileInput.setInputFiles({
    buffer: Buffer.from('second'),
    mimeType: 'text/plain',
    name: 'second.txt',
  })
  await expect(tray).toContainText('2/5 · 15 Б')
  await expect(tray.locator('span[title]')).toHaveText([
    'first.pdf',
    'second.txt',
  ])

  await page.getByRole('button', { name: 'Отправить файл' }).click()

  await expect.poll(() => attachmentPosts.length).toBe(1)
  const multipartBody = attachmentPosts[0]?.body ?? ''

  expect(attachmentPosts[0]?.path).toBe('/api/chat/messages/attachments')
  expect(multipartBody.match(/name="attachments"/g)).toHaveLength(2)
  expect(multipartBody.indexOf('filename="first.pdf"')).toBeLessThan(
    multipartBody.indexOf('filename="second.txt"'),
  )

  const firstAttachment = page.getByText('first.pdf')
  const secondAttachment = page.getByText('second.txt')

  await expect(firstAttachment).toBeVisible()
  await expect(secondAttachment).toBeVisible()
  expect(
    await firstAttachment.evaluate((element) =>
      element.closest('[data-message-id]')?.getAttribute('data-message-id'),
    ),
  ).toBe('601')
  expect(
    await secondAttachment.evaluate((element) =>
      element.closest('[data-message-id]')?.getAttribute('data-message-id'),
    ),
  ).toBe('601')
})

test('imports a system-shared image only after destination confirmation and sends only on explicit submit', async ({
  page,
}) => {
  const attachmentBodies: string[] = []

  await installEmptyChatRuntime({
    onAttachmentPost: async (route) => {
      attachmentBodies.push(
        route.request().postDataBuffer()?.toString('utf8') ?? '',
      )
      await fulfillAttachmentSuccess({
        id: 703,
        names: ['shared-screen.png'],
        route,
      })
    },
    page,
  })
  await openMockedChat({
    page,
    prefix: 'e2e.chat-system-share',
  })
  const draftId = '33333333-3333-4333-8333-333333333333'

  await seedPendingShareDraft({
    draftId,
    fileName: 'shared-screen.png',
    page,
  })
  await page.goto(`/app/chat?shareDraft=${draftId}&panel=media`)

  const dialog = page.getByRole('dialog', { name: 'Куда добавить файлы?' })

  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('shared-screen.png')).toBeVisible()
  expect(attachmentBodies).toHaveLength(0)

  await dialog.getByRole('button', { name: 'Продолжить' }).click()

  const tray = page.locator('[data-composer-panel="attachments"]')

  await expect(tray.getByText('shared-screen.png')).toBeVisible()
  await expect(page).toHaveURL(/panel=media/)
  await expect(page).not.toHaveURL(/shareDraft=/)
  expect(attachmentBodies).toHaveLength(0)
  await expect(pendingShareDraftExists(page, draftId)).resolves.toBe(true)

  await page.getByRole('button', { name: 'Отправить файл' }).click()

  await expect.poll(() => attachmentBodies.length).toBe(1)
  expect(attachmentBodies[0]?.match(/name="attachments"/g)).toHaveLength(1)
  expect(attachmentBodies[0]).toContain('filename="shared-screen.png"')
  await expect.poll(() => pendingShareDraftExists(page, draftId)).toBe(false)
})

test('does not expose a system share draft owned by another portal user', async ({
  page,
}) => {
  let attachmentPostCount = 0

  await installEmptyChatRuntime({
    onAttachmentPost: async (route) => {
      attachmentPostCount += 1
      await route.fulfill({ status: 500 })
    },
    page,
  })
  await openMockedChat({
    page,
    prefix: 'e2e.chat-system-share-mismatch',
  })
  const draftId = '44444444-4444-4444-8444-444444444444'

  await seedPendingShareDraft({
    draftId,
    fileName: 'other-users-private-screen.png',
    page,
    userIdOffset: 1,
  })
  await page.goto(`/app/chat?shareDraft=${draftId}`)

  await expect(page.getByRole('alert')).toContainText(
    'принадлежат другой сессии',
  )
  await expect(page.getByText('other-users-private-screen.png')).toHaveCount(0)
  expect(attachmentPostCount).toBe(0)
  await expect.poll(() => pendingShareDraftExists(page, draftId)).toBe(false)
})

test('prepares pasted and dropped files without sending them automatically', async ({
  page,
}) => {
  let attachmentPostCount = 0

  await installEmptyChatRuntime({
    onAttachmentPost: async (route) => {
      attachmentPostCount += 1
      await route.fulfill({ status: 500 })
    },
    page,
  })
  await openMockedChat({
    page,
    prefix: 'e2e.chat-attachment-inputs',
  })

  await page
    .getByRole('textbox', { name: 'Сообщение' })
    .evaluate((textarea) => {
      const clipboardData = new DataTransfer()

      clipboardData.items.add(
        new File([new Uint8Array([137, 80, 78, 71])], 'image.png', {
          type: 'image/png',
        }),
      )
      textarea.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      )
    })

  const tray = page.locator('[data-composer-panel="attachments"]')

  await expect(tray.locator('span[title^="screenshot-"]')).toHaveAttribute(
    'title',
    /^screenshot-\d{8}-\d{6}\.png$/,
  )
  expect(attachmentPostCount).toBe(0)

  await page.getByRole('button', { name: 'Очистить файлы' }).click()
  await page.locator('footer').evaluate((footer) => {
    const zone = footer.parentElement

    if (!zone) {
      throw new Error('Missing active chat drop zone.')
    }

    const transfer = new DataTransfer()

    transfer.items.add(
      new File(['dropped'], 'dropped.pdf', {
        type: 'application/pdf',
      }),
    )
    zone.dispatchEvent(
      new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })

  await expect(page.getByText('Перетащите файлы сюда')).toBeVisible()

  await page.locator('footer').evaluate((footer) => {
    const zone = footer.parentElement

    if (!zone) {
      throw new Error('Missing active chat drop zone.')
    }

    const transfer = new DataTransfer()

    transfer.items.add(
      new File(['dropped'], 'dropped.pdf', {
        type: 'application/pdf',
      }),
    )
    zone.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })

  await expect(tray.getByText('dropped.pdf')).toBeVisible()
  await expect(page.getByText('Перетащите файлы сюда')).toHaveCount(0)
  expect(attachmentPostCount).toBe(0)

  const draggedTextWasPrevented = await page
    .locator('footer')
    .evaluate((footer) => {
      const zone = footer.parentElement

      if (!zone) {
        throw new Error('Missing active chat drop zone.')
      }

      const transfer = new DataTransfer()

      transfer.setData('text/plain', 'Обычный текст')

      return !zone.dispatchEvent(
        new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      )
    })

  expect(draggedTextWasPrevented).toBe(false)
  await expect(page.getByText('Перетащите файлы сюда')).toHaveCount(0)
})

test('keeps five previews and all attachment sources usable on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await installEmptyChatRuntime({
    onAttachmentPost: async (route) => {
      await route.fulfill({ status: 500 })
    },
    page,
  })
  await openMockedChat({
    page,
    prefix: 'e2e.chat-attachment-mobile',
  })

  await page.getByLabel('Файл вложения').setInputFiles(
    Array.from({ length: 5 }, (_, index) => ({
      buffer: Buffer.from(`file-${index + 1}`),
      mimeType: 'text/plain',
      name: `file-${index + 1}.txt`,
    })),
  )

  const tray = page.locator('[data-composer-panel="attachments"]')
  const previewScroller = tray.locator('.overflow-x-auto')

  await expect(tray).toContainText('5/5')
  await expect(tray.locator('span[title]')).toHaveCount(5)
  expect(
    await previewScroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
    })),
  ).toEqual(
    expect.objectContaining({
      overflowX: 'auto',
    }),
  )
  expect(
    await previewScroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true)

  await page.getByRole('button', { name: 'Прикрепить файл' }).click()

  const menu = page.getByRole('dialog', { name: 'Добавить вложение' })

  await expect(menu.getByRole('button', { name: 'Фото и видео' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Камера' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Файл' })).toBeVisible()
  await expect(
    menu.getByRole('button', { name: 'Закрыть меню вложений' }),
  ).toBeVisible()

  await page.mouse.click(195, 200)
  await expect(menu).toBeHidden()

  await page.getByRole('button', { name: 'Прикрепить файл' }).click()
  await menu.getByRole('button', { name: 'Закрыть меню вложений' }).click()
  await expect(menu).toBeHidden()

  const composerBox = await page.locator('footer').boundingBox()

  expect(composerBox).not.toBeNull()
  expect((composerBox?.x ?? 0) + (composerBox?.width ?? 0)).toBeLessThanOrEqual(
    390,
  )
})

test('shows progress, aborts an upload and keeps its draft', async ({
  context,
  page,
}) => {
  test.setTimeout(60_000)

  await installEmptyChatRuntime({
    onAttachmentPost: async (route) => {
      await route.continue()
    },
    page,
  })
  await openMockedChat({
    page,
    prefix: 'e2e.chat-attachment-cancel',
  })

  const failedAttachmentRequests: string[] = []

  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/api/chat/messages/attachments') {
      failedAttachmentRequests.push(request.failure()?.errorText ?? 'failed')
    }
  })

  const cdp = await context.newCDPSession(page)

  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    connectionType: 'cellular3g',
    downloadThroughput: 512 * 1024,
    latency: 100,
    offline: false,
    uploadThroughput: 256 * 1024,
  })

  const textarea = page.getByRole('textbox', { name: 'Сообщение' })

  await page.getByLabel('Файл вложения').setInputFiles({
    buffer: Buffer.alloc(2 * 1024 * 1024, 97),
    mimeType: 'application/pdf',
    name: 'large.pdf',
  })
  await textarea.fill('Важная подпись')
  await page.getByRole('button', { name: 'Отправить файл' }).click()

  await expect(page.getByText(/^Загрузка \d+%$/)).toBeVisible()
  await page.getByRole('button', { name: 'Отменить загрузку' }).click()

  await expect(page.getByText('large.pdf')).toBeVisible()
  await expect(textarea).toHaveValue('Важная подпись')
  await expect(
    page.getByRole('button', { name: 'Отменить загрузку' }),
  ).toHaveCount(0)
  await expect.poll(() => failedAttachmentRequests.length).toBe(1)
})

test('keeps a failed draft and manually retries with the same message key', async ({
  page,
}) => {
  const attachmentBodies: string[] = []

  await installEmptyChatRuntime({
    onAttachmentPost: async (route) => {
      attachmentBodies.push(
        route.request().postDataBuffer()?.toString('utf8') ?? '',
      )

      if (attachmentBodies.length === 1) {
        await route.fulfill({
          body: JSON.stringify({
            error: {
              code: 'CHAT_SEND_RATE_LIMITED',
              message: 'Отправка временно ограничена.',
            },
          }),
          contentType: 'application/json',
          headers: {
            'Retry-After': '7',
          },
          status: 503,
        })
        return
      }

      await fulfillAttachmentSuccess({
        content: 'Подпись для повтора',
        id: 702,
        names: ['retry.pdf'],
        route,
      })
    },
    page,
  })
  await openMockedChat({
    page,
    prefix: 'e2e.chat-attachment-retry',
  })

  const textarea = page.getByRole('textbox', { name: 'Сообщение' })

  await page.getByLabel('Файл вложения').setInputFiles({
    buffer: Buffer.from('%PDF retry'),
    mimeType: 'application/pdf',
    name: 'retry.pdf',
  })
  await textarea.fill('Подпись для повтора')
  await page.getByRole('button', { name: 'Отправить файл' }).click()

  await expect(
    page.getByText(/Они остались в сообщении — попробуйте ещё раз\./),
  ).toBeVisible()
  await expect(page.getByText(/Попробуйте через 7 сек\./)).toBeVisible()
  await expect(page.getByText('retry.pdf')).toBeVisible()
  await expect(textarea).toHaveValue('Подпись для повтора')
  expect(attachmentBodies).toHaveLength(1)

  await page.getByRole('button', { name: 'Отправить файл' }).click()

  await expect.poll(() => attachmentBodies.length).toBe(2)
  expect(
    readMultipartField(attachmentBodies[1] ?? '', 'clientMessageKey'),
  ).toBe(readMultipartField(attachmentBodies[0] ?? '', 'clientMessageKey'))
  await expect(page.getByText('retry.pdf')).toBeVisible()
  await expect(textarea).toHaveValue('')
})
