import { Buffer } from 'node:buffer'

import { expect, test } from '@playwright/test'

import { seedAndLoginCustomerWithEmailCode } from './support/customerAuth.ts'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

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

  const fileInput = page.locator('input[type="file"]')

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

  await page
    .getByRole('button', { name: 'Убрать файл second.txt' })
    .click()
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
