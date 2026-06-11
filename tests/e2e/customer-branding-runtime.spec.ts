import { Buffer } from 'node:buffer'

import { expect, type Page, test } from '@playwright/test'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
  'base64',
)

const privateThread = {
  avatarUrl: null,
  id: 'private:me',
  subtitle: '',
  title: 'Личный чат',
  type: 'private',
  unreadCount: 0,
} as const

const branding = {
  branding: {
    assets: {
      auth_background_image: {
        assetVersion: '14',
        contentType: 'image/png',
        height: null,
        id: 14,
        kind: 'auth_background_image',
        publicUrl: '/api/branding/assets/14?v=14',
        width: null,
      },
      auth_footer_image: {
        assetVersion: '13',
        contentType: 'image/png',
        height: null,
        id: 13,
        kind: 'auth_footer_image',
        publicUrl: '/api/branding/assets/13?v=13',
        width: null,
      },
      auth_header_image: {
        assetVersion: '12',
        contentType: 'image/png',
        height: null,
        id: 12,
        kind: 'auth_header_image',
        publicUrl: '/api/branding/assets/12?v=12',
        width: null,
      },
      chat_background_image: {
        assetVersion: '15',
        contentType: 'image/png',
        height: null,
        id: 15,
        kind: 'chat_background_image',
        publicUrl: '/api/branding/assets/15?v=15',
        width: null,
      },
      chat_header_background_image: {
        assetVersion: '16',
        contentType: 'image/png',
        height: null,
        id: 16,
        kind: 'chat_header_background_image',
        publicUrl: '/api/branding/assets/16?v=16',
        width: null,
      },
      logo: {
        assetVersion: '11',
        contentType: 'image/png',
        height: null,
        id: 11,
        kind: 'logo',
        publicUrl: '/api/branding/assets/11?v=11',
        width: null,
      },
    },
    colors: {
      accent: '#14b8a6',
      authBackground: '#ecfeff',
      authContentSurface: '#f8fafc',
      authContentSurfaceOpacity: 84,
      authMutedText: '#456179',
      authText: '#0f172a',
      chatBackground: '#f8fafc',
      chatHeaderBackground: '#0f766e',
      chatHeaderText: '#f8fafc',
      chatMutedText: '#52637a',
      chatText: '#1f2937',
      primary: '#134e4a',
    },
    copy: {
      authSubtitle: 'Войдите в кабинет ProvGroup.',
      authTitle: 'Кабинет ProvGroup',
      chatEmptyBody: 'Напишите вопрос, мы ответим здесь.',
      chatEmptyTitle: 'Начните диалог',
      chatInfoTitle: 'О диалоге',
    },
    portalName: 'ProvGroup',
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
} as const

async function mockTenantAndBranding(page: Page) {
  await page.route('**/api/tenant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'buhfirma.127.0.0.1.nip.io',
          publicBaseUrl: 'http://buhfirma.127.0.0.1.nip.io:5173',
          slug: 'buhfirma',
        },
      },
      status: 200,
    })
  })

  await page.route('**/api/branding', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: branding,
      status: 200,
    })
  })

  await page.route('**/api/branding/assets/**', async (route) => {
    await route.fulfill({
      body: onePixelPng,
      contentType: 'image/png',
      status: 200,
    })
  })
}

async function mockAuthState(
  page: Page,
  status: 'authenticated' | 'unauthenticated',
) {
  await page.route('**/api/auth/me', async (route) => {
    if (status === 'unauthenticated') {
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
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
        user: {
          email: 'user@example.com',
          fullName: 'Portal User',
          id: 42,
        },
      },
      status: 200,
    })
  })
}

async function mockReadyEmptyChat(page: Page) {
  await page.route('**/api/chat/threads', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        activeThreadId: 'private:me',
        threads: [privateThread],
        totalUnreadCount: 0,
      },
      status: 200,
    })
  })

  await page.route('**/api/chat/messages**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        activeThread: privateThread,
        hasMoreOlder: false,
        messages: [],
        nextOlderCursor: null,
        reason: 'none',
        result: 'ready',
      },
      status: 200,
    })
  })

  await page.route('**/api/chat/support-availability', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
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
      },
      status: 200,
    })
  })

  await page.route(
    '**/api/chat/threads/private%3Ame/notification-settings',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
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
          threadId: 'private:me',
        },
        status: 200,
      })
    },
  )

  await page.route('**/api/chat/threads/private%3Ame/read', async (route) => {
    await route.fulfill({ status: 204 })
  })

  await page.route('**/api/chat/realtime**', async (route) => {
    await route.fulfill({ status: 204 })
  })

  await page.route('**/api/chat/threads/private%3Ame/info', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        accessLabel: 'Вы и поддержка',
        activeThread: privateThread,
        curatorName: null,
        lastActivityAt: null,
        participants: [],
        reason: 'none',
        result: 'ready',
        startedAt: null,
        supportLabel: 'Команда Бухфирма',
        threadTypeLabel: 'Личный',
      },
      status: 200,
    })
  })
}

test('applies public branding on the customer auth login screen', async ({
  page,
}) => {
  await mockTenantAndBranding(page)
  await mockAuthState(page, 'unauthenticated')

  await page.goto('/auth/login')

  await expect(
    page.getByRole('heading', { name: 'Кабинет ProvGroup' }),
  ).toBeVisible()
  await expect(page.getByText('Войдите в кабинет ProvGroup.')).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Логотип ProvGroup' }),
  ).toHaveAttribute('src', '/api/branding/assets/11?v=11')
  await expect(page.locator('.auth-header-art')).toHaveAttribute(
    'style',
    /\/api\/branding\/assets\/12\?v=12/,
  )
  await expect(page.locator('.auth-footer-art')).toHaveAttribute(
    'style',
    /\/api\/branding\/assets\/13\?v=13/,
  )
  await expect(page.locator('.portal-branding-scope')).toHaveAttribute(
    'style',
    /--portal-auth-background-image: url\("\/api\/branding\/assets\/14\?v=14"\)/,
  )
  const authScope = page.locator('.portal-branding-scope')
  await expect
    .poll(() =>
      authScope.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue('--portal-auth-content-surface-color')
          .trim(),
      ),
    )
    .toBe('#f8fafc')
  await expect(page.locator('.auth-content-veil')).toBeVisible()

  const firstAuthInput = page.locator('.auth-input').first()
  await expect(firstAuthInput).toBeVisible()
  await firstAuthInput.fill('name@example.com')
  await expect(firstAuthInput).toHaveAttribute('data-filled', 'true')
  await expect
    .poll(() =>
      firstAuthInput.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('background-color'),
      ),
    )
    .toBe('rgba(248, 250, 252, 0.84)')
})

test('applies public branding on the customer chat and info surfaces', async ({
  page,
}) => {
  await mockTenantAndBranding(page)
  await mockAuthState(page, 'authenticated')
  await mockReadyEmptyChat(page)

  await page.goto('/app/chat')

  await expect(page.getByRole('heading', { name: 'Личный чат' })).toBeVisible()
  await expect(page.getByText('Поддержка ProvGroup')).toBeVisible()
  await expect(page.getByText('Начните диалог')).toBeVisible()
  await expect(
    page.getByText('Напишите вопрос, мы ответим здесь.'),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: 'Личный чат' })).toHaveAttribute(
    'src',
    '/api/branding/assets/11?v=11',
  )
  await expect(page.locator('.portal-branding-scope')).toHaveAttribute(
    'style',
    /--portal-chat-background-image: url\("\/api\/branding\/assets\/15\?v=15"\)/,
  )
  await expect(page.locator('.portal-branding-scope')).toHaveAttribute(
    'style',
    /--portal-chat-header-background-image: url\("\/api\/branding\/assets\/16\?v=16"\)/,
  )

  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Информация о чате' }).click()

  await expect(page.getByRole('heading', { name: 'О диалоге' })).toBeVisible()
})
