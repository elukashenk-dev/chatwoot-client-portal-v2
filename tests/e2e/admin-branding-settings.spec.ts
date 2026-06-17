import { Buffer } from 'node:buffer'

import { expect, type Page, type Route, test } from '@playwright/test'

const adminEmail = 'cbr@provgroup.com'
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
  'base64',
)

const authBackgroundAsset = {
  assetVersion: '88',
  contentType: 'image/png',
  height: null,
  id: 88,
  kind: 'auth_background_image',
  publicUrl: '/api/branding/assets/88?v=88',
  width: null,
} as const

const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authMutedText: '#64748b',
  authText: '#15486b',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
} as const

const defaultBrandingAppearance = {
  authBackgroundOverlay: 'none',
  authButtonStyle: 'solid',
  authColorScheme: 'light',
  authFieldStyle: 'solid',
} as const

const defaultBrandingLayout = {
  authBrandPlacement: 'center',
} as const

const brandingResponse = {
  branding: {
    appearance: defaultBrandingAppearance,
    assets: {} as Partial<
      Record<'auth_background_image', typeof authBackgroundAsset>
    >,
    colors: defaultBrandingColors,
    copy: {
      authSubtitle: 'Введите email и пароль, чтобы продолжить.',
      authTitle: 'Вход в личный кабинет',
      chatEmptyBody: 'Напишите нам, когда будет удобно.',
      chatEmptyTitle: 'Мы на связи',
      chatInfoTitle: 'Информация о чате',
    },
    layout: defaultBrandingLayout,
    portalName: 'Бухфирма',
    supportLabel: 'Команда Бухфирма',
    version: 1,
  },
}

type BrandingResponseBody = typeof brandingResponse.branding
type BrandingResponseOverrides = Omit<
  Partial<BrandingResponseBody>,
  'appearance' | 'colors' | 'copy' | 'layout'
> & {
  appearance?: Partial<BrandingResponseBody['appearance']>
  colors?: Partial<BrandingResponseBody['colors']>
  copy?: Partial<BrandingResponseBody['copy']>
  layout?: Partial<BrandingResponseBody['layout']>
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
      appearance: {
        ...brandingResponse.branding.appearance,
        ...overrides.appearance,
      },
      colors: {
        ...brandingResponse.branding.colors,
        ...overrides.colors,
      },
      copy: {
        ...brandingResponse.branding.copy,
        ...overrides.copy,
      },
      layout: {
        ...brandingResponse.branding.layout,
        ...overrides.layout,
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
  getBrandingResponse = () => brandingResponse,
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
        json: getBrandingResponse(),
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

async function clickSegmentedRadio(page: Page, name: string) {
  await page
    .locator('label')
    .filter({
      has: page.getByRole('radio', { exact: true, name }),
    })
    .click()
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
  await expect(
    page.getByLabel('Фон формы входа', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByLabel('Непрозрачность формы входа, значение', { exact: true }),
  ).toHaveCount(0)
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
  await expect(phonePreview).toContainText('+7 (800) 000-00-00')
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
  await expect(
    phonePreview.locator('.auth-brand-mark--in-flow .brand-mark-logo'),
  ).toHaveCSS('background-color', 'rgb(15, 118, 110)')
  await expect(phonePreview.getByRole('button', { name: 'Войти' })).toHaveCSS(
    'background-color',
    'rgb(15, 118, 110)',
  )
  const previewScope = page.locator(
    '[data-admin-branding-preview] .portal-branding-scope',
  )
  await expect
    .poll(() =>
      previewScope.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue('--portal-auth-background-color')
          .trim(),
      ),
    )
    .toBe(updatedBranding.colors.authBackground)

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

test('admin saves full background auth appearance settings after upload and reload', async ({
  page,
}) => {
  const expectedAppearance = {
    authBackgroundOverlay: 'dark',
    authButtonStyle: 'gradient',
    authColorScheme: 'dark',
    authFieldStyle: 'outline',
  } as const
  let currentBranding = createBrandingResponse()

  await mockAdminBrandingRoutes(
    page,
    async ({ payload, route }) => {
      await expect(payload).toMatchObject({
        appearance: expectedAppearance,
      })

      currentBranding = createBrandingResponse({
        ...currentBranding.branding,
        appearance: expectedAppearance,
        version: 2,
      })

      await route.fulfill({
        contentType: 'application/json',
        json: currentBranding,
        status: 200,
      })
    },
    () => currentBranding,
  )

  await page.route(
    '**/api/admin/branding/assets/auth_background_image',
    async (route) => {
      expect(route.request().method()).toBe('POST')
      expect(route.request().headers()['content-type']).toContain(
        'multipart/form-data',
      )
      currentBranding = createBrandingResponse({
        ...currentBranding.branding,
        assets: {
          ...currentBranding.branding.assets,
          auth_background_image: authBackgroundAsset,
        },
      })

      await route.fulfill({
        contentType: 'application/json',
        json: { asset: authBackgroundAsset },
        status: 200,
      })
    },
  )
  await page.route('**/api/branding/assets/88**', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      body: onePixelPng,
      contentType: 'image/png',
      status: 200,
    })
  })

  await gotoAdminBrandingPage(page)

  await page.getByRole('link', { name: 'Изображения' }).click()
  await page.getByLabel('Загрузить общий фон экрана входа').setInputFiles({
    buffer: onePixelPng,
    mimeType: 'image/png',
    name: 'auth-background.png',
  })
  await expect(page.getByRole('status')).toContainText(
    'Общий фон экрана входа загружен.',
  )
  await expect(
    page.getByLabel('Заменить общий фон экрана входа'),
  ).toBeAttached()

  await page.getByRole('link', { name: 'Экран входа' }).click()
  await clickSegmentedRadio(page, 'Темная')
  await clickSegmentedRadio(page, 'Темная дымка')
  await clickSegmentedRadio(page, 'Контур')
  await clickSegmentedRadio(page, 'Градиент')

  const patchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/branding') &&
      response.request().method() === 'PATCH',
  )

  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect((await patchResponsePromise).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText('Настройки сохранены.')

  await page.reload()
  await expect(page.getByLabel('Название портала')).toBeVisible()
  await page.getByRole('link', { name: 'Экран входа' }).click()

  await expect(
    page.getByRole('radio', { exact: true, name: 'Темная' }),
  ).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Темная дымка' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Контур' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Градиент' })).toBeChecked()

  await page.getByRole('link', { name: 'Изображения' }).click()
  await expect(
    page.getByLabel('Заменить общий фон экрана входа'),
  ).toBeAttached()
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
  await expect(
    page.getByLabel('Фон формы входа', { exact: true }),
  ).toHaveCount(0)

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
  await expect(
    page.getByRole('button', { name: 'Сохранить настройки' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Сохранить настройки' }),
  ).toHaveAttribute('aria-busy', 'true')
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
