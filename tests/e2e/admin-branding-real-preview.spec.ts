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

const authBackgroundAsset = {
  assetVersion: '78',
  contentType: 'image/png',
  height: null,
  id: 78,
  kind: 'auth_background_image',
  publicUrl: '/api/branding/assets/78?v=78',
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
  authBackgroundOverlay: 'dark',
  authButtonStyle: 'gradient',
  authColorScheme: 'dark',
  authFieldStyle: 'outline',
} as const

const defaultBrandingLayout = {
  authBrandPlacement: 'center',
} as const

const brandingResponse = {
  branding: {
    appearance: defaultBrandingAppearance,
    assets: {
      auth_background_image: authBackgroundAsset,
      logo: logoAsset,
    },
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
    page.getByRole('heading', { name: 'Предпросмотр портала' }),
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
  const loginButton = phonePreview.getByRole('button', { name: 'Войти' })

  await expect
    .poll(() =>
      loginButton.evaluate((element) => element.hasAttribute('disabled')),
    )
    .toBe(false)
  await expect(loginButton).toHaveAttribute('aria-disabled', 'true')
  await expect(loginButton).toHaveCSS(
    'background-image',
    /linear-gradient/,
  )
  await expect(phonePreview.locator('.auth-canvas-background')).toHaveCSS(
    'background-image',
    /\/api\/branding\/assets\/78\?v=78/,
  )
  await expect(phonePreview.locator('.auth-background-overlay')).toBeVisible()
  await expect(phonePreview.getByText('+7 (800) 000-00-00')).toBeVisible()

  await page.getByRole('tab', { name: 'Чат' }).click()
  await expect(
    phonePreview.getByRole('heading', { name: 'Личный чат' }),
  ).toBeVisible()

  const previewScope = page
    .locator('[data-admin-branding-preview] .portal-branding-scope')
    .first()
  await expect
    .poll(() =>
      previewScope.evaluate((node) =>
        getComputedStyle(node)
          .getPropertyValue('--portal-chat-header-background-color')
          .trim(),
      ),
    )
    .toBe('#ffffff')
  await expect
    .poll(() =>
      previewScope.evaluate((node) =>
        getComputedStyle(node)
          .getPropertyValue('--portal-chat-header-foreground')
          .trim(),
      ),
    )
    .toBe('#0f172a')
  await expect
    .poll(() =>
      previewScope.evaluate((node) =>
        getComputedStyle(node).getPropertyValue('--color-chat-outgoing').trim(),
      ),
    )
    .toBe('#465a72')

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

test('admin can collapse sticky navigation and resize the portal preview width', async ({
  page,
}) => {
  const routes = await mockAdminRealPreviewRoutes(page)

  await page.setViewportSize({ height: 700, width: 1280 })
  await page.goto('/admin/branding')

  await expect(
    page.getByRole('heading', { name: 'Предпросмотр портала' }),
  ).toBeVisible()

  const sidebar = page.locator('[data-admin-branding-sidebar]')
  const editor = page.locator('[data-admin-branding-editor]')
  const preview = page.locator('[data-admin-branding-preview]')
  const resizeHandle = page.getByRole('separator', {
    name: 'Изменить ширину предпросмотра',
  })
  const phonePreview = page.getByRole('region', {
    name: 'Телефонный предпросмотр портала',
  })

  await expect(sidebar).toBeVisible()
  await expect(preview).toBeVisible()
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', '28')
  await page.getByLabel('Название портала').focus()

  const visualPolish = await page.evaluate(() => {
    const previewElement = document.querySelector(
      '[data-admin-branding-preview]',
    )
    const phoneElement = document.querySelector(
      '[aria-label="Телефонный предпросмотр портала"]',
    )
    const authScrollElement = phoneElement?.firstElementChild
    const adminTextInput = document.querySelector('input[name="portalName"]')
    const adminColorInput = document.querySelector(
      'input[name="colors.primary"]',
    )
    const portalEmailInput = phoneElement?.querySelector(
      'input[aria-label="Email"]',
    )

    function readStyle(element: Element | null | undefined) {
      if (!element) {
        return null
      }

      const style = window.getComputedStyle(element)

      return {
        appearance: style.appearance,
        borderRadius: style.borderRadius,
        borderWidth: style.borderWidth,
        outlineStyle: style.outlineStyle,
        scrollbarWidth: style.scrollbarWidth,
      }
    }

    return {
      adminColorInput: readStyle(adminColorInput),
      adminTextInput: readStyle(adminTextInput),
      authScrollElement: readStyle(authScrollElement),
      phoneElement: readStyle(phoneElement),
      portalEmailInput: readStyle(portalEmailInput),
      previewElement: readStyle(previewElement),
    }
  })

  expect(visualPolish.previewElement?.scrollbarWidth).toBe('none')
  expect(visualPolish.phoneElement?.scrollbarWidth).toBe('none')
  expect(visualPolish.authScrollElement?.scrollbarWidth).toBe('none')
  expect(visualPolish.adminTextInput?.appearance).toBe('none')
  expect(visualPolish.adminTextInput?.outlineStyle).toBe('none')
  expect(
    Number.parseFloat(visualPolish.adminTextInput?.borderRadius ?? '0'),
  ).toBeGreaterThan(0)
  expect(visualPolish.adminColorInput?.appearance).toBe('none')
  expect(visualPolish.adminColorInput?.borderWidth).toBe('0px')
  expect(visualPolish.adminColorInput?.outlineStyle).toBe('none')
  expect(visualPolish.portalEmailInput?.appearance).toBe('none')
  expect(visualPolish.portalEmailInput?.outlineStyle).toBe('none')
  expect(
    Number.parseFloat(visualPolish.portalEmailInput?.borderRadius ?? '0'),
  ).toBeGreaterThan(0)

  await editor.evaluate((element) => {
    element.scrollTop = 700
  })

  const stickyTops = await page.evaluate(() => {
    const sidebarElement = document.querySelector(
      '[data-admin-branding-sidebar]',
    )
    const previewElement = document.querySelector(
      '[data-admin-branding-preview]',
    )

    return {
      preview: previewElement?.getBoundingClientRect().top ?? null,
      sidebar: sidebarElement?.getBoundingClientRect().top ?? null,
    }
  })

  expect(Math.abs(stickyTops.sidebar ?? Number.NaN)).toBeLessThan(1)
  expect(Math.abs(stickyTops.preview ?? Number.NaN)).toBeLessThan(1)

  await page.getByRole('button', { name: 'Свернуть меню админки' }).click()
  await expect(
    page.getByRole('button', { name: 'Развернуть меню админки' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Цвета' })).toHaveCount(0)

  await resizeHandle.focus()
  await page.keyboard.press('End')
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', '36')

  await page.keyboard.press('Home')
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', '25')

  const narrowPhoneBox = await phonePreview.boundingBox()

  if (!narrowPhoneBox) {
    throw new Error('Missing narrow portal preview box.')
  }

  const handleBox = await resizeHandle.boundingBox()

  if (!handleBox) {
    throw new Error('Missing preview resize handle box.')
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 - 64,
    handleBox.y + handleBox.height / 2,
  )
  await page.mouse.up()

  await expect
    .poll(async () => Number(await resizeHandle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(25)
  const widerPhoneBox = await phonePreview.boundingBox()

  if (!widerPhoneBox) {
    throw new Error('Missing wider portal preview box.')
  }

  expect(widerPhoneBox.width).toBeGreaterThan(narrowPhoneBox.width + 20)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true)
  await page.getByRole('tab', { name: 'Чат' }).click()
  const chatScrollbarWidth = await page
    .locator('[aria-label="Телефонный предпросмотр портала"] .chat-scroll')
    .evaluate((element) => window.getComputedStyle(element).scrollbarWidth)

  expect(chatScrollbarWidth).toBe('none')
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
      page.getByRole('heading', { name: 'Предпросмотр портала' }),
    ).toBeVisible()
    await expect(
      page.getByRole('tablist', {
        name: 'Экраны предпросмотра портала',
      }),
    ).toBeVisible()
    const phonePreview = page.getByRole('region', {
      name: 'Телефонный предпросмотр портала',
    })

    await expect(phonePreview).toBeVisible()

    const deviceBox = await page
      .locator('[data-portal-preview-device]')
      .boundingBox()

    if (!deviceBox) {
      throw new Error('Missing portal preview device box.')
    }

    expect(deviceBox.y + deviceBox.height).toBeLessThanOrEqual(900)

    if (width === 1440) {
      await expect(
        page.locator('[data-admin-branding-preview] .portal-preview-auth-fit'),
      ).toHaveCSS('overflow-y', 'hidden')

      const phonePreviewBox = await phonePreview.boundingBox()
      const supportPhoneBox = await phonePreview
        .getByText('+7 (800) 000-00-00')
        .boundingBox()

      if (!phonePreviewBox || !supportPhoneBox) {
        throw new Error('Missing auth preview support phone geometry.')
      }

      expect(supportPhoneBox.y).toBeGreaterThanOrEqual(phonePreviewBox.y)
      expect(supportPhoneBox.y + supportPhoneBox.height).toBeLessThanOrEqual(
        phonePreviewBox.y + phonePreviewBox.height,
      )
    }

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
