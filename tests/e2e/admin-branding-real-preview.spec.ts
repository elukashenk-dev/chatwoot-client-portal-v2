import { expect, type Page, test } from '@playwright/test'

const adminEmail = 'cbr@provgroup.com'
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
  'base64',
)

const logoAsset = {
  assetVersion: '77',
  contentType: 'image/png',
  height: null,
  id: 77,
  kind: 'logo',
  publicUrl: '/api/branding/assets/77?v=77',
  width: null,
} as const

const brandingResponse = {
  branding: {
    assets: {
      logo: logoAsset,
    },
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

function isExactPublicBrandingRequest(url: string) {
  return new URL(url).pathname === '/api/branding'
}

function isCustomerRuntimeRequest(url: string) {
  return /\/api\/(auth|chat|notifications|settings|profile)(\/|$)/.test(
    new URL(url).pathname,
  )
}

async function waitForUnexpectedCustomerRuntimeRequest(page: Page) {
  try {
    const request = await page.waitForRequest(
      (nextRequest) => isCustomerRuntimeRequest(nextRequest.url()),
      { timeout: 250 },
    )

    return request.url()
  } catch (error) {
    if (error instanceof Error && error.message.includes('Timeout')) {
      return null
    }

    throw error
  }
}

async function mockAdminRealPreviewRoutes(page: Page) {
  const forbiddenRequests: string[] = []
  let publicBrandingGetCount = 0

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
      status: 200,
    })
  })

  await page.route('**/api/admin/branding', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      contentType: 'application/json',
      json: brandingResponse,
      status: 200,
    })
  })

  await page.route('**/api/branding', async (route) => {
    const request = route.request()

    if (!isExactPublicBrandingRequest(request.url())) {
      await route.fallback()
      return
    }

    expect(request.method()).toBe('GET')
    publicBrandingGetCount += 1
    await route.fulfill({
      contentType: 'application/json',
      json: brandingResponse,
      status: 200,
    })
  })

  await page.route('**/api/branding/assets/**', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      body: onePixelPng,
      contentType: 'image/png',
      status: 200,
    })
  })

  await page.route(
    (url) => isCustomerRuntimeRequest(url.toString()),
    async (route) => {
      forbiddenRequests.push(route.request().url())
      await route.abort()
    },
  )

  return {
    forbiddenRequests,
    getPublicBrandingGetCount: () => publicBrandingGetCount,
  }
}

test('admin real preview switches screens without customer runtime requests', async ({
  page,
}) => {
  const routes = await mockAdminRealPreviewRoutes(page)
  const initialPublicBrandingResponse = page.waitForResponse(
    (response) =>
      isExactPublicBrandingRequest(response.url()) &&
      response.request().method() === 'GET',
  )

  await page.goto('/admin/branding')
  await expect((await initialPublicBrandingResponse).status()).toBe(200)

  await expect(
    page.getByRole('heading', { name: 'Копия портала' }),
  ).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Вход' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  const phonePreview = page.getByRole('region', {
    name: 'Телефонный предпросмотр портала',
  })
  const publicBrandingCountAfterInitialLoad = routes.getPublicBrandingGetCount()

  await expect(
    phonePreview.getByRole('heading', { name: 'Вход в личный кабинет' }),
  ).toBeVisible()
  await expect(
    phonePreview.getByRole('button', { name: 'Войти' }),
  ).toBeDisabled()

  await page.getByRole('tab', { name: 'Чат' }).click()
  await expect(
    phonePreview.getByRole('heading', { name: 'Личный чат' }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Инфо' }).click()
  await expect(
    phonePreview.getByRole('heading', { name: 'Информация о чате' }),
  ).toBeVisible()
  await expect(phonePreview.getByText('Команда Бухфирма').first()).toBeVisible()

  await expect(page).toHaveURL(/\/admin\/branding$/)
  await expect(
    waitForUnexpectedCustomerRuntimeRequest(page),
  ).resolves.toBeNull()
  expect(routes.getPublicBrandingGetCount()).toBe(
    publicBrandingCountAfterInitialLoad,
  )
  expect(routes.forbiddenRequests).toEqual([])
})

for (const width of [1024, 1280, 1440] as const) {
  test(`admin real preview fits desktop viewport at ${width}px`, async ({
    page,
  }) => {
    const routes = await mockAdminRealPreviewRoutes(page)

    await page.setViewportSize({ height: 900, width })
    await page.goto('/admin/branding')

    await expect(
      page.getByRole('heading', { name: 'Копия портала' }),
    ).toBeVisible()
    await expect(
      page.getByRole('tablist', {
        name: 'Экраны предпросмотра портала',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('region', {
        name: 'Телефонный предпросмотр портала',
      }),
    ).toBeVisible()

    await expect(
      waitForUnexpectedCustomerRuntimeRequest(page),
    ).resolves.toBeNull()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true)
    expect(routes.forbiddenRequests).toEqual([])
  })
}
