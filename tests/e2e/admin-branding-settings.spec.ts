import { expect, type Page, type Route, test } from '@playwright/test'

const adminEmail = 'cbr@provgroup.com'

const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  authMutedText: '#64748b',
  authText: '#0f172a',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
} as const

const brandingResponse = {
  branding: {
    assets: {},
    colors: defaultBrandingColors,
    copy: {
      authSubtitle: 'Введите email и пароль, чтобы продолжить.',
      authTitle: 'Вход в личный кабинет',
      chatEmptyBody: 'Напишите нам, когда будет удобно.',
      chatEmptyTitle: 'Мы на связи',
      chatInfoTitle: 'Информация о чате',
    },
    portalName: 'Бухфирма',
    supportLabel: 'Команда Бухфирма',
    version: 1,
  },
}

type BrandingResponseBody = typeof brandingResponse.branding
type BrandingResponseOverrides = Omit<
  Partial<BrandingResponseBody>,
  'colors' | 'copy'
> & {
  colors?: Partial<BrandingResponseBody['colors']>
  copy?: Partial<BrandingResponseBody['copy']>
}
type BrandingPatchRouteHandler = (params: {
  payload: unknown
  route: Route
}) => Promise<void>

function createBrandingResponse(overrides: BrandingResponseOverrides = {}) {
  return {
    branding: {
      ...brandingResponse.branding,
      ...overrides,
      colors: {
        ...brandingResponse.branding.colors,
        ...overrides.colors,
      },
      copy: {
        ...brandingResponse.branding.copy,
        ...overrides.copy,
      },
    },
  }
}

async function mockPublicBrandingRoute(page: Page) {
  await page.route('**/api/branding', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname !== '/api/branding') {
      await route.fallback()
      return
    }

    expect(request.method()).toBe('GET')
    await route.fulfill({
      contentType: 'application/json',
      json: brandingResponse,
      status: 200,
    })
  })
}

async function mockAdminBrandingRoutes(
  page: Page,
  onPatch: BrandingPatchRouteHandler,
) {
  await mockPublicBrandingRoute(page)

  await page.route('**/api/tenant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'buhfirma.example.test',
          publicBaseUrl: 'https://buhfirma.example.test',
          slug: 'buhfirma',
        },
      },
    })
  })
  await page.route('**/api/admin/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 42,
          email: adminEmail,
          role: 'administrator',
        },
        session: {
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    })
  })
  await page.route('**/api/admin/branding', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        json: brandingResponse,
      })
      return
    }

    await onPatch({
      payload: route.request().postDataJSON(),
      route,
    })
  })
}

async function gotoAdminBrandingPage(page: Page) {
  const adminBrandingResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/branding') &&
      response.request().method() === 'GET',
  )

  await page.goto('/admin/branding')
  await expect((await adminBrandingResponse).status()).toBe(200)
  await expect(
    page.getByRole('heading', { exact: true, name: 'Брендинг' }),
  ).toBeVisible()
  await expect(page.getByLabel('Название портала')).toBeVisible()
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

test('admin can edit all branding setting groups and see preview update', async ({
  page,
}) => {
  const updatedBranding = {
    colors: {
      authBackground: '#eefcf8',
      authContentSurface: '#f8fafc',
      authContentSurfaceOpacity: 84,
      chatBackground: '#f8fafc',
      chatHeaderBackground: '#164e63',
      chatHeaderText: '#ffffff',
      primary: '#0f766e',
    },
    copy: {
      authSubtitle: 'Используйте рабочий email.',
      authTitle: 'Вход для клиентов',
    },
    portalName: 'Портал Бухфирма',
    supportLabel: 'Поддержка',
  }

  await mockAdminBrandingRoutes(page, async ({ payload, route }) => {
    await expect(payload).toMatchObject(updatedBranding)
    await route.fulfill({
      contentType: 'application/json',
      json: createBrandingResponse({
        ...updatedBranding,
        version: 2,
      }),
    })
  })

  await gotoAdminBrandingPage(page)

  await expect(
    page.getByRole('heading', { exact: true, name: 'Брендинг' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Цвета' }).click()
  await expect(page).toHaveURL(/#colors$/)
  await page.getByRole('link', { name: 'Экран входа' }).click()
  await expect(page).toHaveURL(/#auth$/)

  await page.getByLabel('Название портала').fill(updatedBranding.portalName)
  await page
    .getByLabel('Название команды поддержки')
    .fill(updatedBranding.supportLabel)
  await page
    .getByLabel('Основной цвет', { exact: true })
    .fill(updatedBranding.colors.primary)
  await page
    .getByLabel('Фон страницы входа', { exact: true })
    .fill(updatedBranding.colors.authBackground)
  await page
    .getByLabel('Фон формы входа', { exact: true })
    .fill(updatedBranding.colors.authContentSurface)
  await page
    .getByLabel('Непрозрачность формы входа, значение', { exact: true })
    .fill(String(updatedBranding.colors.authContentSurfaceOpacity))
  await page
    .getByLabel('Фон чата', { exact: true })
    .fill(updatedBranding.colors.chatBackground)
  await page
    .getByLabel('Фон шапки чата', { exact: true })
    .fill(updatedBranding.colors.chatHeaderBackground)
  await expect(
    page.getByLabel('Цвет текста шапки чата', { exact: true }),
  ).toHaveValue(updatedBranding.colors.chatHeaderText)
  await page
    .getByLabel('Заголовок входа', { exact: true })
    .fill(updatedBranding.copy.authTitle)
  await page
    .getByLabel('Подзаголовок входа', { exact: true })
    .fill(updatedBranding.copy.authSubtitle)

  const phonePreview = page.getByRole('region', {
    name: 'Телефонный предпросмотр портала',
  })

  await expect(phonePreview).toContainText(updatedBranding.portalName)
  await expect(phonePreview).toContainText(updatedBranding.supportLabel)
  await expect(
    phonePreview.getByRole('heading', {
      name: updatedBranding.copy.authTitle,
    }),
  ).toBeVisible()
  await expect(
    phonePreview.getByText(updatedBranding.copy.authSubtitle),
  ).toBeVisible()
  await expect(
    phonePreview.getByRole('button', { name: 'Войти' }),
  ).toBeDisabled()
  const previewScope = page.locator(
    '[data-admin-branding-preview] .portal-branding-scope',
  )
  await expect
    .poll(() =>
      previewScope.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue('--portal-auth-content-surface-color')
          .trim(),
      ),
    )
    .toBe('#f8fafc')

  await page.getByRole('tab', { name: 'Чат' }).click()
  await expect(
    phonePreview.getByRole('heading', { name: 'Личный чат' }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Инфо' }).click()
  await expect(
    phonePreview.getByText(updatedBranding.supportLabel).first(),
  ).toBeVisible()
  await expect(
    phonePreview.getByRole('heading', { name: 'Информация о чате' }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Вход' }).click()
  await expect(
    phonePreview.getByRole('heading', {
      name: updatedBranding.copy.authTitle,
    }),
  ).toBeVisible()

  const patchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/branding') &&
      response.request().method() === 'PATCH',
  )

  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect((await patchResponsePromise).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText('Настройки сохранены.')
  await expect(page.getByLabel('Название портала')).toHaveValue(
    updatedBranding.portalName,
  )

  await page.getByLabel('Название команды поддержки').fill('Поддержка 24/7')
  await expect(page.getByText('Настройки сохранены.')).not.toBeVisible()
})

test('admin reset colors restores production-like default color contract', async ({
  page,
}) => {
  await mockAdminBrandingRoutes(page, async ({ payload, route }) => {
    await expect(payload).toMatchObject({
      colors: defaultBrandingColors,
    })
    await route.fulfill({
      contentType: 'application/json',
      json: createBrandingResponse({
        colors: defaultBrandingColors,
        version: 2,
      }),
    })
  })

  await gotoAdminBrandingPage(page)
  await expect(page.getByRole('heading', { name: 'Цвета' })).toBeVisible()

  await page.getByLabel('Фон шапки чата', { exact: true }).fill('#164e63')
  await page.getByLabel('Фон страницы входа', { exact: true }).fill('#eefcf8')
  await page.getByLabel('Фон формы входа', { exact: true }).fill('#eef2ff')
  await page
    .getByLabel('Непрозрачность формы входа, значение', { exact: true })
    .fill('72')
  await page
    .getByLabel('Цвет текста шапки чата', { exact: true })
    .fill('#f8fafc')
  await page.getByLabel('Цвет текста чата', { exact: true }).fill('#778899')

  await page.getByRole('button', { name: 'Сбросить цвета' }).click()

  await expect(page.getByLabel('Фон шапки чата', { exact: true })).toHaveValue(
    '#ffffff',
  )
  await expect(
    page.getByLabel('Цвет текста шапки чата', { exact: true }),
  ).toHaveValue('#0f172a')
  await expect(
    page.getByLabel('Цвет текста чата', { exact: true }),
  ).toHaveValue('#334155')
  await expect(page.getByLabel('Основной цвет', { exact: true })).toHaveValue(
    '#112540',
  )
  await expect(
    page.getByLabel('Фон страницы входа', { exact: true }),
  ).toHaveValue('#f3f7fc')
  await expect(page.getByLabel('Фон формы входа', { exact: true })).toHaveValue(
    '#ffffff',
  )
  await expect(
    page.getByLabel('Непрозрачность формы входа, значение', { exact: true }),
  ).toHaveValue('100')

  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect(page.getByRole('status')).toContainText('Настройки сохранены.')
})

test('admin controls are locked while branding save is in flight', async ({
  page,
}) => {
  const patchRelease = createDeferred()

  await mockAdminBrandingRoutes(page, async ({ payload, route }) => {
    await expect(payload).toMatchObject({
      portalName: 'Портал Бухфирма',
    })
    await patchRelease.promise
    await route.fulfill({
      contentType: 'application/json',
      json: createBrandingResponse({
        portalName: 'Портал Бухфирма',
        version: 2,
      }),
    })
  })

  await gotoAdminBrandingPage(page)
  await page.getByLabel('Название портала').fill('Портал Бухфирма')

  const patchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/branding') &&
      response.request().method() === 'PATCH',
  )

  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect(page.getByRole('button', { name: 'Сохраняем' })).toBeDisabled()
  await expect(page.getByLabel('Название портала')).toBeDisabled()
  await expect(page.getByLabel('Основной цвет', { exact: true })).toBeDisabled()

  patchRelease.resolve()
  await expect((await patchResponsePromise).status()).toBe(200)
  await expect(
    page.getByRole('button', { name: 'Сохранить настройки' }),
  ).toBeEnabled()
  await expect(page.getByLabel('Название портала')).toBeEnabled()
})

test('admin sees a controlled save error and keeps the draft editable', async ({
  page,
}) => {
  await mockAdminBrandingRoutes(page, async ({ route }) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        error: {
          code: 'BRANDING_SETTINGS_INVALID_COLOR',
          message: 'Некорректный цвет брендинга.',
        },
      },
      status: 400,
    })
  })

  await gotoAdminBrandingPage(page)
  await page.getByLabel('Основной цвет', { exact: true }).fill('#zzzzzz')

  const patchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/branding') &&
      response.request().method() === 'PATCH',
  )

  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect((await patchResponsePromise).status()).toBe(400)
  await expect(page.getByRole('alert')).toContainText(
    'Некорректный цвет брендинга.',
  )
  await expect(page.getByLabel('Основной цвет', { exact: true })).toHaveValue(
    '#zzzzzz',
  )
  await expect(
    page.getByRole('button', { name: 'Сохранить настройки' }),
  ).toBeEnabled()
})
