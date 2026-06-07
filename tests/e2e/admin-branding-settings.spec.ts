import { expect, type Page, type Route, test } from '@playwright/test'

const adminEmail = 'cbr@provgroup.com'

const brandingResponse = {
  branding: {
    assets: {},
    colors: {
      accent: '#4676b4',
      authBackground: '#f3f7fc',
      chatBackground: '#ffffff',
      chatHeaderBackground: '#112540',
      primary: '#112540',
    },
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

async function mockAdminBrandingRoutes(
  page: Page,
  onPatch: BrandingPatchRouteHandler,
) {
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

  await page.goto('/admin/branding')

  await expect(
    page.getByRole('heading', { exact: true, name: 'Брендинг' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Цвета' }).click()
  await expect(page).toHaveURL(/#colors$/)
  await page.getByRole('link', { name: 'Auth-экран' }).click()
  await expect(page).toHaveURL(/#auth$/)

  await page.getByLabel('Название портала').fill(updatedBranding.portalName)
  await page.getByLabel('Подпись поддержки').fill(updatedBranding.supportLabel)
  await page.getByLabel('Основной цвет').fill(updatedBranding.colors.primary)
  await page
    .getByLabel('Цвет auth-фона')
    .fill(updatedBranding.colors.authBackground)
  await page.getByLabel('Фон чата').fill(updatedBranding.colors.chatBackground)
  await page
    .getByLabel('Фон шапки чата')
    .fill(updatedBranding.colors.chatHeaderBackground)
  await page
    .getByLabel('Заголовок входа', { exact: true })
    .fill(updatedBranding.copy.authTitle)
  await page
    .getByLabel('Подзаголовок входа', { exact: true })
    .fill(updatedBranding.copy.authSubtitle)

  await expect(
    page.getByRole('heading', { name: updatedBranding.portalName }),
  ).toBeVisible()
  await expect(
    page.getByText(updatedBranding.supportLabel).first(),
  ).toBeVisible()
  await expect(page.getByText(updatedBranding.copy.authTitle)).toBeVisible()
  await expect(page.getByText(updatedBranding.copy.authSubtitle)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Продолжить' })).toHaveCSS(
    'background-color',
    'rgb(15, 118, 110)',
  )

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

  await page.getByLabel('Подпись поддержки').fill('Поддержка 24/7')
  await expect(page.getByText('Настройки сохранены.')).not.toBeVisible()
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

  await page.goto('/admin/branding')
  await page.getByLabel('Название портала').fill('Портал Бухфирма')

  const patchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/branding') &&
      response.request().method() === 'PATCH',
  )

  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect(page.getByRole('button', { name: 'Сохраняем' })).toBeDisabled()
  await expect(page.getByLabel('Название портала')).toBeDisabled()
  await expect(page.getByLabel('Основной цвет')).toBeDisabled()

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

  await page.goto('/admin/branding')
  await page.getByLabel('Основной цвет').fill('#zzzzzz')

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
  await expect(page.getByLabel('Основной цвет')).toHaveValue('#zzzzzz')
  await expect(
    page.getByRole('button', { name: 'Сохранить настройки' }),
  ).toBeEnabled()
})
