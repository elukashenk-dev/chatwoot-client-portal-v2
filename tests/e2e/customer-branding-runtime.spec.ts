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
    appearance: {
      authBackgroundOverlay: 'dark',
      authButtonStyle: 'gradient',
      authColorScheme: 'dark',
      authFieldStyle: 'outline',
    },
    colors: {
      accent: '#14b8a6',
      authBackground: '#ecfeff',
      authMutedText: '#456179',
      authText: '#7c2d12',
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
    layout: {
      authBrandPlacement: 'center',
    },
    portalName: 'ProvGroup',
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
} as const

async function mockTenantAndBranding(
  page: Page,
  brandingResponse: unknown = branding,
) {
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
      json: brandingResponse,
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

async function mockLoginFailure(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Тестовая ошибка входа.',
        },
      },
      status: 401,
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
  await expect(
    page.getByRole('heading', { name: 'Кабинет ProvGroup' }),
  ).toHaveCSS('color', 'rgb(124, 45, 18)')
  await expect(page.getByText('Войдите в кабинет ProvGroup.')).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Логотип ProvGroup' }),
  ).toHaveAttribute('src', '/api/branding/assets/11?v=11')
  await expect(page.locator('.auth-header-art')).toHaveCount(0)
  await expect(page.locator('.auth-footer-art')).toHaveCount(0)
  await expect(page.locator('.auth-header-shell')).toHaveCount(0)
  await expect(page.locator('.auth-support-card')).toHaveCount(0)
  await expect(page.locator('.portal-branding-scope')).toHaveAttribute(
    'style',
    /--portal-auth-background-image: url\("\/api\/branding\/assets\/14\?v=14"\)/,
  )
  await expect(page.locator('.auth-canvas-background')).toHaveCSS(
    'background-image',
    /\/api\/branding\/assets\/14\?v=14/,
  )
  await expect(page.locator('.auth-background-overlay')).toBeVisible()
  const authScope = page.locator('.portal-branding-scope')
  await expect
    .poll(() =>
      authScope.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue('--portal-auth-background-color')
          .trim(),
      ),
    )
    .toBe('#ecfeff')

  const firstAuthInput = page.locator('.auth-input').first()
  await expect(firstAuthInput).toBeVisible()
  await firstAuthInput.fill('name@example.com')
  await expect(firstAuthInput).toHaveCSS('color', 'rgb(124, 45, 18)')
  await expect(firstAuthInput).toHaveAttribute('data-filled', 'true')
  await expect
    .poll(() =>
      firstAuthInput.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('background-color'),
      ),
    )
    .toBe('rgba(0, 0, 0, 0)')

  await mockLoginFailure(page)
  await page.locator('#login-password').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('alert')).toContainText('Тестовая ошибка входа.')
})

test('uses accent for auth links and volumetric primary gradient for auth button', async ({
  page,
}) => {
  const redAccentBranding = {
    branding: {
      ...branding.branding,
      appearance: {
        ...branding.branding.appearance,
        authButtonStyle: 'gradient',
      },
      colors: {
        ...branding.branding.colors,
        accent: '#ff0050',
        primary: '#10284a',
      },
    },
  }

  await mockTenantAndBranding(page, redAccentBranding)
  await mockAuthState(page, 'unauthenticated')

  await page.goto('/auth/login')

  const submitButton = page.getByRole('button', { name: 'Войти' })
  const submitBackgroundImage = await submitButton.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  )

  expect(submitBackgroundImage).toContain('linear-gradient')
  expect(submitBackgroundImage).toContain('rgb(16, 40, 74)')
  expect(submitBackgroundImage).not.toContain('rgb(255, 0, 80)')
  await expect(page.getByRole('link', { name: 'Создать аккаунт' })).toHaveCSS(
    'color',
    'rgb(255, 0, 80)',
  )

  await page.goto('/auth/register')

  const termsCheckbox = page.getByRole('checkbox', {
    name: /Я принимаю Пользовательское соглашение/i,
  })

  await termsCheckbox.check()
  await expect(termsCheckbox).toHaveCSS('color', 'rgb(255, 0, 80)')
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
  await expect(page.locator('.app-runtime-background')).toHaveCSS(
    'background-image',
    /\/api\/branding\/assets\/15\?v=15/,
  )
  const appRuntimeBackgroundImage = await page
    .locator('.app-runtime-background')
    .evaluate((element) => getComputedStyle(element).backgroundImage)

  expect(appRuntimeBackgroundImage).not.toContain('/api/branding/assets/14')
  await expect(page.locator('.portal-branding-scope')).toHaveAttribute(
    'style',
    /--portal-chat-header-background-image: url\("\/api\/branding\/assets\/16\?v=16"\)/,
  )

  await page.getByRole('button', { name: 'Открыть меню чата' }).click()
  await page.getByRole('menuitem', { name: 'Информация о чате' }).click()

  await expect(page.getByRole('heading', { name: 'О диалоге' })).toBeVisible()
})

async function expectAuthLoginGeometry({
  logoYMax,
  logoYMin,
  page,
}: {
  logoYMax: number
  logoYMin: number
  page: Page
}) {
  const logo = page.locator('.auth-brand-mark--in-flow')
  const email = page.getByLabel('Email')
  const password = page.locator('#login-password')
  const submit = page.getByRole('button', { name: 'Войти' })

  await expect(logo).toHaveCSS('width', '63px')
  await expect(logo).toHaveCSS('height', '63px')
  await expect(email).toHaveCSS('height', '50px')
  await expect(password).toHaveCSS('height', '50px')
  await expect(submit).toHaveCSS('height', '47px')
  await expect(page.locator('.auth-support-block')).toBeVisible()
  await expect(page.getByText('+7 (800) 000-00-00')).toBeVisible()

  const logoBox = await logo.boundingBox()
  const emailBox = await email.boundingBox()
  const submitBox = await submit.boundingBox()

  if (!logoBox || !emailBox || !submitBox) {
    throw new Error('Missing auth geometry boxes.')
  }

  expect(logoBox.y).toBeGreaterThanOrEqual(logoYMin)
  expect(logoBox.y).toBeLessThanOrEqual(logoYMax)
  expect(emailBox.width).toBeGreaterThanOrEqual(296)
  expect(emailBox.width).toBeLessThanOrEqual(304)
  expect(submitBox.width).toBeGreaterThanOrEqual(296)
  expect(submitBox.width).toBeLessThanOrEqual(304)
}

test('keeps the auth login Figma baseline geometry on mobile viewports', async ({
  page,
}) => {
  await mockTenantAndBranding(page)
  await mockAuthState(page, 'unauthenticated')

  await page.setViewportSize({ height: 844, width: 390 })
  await page.goto('/auth/login')
  await expectAuthLoginGeometry({
    logoYMax: 60,
    logoYMin: 44,
    page,
  })

  await page.setViewportSize({ height: 956, width: 440 })
  await page.goto('/auth/login')
  await expectAuthLoginGeometry({
    logoYMax: 76,
    logoYMin: 64,
    page,
  })
})
