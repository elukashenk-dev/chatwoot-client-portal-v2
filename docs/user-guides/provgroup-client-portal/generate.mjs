import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

import { chromium } from '@playwright/test'

const guideDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(guideDir, '../../..')
const assetsDir = join(guideDir, 'assets')
const htmlPath = join(guideDir, 'guide.html')
const pdfPath = join(guideDir, 'provgroup-client-portal-user-guide.pdf')
const port = Number(process.env.PROVGROUP_GUIDE_VITE_PORT ?? 5197)
const baseUrl = `http://127.0.0.1:${port}`

const demoEmail = 'client@example.com'
const demoName = 'Иван Петров'
const demoPhone = '+7 (900) 000-00-00'
const supportPhone = '+7 (939) 702 48 82'
const iosSafariUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const screenshotNames = {
  androidInstall: '06-android-install.png',
  chat: '05-chat.png',
  iosInstall: '07-ios-install.png',
  legal: '04-legal.png',
  login: '01-login.png',
  password: '10-password-login.png',
  profile: '08-profile.png',
  verify: '03-code.png',
}

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lrM9XwAAAABJRU5ErkJggg==',
  'base64',
)

const logoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="PROVGROUP">
  <rect width="96" height="96" rx="22" fill="#15486b"/>
  <path d="M28 22 48 62 68 22" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M35 23 48 50 61 23" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity=".86"/>
  <circle cx="48" cy="61" r="20" fill="none" stroke="#fff" stroke-width="4.5"/>
  <circle cx="48" cy="61" r="11" fill="none" stroke="#fff" stroke-width="3"/>
  <path d="M38 58 46 66 60 48" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`.trim()

const branding = {
  appearance: {
    authBackgroundOverlay: 'none',
    authButtonStyle: 'solid',
    authColorScheme: 'light',
    authFieldStyle: 'solid',
  },
  assets: {
    logo: {
      assetVersion: 'guide',
      contentType: 'image/svg+xml',
      height: 96,
      id: 1,
      kind: 'logo',
      publicUrl: '/api/branding/assets/provgroup-logo.svg?v=guide',
      width: 96,
    },
    pwa_icon: {
      assetVersion: 'guide',
      contentType: 'image/svg+xml',
      height: 96,
      id: 2,
      kind: 'pwa_icon',
      publicUrl: '/api/branding/assets/provgroup-logo.svg?v=guide',
      width: 96,
    },
  },
  colors: {
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
  },
  copy: {
    authSubtitle: 'Войдите, чтобы продолжить общение с поддержкой.',
    authTitle: 'ВХОД ДЛЯ КЛИЕНТОВ',
    chatEmptyBody: 'Напишите нам, когда будет удобно. Мы ответим здесь.',
    chatEmptyTitle: 'Мы на связи',
    chatInfoTitle: 'Информация о чате',
  },
  layout: {
    authBrandPlacement: 'center',
  },
  portalName: 'PROVGROUP',
  supportContact: {
    phoneDisplay: supportPhone,
    phoneHref: 'tel:+79397024882',
  },
  supportLabel: 'Команда PROVGROUP',
  version: 1,
}

const tenant = {
  displayName: 'PROVGROUP',
  primaryDomain: 'lk.provgroup.ru',
  publicBaseUrl: 'https://lk.provgroup.ru',
  slug: 'provgroup',
}

function sessionPayload({ passwordConfigured = false } = {}) {
  return {
    session: {
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
    user: {
      email: demoEmail,
      fullName: demoName,
      id: 101,
      passwordConfigured,
    },
  }
}

function privateThread() {
  return {
    id: 'private:me',
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  }
}

function chatMessages() {
  return {
    activeThread: privateThread(),
    hasMoreOlder: false,
    messages: [
      {
        attachments: [],
        authorName: 'Команда PROVGROUP',
        authorRole: 'agent',
        content:
          'Здравствуйте! Здесь мы будем оперативно отвечать на ваши рабочие вопросы.',
        contentType: 'text',
        createdAt: '2026-06-27T08:40:00.000Z',
        direction: 'incoming',
        id: 101,
        status: 'sent',
      },
      {
        attachments: [],
        authorName: demoName,
        authorRole: 'current_user',
        content: 'Здравствуйте, подскажите по документам.',
        contentType: 'text',
        createdAt: '2026-06-27T08:52:00.000Z',
        direction: 'outgoing',
        id: 102,
        status: 'sent',
      },
    ],
    nextOlderCursor: null,
    reason: 'none',
    result: 'ready',
  }
}

function notificationSettings(threadId = 'private:me') {
  return {
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
    threadId,
  }
}

async function waitForServer(url, timeoutMs = 60_000) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' })

      if (response.ok) {
        return
      }
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(
    `Timed out waiting for ${url}${lastError ? `: ${lastError}` : ''}`,
  )
}

function startViteServer() {
  const child = spawn(
    'pnpm',
    [
      '--dir',
      'frontend',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        BROWSER: 'none',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let output = ''

  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(output)
    }
  })

  return {
    child,
    getOutput: () => output,
    stop: async () => {
      if (child.exitCode !== null) {
        return
      }

      child.kill('SIGTERM')

      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2_000)

        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    },
  }
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  })
}

async function routePortalApis(context, state) {
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path === '/api/tenant') {
      await fulfillJson(route, { tenant })
      return
    }

    if (path === '/api/branding') {
      await fulfillJson(route, { branding })
      return
    }

    if (
      path === '/api/branding/assets/provgroup-logo.svg' ||
      path.startsWith('/api/tenant/icons/')
    ) {
      await route.fulfill({
        body: logoSvg,
        contentType: 'image/svg+xml',
        status: 200,
      })
      return
    }

    if (path === '/api/auth/me') {
      if (!state.authenticated) {
        await fulfillJson(route, {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Требуется вход.',
          },
        }, 401)
        return
      }

      await fulfillJson(route, sessionPayload({
        passwordConfigured: state.passwordConfigured,
      }))
      return
    }

    if (path === '/api/auth/logout') {
      state.authenticated = false
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/profile') {
      await fulfillJson(route, {
        avatarUrl: null,
        email: demoEmail,
        fullName: demoName,
        phoneNumber: demoPhone,
        result: 'ready',
      })
      return
    }

    if (path === '/api/profile/avatar') {
      await route.fulfill({
        body: transparentPng,
        contentType: 'image/png',
        status: 200,
      })
      return
    }

    if (path === '/api/chat/threads') {
      await fulfillJson(route, {
        activeThreadId: 'private:me',
        threads: [{ ...privateThread(), unreadCount: 0 }],
        totalUnreadCount: 0,
      })
      return
    }

    if (path === '/api/chat/messages' && method === 'GET') {
      await fulfillJson(route, chatMessages())
      return
    }

    if (path === '/api/chat/messages' && method === 'POST') {
      await fulfillJson(route, {
        activeThread: privateThread(),
        reason: 'none',
        result: 'ready',
        sentMessage: {
          attachments: [],
          authorName: demoName,
          authorRole: 'current_user',
          content: 'Здравствуйте!',
          contentType: 'text',
          createdAt: new Date().toISOString(),
          direction: 'outgoing',
          id: 103,
          status: 'sent',
        },
      })
      return
    }

    if (path === '/api/chat/realtime') {
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/chat/support-availability') {
      await fulfillJson(route, {
        currentStatus: 'online',
        outOfOfficeMessage: null,
        reason: 'none',
        result: 'ready',
        workingHours: {
          enabled: false,
          isWithinWorkingHours: null,
          rows: [],
          timezone: 'Europe/Samara',
        },
      })
      return
    }

    if (
      path === '/api/chat/threads/private%3Ame/read' ||
      path === '/api/chat/threads/private%3Ame/typing'
    ) {
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/chat/threads/private%3Ame/notification-settings') {
      await fulfillJson(route, notificationSettings())
      return
    }

    if (path === '/api/notifications/settings') {
      await fulfillJson(route, {
        newMessagesEnabled: true,
        soundEnabled: true,
      })
      return
    }

    if (path === '/api/notifications/push/public-key') {
      await fulfillJson(route, { available: false })
      return
    }

    if (path.startsWith('/api/legal-documents/')) {
      const isTerms = path.endsWith('/terms')
      await fulfillJson(route, {
        document: {
          content:
            'Демо-текст документа для пользовательской инструкции. Реальный документ загружается администратором сервиса.',
          documentType: isTerms ? 'terms' : 'privacy',
          title: isTerms
            ? 'Пользовательское соглашение'
            : 'Политика обработки персональных данных',
          versionId: isTerms ? 11 : 12,
        },
        result: 'ready',
      })
      return
    }

    await route.continue()
  })
}

async function preparePage(page) {
  await page.addStyleTag({
    content: `
      * { caret-color: transparent !important; }
      input, textarea { caret-color: transparent !important; }
      body { background: #f3f7fc !important; }
    `,
  })
}

async function stabilizeViewport(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  })
  await page.waitForTimeout(150)
}

async function dispatchChromiumInstallPrompt(page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', {
      cancelable: true,
    })

    Object.assign(event, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({
        outcome: 'accepted',
        platform: 'web',
      }),
    })

    window.dispatchEvent(event)
  })
}

async function setPasswordlessRequest(page) {
  await page.addInitScript((email) => {
    window.sessionStorage.setItem(
      'portal.passwordless-login-flow',
      JSON.stringify({
        legalContinuation: null,
        request: {
          email,
          expiresInSeconds: 900,
          requestedAt: Date.now(),
          resendAvailableInSeconds: 45,
        },
      }),
    )
  }, demoEmail)
}

async function setLegalContinuation(page) {
  await page.addInitScript((email) => {
    window.sessionStorage.setItem(
      'portal.passwordless-login-flow',
      JSON.stringify({
        legalContinuation: {
          continuationExpiresInSeconds: 900,
          continuationToken: 'guide-continuation-token',
          email,
          verifiedAt: Date.now(),
        },
        request: null,
      }),
    )
  }, demoEmail)
}

async function capturePage(context, path, fileName, action) {
  const page = await context.newPage()
  await preparePage(page)
  await action?.(page)
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  await page.screenshot({
    fullPage: false,
    path: join(assetsDir, fileName),
  })
  await page.close()
}

async function captureScreens() {
  const server = startViteServer()

  try {
    await waitForServer(`${baseUrl}/`)
  } catch (error) {
    await server.stop()
    throw new Error(`${error.message}\n\nVite output:\n${server.getOutput()}`)
  }

  const browser = await chromium.launch()
  const state = {
    authenticated: false,
    passwordConfigured: false,
  }

  try {
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      locale: 'ru-RU',
      serviceWorkers: 'block',
      viewport: { height: 844, width: 390 },
    })

    await routePortalApis(context, state)

    state.authenticated = false
    await capturePage(context, '/auth/login', screenshotNames.login, async (page) => {
      await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'networkidle' })
      await page.getByLabel('Email').fill(demoEmail)
      await stabilizeViewport(page)
      await page.screenshot({
        fullPage: false,
        path: join(assetsDir, screenshotNames.login),
      })
      await page.close()
      throw new Error('__captured__')
    }).catch((error) => {
      if (error.message !== '__captured__') {
        throw error
      }
    })

    await capturePage(
      context,
      '/auth/login/verify',
      screenshotNames.verify,
      async (page) => {
        await setPasswordlessRequest(page)
      },
    )

    await capturePage(
      context,
      '/auth/login/legal',
      screenshotNames.legal,
      async (page) => {
        await setLegalContinuation(page)
      },
    )

    const legalPage = await context.newPage()
    await preparePage(legalPage)
    await setLegalContinuation(legalPage)
    await legalPage.goto(`${baseUrl}/auth/login/legal`, {
      waitUntil: 'networkidle',
    })
    const legalCheckboxes = legalPage.getByRole('checkbox')
    await legalCheckboxes.nth(0).check()
    await legalPage.waitForTimeout(100)
    await legalCheckboxes.nth(1).check()
    await legalPage.waitForFunction(() => {
      const checkboxes = Array.from(
        document.querySelectorAll('input[type="checkbox"]'),
      )
      const submitButton = document.querySelector('form button[type="submit"]')

      return (
        checkboxes.length >= 2 &&
        checkboxes.every((checkbox) => checkbox.checked) &&
        submitButton &&
        !submitButton.disabled
      )
    })
    await legalPage.screenshot({
      fullPage: false,
      path: join(assetsDir, screenshotNames.legal),
    })
    await legalPage.close()

    const passwordPage = await context.newPage()
    await preparePage(passwordPage)
    await passwordPage.goto(`${baseUrl}/auth/login/password`, {
      waitUntil: 'networkidle',
    })
    await passwordPage.getByLabel('Email').fill(demoEmail)
    await passwordPage.locator('#login-password').fill('Portal123')
    await stabilizeViewport(passwordPage)
    await passwordPage.screenshot({
      fullPage: false,
      path: join(assetsDir, screenshotNames.password),
    })
    await passwordPage.close()

    state.authenticated = true
    state.passwordConfigured = false
    await capturePage(context, '/app/chat', screenshotNames.chat, async () => {})

    const androidInstallPage = await context.newPage()
    await preparePage(androidInstallPage)
    await androidInstallPage.goto(`${baseUrl}/app/chat`, {
      waitUntil: 'networkidle',
    })
    await androidInstallPage
      .getByRole('heading', { name: 'Личный чат' })
      .waitFor()
    await dispatchChromiumInstallPrompt(androidInstallPage)
    await androidInstallPage
      .getByLabel('Установка приложения')
      .waitFor({ state: 'visible' })
    await androidInstallPage.screenshot({
      fullPage: false,
      path: join(assetsDir, screenshotNames.androidInstall),
    })
    await androidInstallPage.close()

    await capturePage(
      context,
      '/app/profile',
      screenshotNames.profile,
      async () => {},
    )

    await context.close()

    const iosContext = await browser.newContext({
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      locale: 'ru-RU',
      serviceWorkers: 'block',
      userAgent: iosSafariUserAgent,
      viewport: { height: 844, width: 390 },
    })
    await iosContext.addInitScript(() => {
      Object.defineProperty(window.navigator, 'platform', {
        configurable: true,
        get: () => 'iPhone',
      })
      Object.defineProperty(window.navigator, 'maxTouchPoints', {
        configurable: true,
        get: () => 5,
      })
    })
    await routePortalApis(iosContext, state)

    const iosInstallPage = await iosContext.newPage()
    await preparePage(iosInstallPage)
    await iosInstallPage.goto(`${baseUrl}/app/chat`, {
      waitUntil: 'networkidle',
    })
    await iosInstallPage
      .getByLabel('Установка приложения')
      .waitFor({ state: 'visible' })
    await iosInstallPage.getByRole('button', { name: 'Установить' }).click()
    await iosInstallPage
      .getByText('Выберите добавление на экран Домой.')
      .waitFor({ state: 'visible' })
    await iosInstallPage.screenshot({
      fullPage: false,
      path: join(assetsDir, screenshotNames.iosInstall),
    })
    await iosInstallPage.close()
    await iosContext.close()
  } finally {
    await browser.close()
    await server.stop()
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function assetUrl(fileName) {
  return `assets/${fileName}`
}

function shot(fileName, options = {}) {
  return `
    <figure class="phone-shot ${options.compact ? 'phone-shot--compact' : ''}">
      <div class="phone-frame">
        <img src="${assetUrl(fileName)}" alt="${escapeHtml(options.alt ?? '')}">
      </div>
      ${
        options.caption
          ? `<figcaption>${escapeHtml(options.caption)}</figcaption>`
          : ''
      }
    </figure>
  `
}

function page({ kicker, title, body, visual, note }) {
  return `
    <section class="page">
      <header class="page-head">
        <div class="kicker">${escapeHtml(kicker)}</div>
        <h1>${escapeHtml(title)}</h1>
      </header>
      <div class="page-grid">
        <div class="page-copy">${body}</div>
        <div class="page-visual">${visual ?? ''}</div>
      </div>
      ${note ? `<p class="page-note">${note}</p>` : ''}
    </section>
  `
}

function bullets(items) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
}

function steps(items) {
  return `<ol class="guide-steps">${items
    .map((item) => `<li>${item}</li>`)
    .join('')}</ol>`
}

function supportVisual() {
  return `
    <div class="support-card">
      <div class="support-title">Нужна помощь?</div>
      <div class="support-phone">${supportPhone}</div>
      <p>Если email или телефон не найден, обратитесь к поддержке. Контакт должен быть заранее добавлен в админке.</p>
      <div class="mini-checklist">
        <span>Проверьте адрес сайта</span>
        <span>Проверьте email</span>
        <span>Проверьте папку «Спам»</span>
      </div>
    </div>
  `
}

function buildHtml() {
  const pages = [
    page({
      body: `
        <p><strong>Доступ открывается только для известных клиентов.</strong> Перед первым входом ваш контакт должен быть заведен в админке поддержки.</p>
        <p>В контакте должны быть указаны email и телефон, которые вы используете для общения с поддержкой.</p>
        ${bullets([
          'если email уже известен личному кабинету клиента, вы сразу войдете по коду из почты;',
          'если email найден в контактах поддержки, личный кабинет клиента активирует доступ после принятия условий;',
          'если email не найден, обратитесь в поддержку.',
        ])}
        <p>Откройте браузер на телефоне и введите адрес <strong>lk.provgroup.ru</strong>.</p>
        ${steps([
          'В адресной строке должен быть именно lk.provgroup.ru.',
          'После открытия вы увидите экран входа для клиентов.',
        ])}
      `,
      kicker: 'Шаг 1',
      title: 'Откройте личный кабинет клиента в браузере',
      visual: shot(screenshotNames.login),
    }),
    page({
      body: `
        <p>Основной вход работает по email-коду. Введите email, который используется для общения с поддержкой, и нажмите <strong>Получить код</strong>.</p>
        <p>Если пароль уже был настроен, можно перейти к входу по паролю отдельной ссылкой.</p>
        ${steps([
          'Введите email из вашего контакта поддержки.',
          'Нажмите «Получить код».',
          'Ссылка «Войти по паролю» нужна только тем, кто уже настроил пароль.',
        ])}
      `,
      kicker: 'Шаг 2',
      title: 'Получите код на email',
      visual: shot(screenshotNames.login),
    }),
    page({
      body: `
        <p>Откройте письмо от сервиса, найдите одноразовый код и введите его на экране подтверждения.</p>
        <p>Код действует ограниченное время. Если время вышло, запросите новый код.</p>
        ${steps([
          'Проверьте, что на экране указан ваш email.',
          'Введите 6 цифр из письма.',
          'Если письма нет, проверьте «Спам» или запросите новый код после таймера.',
        ])}
      `,
      kicker: 'Шаг 3',
      title: 'Введите код из письма',
      visual: shot(screenshotNames.verify),
    }),
    page({
      body: `
        <p>При первом доступе нужно принять пользовательское соглашение и согласие на обработку персональных данных.</p>
        <p>Без этих отметок личный кабинет клиента не откроет чат.</p>
        ${steps([
          'Отметьте оба согласия.',
          'Кнопка «Продолжить» станет активной.',
          'После продолжения откроется чат.',
        ])}
      `,
      kicker: 'Шаг 4',
      title: 'Примите условия',
      visual: shot(screenshotNames.legal),
    }),
    page({
      body: `
        <p>В чате отображается переписка с поддержкой. Напишите сообщение в нижнее поле и отправьте его кнопкой справа.</p>
        <p>Меню в правом верхнем углу открывает профиль, настройки и выход. Если вас добавили в групповые чаты, выберите нужную группу через меню слева.</p>
        <p>После входа по коду можно пользоваться чатом без пароля. Если вы выйдете из аккаунта или очистите cookies, следующий вход снова будет по коду из почты. Пароль можно задать позже в профиле.</p>
        ${steps([
          'Верхняя панель показывает текущий чат и статус связи.',
          'История сообщений находится в центре экрана.',
          'Новое сообщение вводится в поле внизу.',
          'Групповой чат можно выбрать в левом меню, если он доступен вашему аккаунту.',
        ])}
      `,
      kicker: 'Шаг 5',
      title: 'Пользуйтесь чатом',
      visual: shot(screenshotNames.chat),
    }),
    page({
      body: `
        <p>На Android личный кабинет клиента показывает блок установки, когда браузер готов установить приложение.</p>
        <p>Нажмите <strong>Установить</strong>. После этого Chrome покажет системное подтверждение установки.</p>
        <p>Если вы нажали <strong>Позже</strong>, установку можно запустить через меню Chrome: нажмите кнопку с тремя точками в правом верхнем углу браузера, найдите пункт <strong>Установить приложение</strong> или <strong>Добавить на главный экран</strong> и подтвердите установку.</p>
        ${steps([
          'Откройте личный кабинет клиента в Chrome.',
          'Дождитесь блока «Установите кабинет».',
          'Нажмите «Установить» и подтвердите установку в системном окне Chrome.',
          'Если блок закрыт, нажмите меню Chrome в правом верхнем углу.',
          'Выберите «Установить приложение» или «Добавить на главный экран».',
          'Нажмите «Установить» или «Добавить» в системном подтверждении.',
        ])}
      `,
      kicker: 'Шаг 6',
      title: 'Установите на Android',
      visual: shot(screenshotNames.androidInstall),
      note: 'Если блок установки не появился сразу, откройте чат при наличии интернета и подождите несколько секунд. Chrome сам решает, когда показать предложение установки.',
    }),
    page({
      body: `
        <p>На iPhone установка выполняется вручную через меню браузера, поэтому личный кабинет клиента показывает короткую инструкцию прямо внутри чата.</p>
        <p>Нажмите <strong>Установить</strong>, прочитайте шаги и выполните их в Safari или Chrome.</p>
        ${steps([
          'Откройте личный кабинет клиента в Safari или Chrome.',
          'Нажмите «Поделиться».',
          'Выберите добавление на экран Домой.',
          'Нажмите «Добавить».',
        ])}
      `,
      kicker: 'Шаг 7',
      title: 'Установите на iPhone',
      visual: shot(screenshotNames.iosInstall),
      note: 'В Chrome название пункта может отличаться, например «Добавить на главный экран». Системное меню браузера открывается поверх страницы, поэтому на скриншоте показана подсказка внутри кабинета.',
    }),
    page({
      body: `
        <p>Откройте профиль из меню чата. Здесь видны имя, email, телефон и состояние пароля.</p>
        <p>Если пароль не задан, нажмите <strong>Задать пароль</strong>. Личный кабинет клиента отправит код на ваш email, чтобы подтвердить владельца аккаунта.</p>
        ${steps([
          'Данные профиля берутся из вашего контакта поддержки.',
          'Если пароль не задан, это нормально: можно продолжать работать по email-коду.',
          'Пароль можно настроить позже без выхода из чата.',
        ])}
      `,
      kicker: 'Шаг 8',
      title: 'Проверьте профиль и пароль',
      visual: shot(screenshotNames.profile),
    }),
    page({
      body: `
        <p>Если вы вышли из аккаунта, очистили cookies или открываете личный кабинет клиента на новом устройстве, просто войдите снова по коду из почты.</p>
        <p>Это штатный сценарий для пользователей, которые не задавали пароль.</p>
        ${steps([
          'Введите тот же email.',
          'Получите новый код.',
          'После подтверждения личный кабинет клиента снова откроет чат.',
        ])}
      `,
      kicker: 'Шаг 9',
      title: 'Войдите снова по коду',
      visual: shot(screenshotNames.login),
    }),
    page({
      body: `
        <p>Если пароль уже настроен, можно войти быстрее через экран <strong>Вход по паролю</strong>.</p>
        <p>Если пароль забыт, используйте восстановление по коду из почты на этом же экране.</p>
        ${steps([
          'Введите email и пароль.',
          'Если пароль забыт, нажмите «Забыли пароль?».',
          'Можно вернуться к входу по коду через ссылку «Войти по коду».',
        ])}
      `,
      kicker: 'Шаг 10',
      title: 'Войдите по паролю, если он задан',
      visual: shot(screenshotNames.password),
    }),
    page({
      body: `
        <p>Если письмо с кодом не пришло, проверьте папку «Спам», правильность email и наличие интернета.</p>
        <p>Если личный кабинет клиента пишет, что доступа нет, обратитесь в поддержку: скорее всего, email или телефон еще не добавлены в контакт.</p>
      `,
      kicker: 'Шаг 11',
      title: 'Поддержка и быстрые проверки',
      visual: supportVisual(),
    }),
  ]

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>PROVGROUP: инструкция по личному кабинету</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    html { color: #112540; font-family: Inter, Arial, sans-serif; hyphens: auto; }
    body { margin: 0; background: #eef4fb; color: #203047; }
    p, li { color: #526174; font-size: 15px; line-height: 1.58; overflow-wrap: anywhere; hyphens: auto; }
    strong { color: #15486b; }
    ul { margin: 16px 0 0; padding-left: 20px; }
    li + li { margin-top: 8px; }
    .page {
      break-after: page;
      display: flex;
      flex-direction: column;
      min-height: 273mm;
      padding: 2mm 1mm 0;
    }
    .page-head { margin-bottom: 12mm; }
    .kicker {
      color: #4676b4;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      color: #15486b;
      font-size: 30px;
      line-height: 1.08;
      margin: 6px 0 0;
      max-width: 560px;
      text-transform: uppercase;
    }
    .page-grid {
      align-items: center;
      display: grid;
      gap: 14mm;
      grid-template-columns: minmax(0, 1fr) 78mm;
      min-height: 190mm;
    }
    .page-copy {
      align-self: start;
      padding-top: 34mm;
    }
    .page-copy p:first-child { margin-top: 0; }
    .page-note {
      border-left: 4px solid #f7cf55;
      color: #59687a;
      font-size: 12px;
      margin-top: auto;
      padding-left: 10px;
    }
    .phone-shot { margin: 0; }
    .phone-frame {
      background: #fff;
      border: 1px solid rgba(17, 37, 64, .18);
      border-radius: 26px;
      box-shadow: 0 12px 32px rgba(17, 37, 64, .18);
      overflow: hidden;
      position: relative;
      width: 78mm;
    }
    .phone-frame img { display: block; width: 100%; }
    figcaption {
      color: #718096;
      font-size: 11px;
      line-height: 1.4;
      margin-top: 8px;
      text-align: center;
    }
    .guide-steps {
      counter-reset: guide-step;
      list-style: none;
      margin: 18px 0 0;
      padding: 0;
    }
    .guide-steps li {
      align-items: flex-start;
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    .guide-steps li::before {
      align-items: center;
      background: #15486b;
      border-radius: 999px;
      color: #fff;
      content: counter(guide-step);
      counter-increment: guide-step;
      display: inline-flex;
      flex: 0 0 auto;
      font-size: 11px;
      font-weight: 800;
      height: 22px;
      justify-content: center;
      line-height: 1;
      margin-top: 1px;
      width: 22px;
    }
    .support-card {
      background: rgba(255, 255, 255, .9);
      border: 1px solid rgba(17, 37, 64, .12);
      border-radius: 18px;
      box-shadow: 0 12px 34px rgba(17, 37, 64, .13);
      color: #112540;
      min-height: 126mm;
      overflow: hidden;
      padding: 18px;
      position: relative;
      width: 78mm;
    }
    .support-card { display: flex; flex-direction: column; justify-content: center; }
    .support-title { color: #15486b; font-size: 22px; font-weight: 850; }
    .support-phone { color: #4676b4; font-size: 21px; font-weight: 850; margin: 12px 0 8px; }
    .mini-checklist { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
    .mini-checklist span {
      background: #f1f7ff;
      border-radius: 10px;
      color: #15486b;
      font-size: 12px;
      font-weight: 750;
      padding: 9px 10px;
    }
  </style>
</head>
<body>
  ${pages.join('\n')}
</body>
</html>`
}

function normalizeGeneratedText(value) {
  return `${value.replace(/[ \t]+$/gm, '').trimEnd()}\n`
}

async function generatePdf() {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { height: 1123, width: 794 },
  })

  await page.goto(pathToFileURL(htmlPath).href, {
    waitUntil: 'networkidle',
  })
  await page.pdf({
    format: 'A4',
    margin: { bottom: '0', left: '0', right: '0', top: '0' },
    path: pdfPath,
    preferCSSPageSize: true,
    printBackground: true,
  })
  await browser.close()
}

async function main() {
  if (!existsSync(join(repoRoot, 'frontend/package.json'))) {
    throw new Error(`Cannot find frontend package from ${repoRoot}`)
  }

  await rm(assetsDir, { force: true, recursive: true })
  await mkdir(assetsDir, { recursive: true })

  await captureScreens()
  await writeFile(htmlPath, normalizeGeneratedText(buildHtml()), 'utf8')
  await generatePdf()

  console.log(`Wrote ${htmlPath}`)
  console.log(`Wrote ${pdfPath}`)
}

await main()
