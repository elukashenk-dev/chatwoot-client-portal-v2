import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BOOT_CACHE_FALLBACK_MS,
  BOOT_ONLINE_REQUIRED_MS,
  BOOT_REQUEST_TIMEOUT_MS,
  BOOT_SLOW_NOTICE_MS,
} from '../../offline/bootCoordinator'
import { clearOfflineDatabaseForTests } from '../../offline/offlineDatabase'
import { offlineStore } from '../../offline/offlineStore'
import { TenantAuthShell } from '../components/TenantAuthShell'
import { TenantProvider } from './TenantProvider'
import { createTenantMonogram } from './tenantIdentityMetadata'
import { useTenantIdentity } from './useTenantIdentity'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function TenantProbe() {
  const { isUsingCachedData, status, tenant } = useTenantIdentity()

  return (
    <div>
      <span>{status}</span>
      <span>{isUsingCachedData ? 'cached tenant' : 'online tenant'}</span>
      <span>{tenant?.displayName ?? 'no tenant'}</span>
    </div>
  )
}

function appendMetadata(name: string, content = '') {
  const meta = document.createElement('meta')

  meta.setAttribute('name', name)
  meta.setAttribute('content', content)
  document.head.append(meta)
}

async function advanceBootTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function createTenantResponse(displayName = 'Бухфирма') {
  return createJsonResponse({
    tenant: {
      displayName,
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    },
  })
}

function cachedTenantRecord() {
  return {
    host: window.location.host,
    savedAt: '2026-05-27T10:00:00.000Z',
    tenant: {
      displayName: 'Бухфирма',
      primaryDomain: 'lk.buhfirma.ru',
      publicBaseUrl: 'https://lk.buhfirma.ru',
      slug: 'buhfirma',
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}

describe('TenantProvider', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock)
    document.head.innerHTML = ''
    document.title = 'Клиентский портал'
    appendMetadata('application-name')
    appendMetadata('apple-mobile-web-app-title')
    appendMetadata('description')
    appendMetadata('theme-color')
    await clearOfflineDatabaseForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('shows the boot splash while tenant identity is loading', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Загружаем настройки.')).toBeInTheDocument()
    expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
  })

  it('loads public tenant context and applies document metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'lk.buhfirma.ru',
          publicBaseUrl: 'https://lk.buhfirma.ru',
          slug: 'buhfirma',
        },
      }),
    )

    render(
      <TenantProvider>
        <TenantProbe />
        <TenantAuthShell description="Описание" title="Клиентский портал">
          <div />
        </TenantAuthShell>
      </TenantProvider>,
    )

    expect(await screen.findAllByText('Бухфирма')).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tenant',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(screen.getByText('БУ')).toBeInTheDocument()
    expect(document.title).toBe('Бухфирма Личный кабинет')
    expect(
      document
        .querySelector('meta[name="application-name"]')
        ?.getAttribute('content'),
    ).toBe('Бухфирма Личный кабинет')
    expect(
      document
        .querySelector('meta[name="apple-mobile-web-app-title"]')
        ?.getAttribute('content'),
    ).toBe('Бухфирма')
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#112540')
  })

  it('opens online tenant when cache save fails after online startup success', async () => {
    vi.spyOn(offlineStore, 'saveTenantContext').mockRejectedValueOnce(
      new DOMException('IndexedDB unavailable', 'InvalidStateError'),
    )
    fetchMock.mockResolvedValueOnce(createTenantResponse())

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByText('online tenant')).toBeInTheDocument()
    expect(screen.getByText('Бухфирма')).toBeInTheDocument()
  })

  it('shows online-required state when tenant context is authoritatively unavailable', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Личный кабинет для этого домена не найден.',
          },
        },
        404,
      ),
    )

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    expect(
      await screen.findByText('Нужно подключение к интернету.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Для первого входа и проверки доступа требуется соединение.',
      ),
    ).toBeInTheDocument()
    expect(document.title).toBe('Клиентский портал')
  })

  it('opens cached tenant when online tenant request is slow', async () => {
    await offlineStore.saveTenantContext(cachedTenantRecord())
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await advanceBootTimers(BOOT_SLOW_NOTICE_MS)

    expect(
      screen.getByText(
        'Связь отвечает медленно. Проверяем сохраненные данные.',
      ),
    ).toBeInTheDocument()

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS - BOOT_SLOW_NOTICE_MS)

    expect(screen.getByText('ready_cached')).toBeInTheDocument()
    expect(screen.getByText('cached tenant')).toBeInTheDocument()
    expect(screen.getByText('Бухфирма')).toBeInTheDocument()

    await advanceBootTimers(BOOT_REQUEST_TIMEOUT_MS - BOOT_CACHE_FALLBACK_MS)

    expect(screen.getByText('ready_cached')).toBeInTheDocument()
    expect(screen.getByText('cached tenant')).toBeInTheDocument()
  })

  it('leaves splash with online-required state when tenant cache is missing', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(
      screen.getByText('Нужно подключение к интернету.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Для первого входа и проверки доступа требуется соединение.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('no tenant')).not.toBeInTheDocument()

    await advanceBootTimers(BOOT_REQUEST_TIMEOUT_MS - BOOT_ONLINE_REQUIRED_MS)

    expect(
      screen.getByText('Нужно подключение к интернету.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
  })

  it('leaves splash with controlled copy when saved tenant storage is unavailable', async () => {
    vi.useFakeTimers()
    vi.spyOn(offlineStore, 'readTenantContext').mockRejectedValueOnce(
      new DOMException('IndexedDB unavailable', 'InvalidStateError'),
    )
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(
      screen.getByText('Сохраненные данные недоступны. Нужно подключение.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
  })

  it('leaves splash with controlled copy when saved tenant cache read fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(offlineStore, 'readTenantContext').mockRejectedValueOnce(
      new Error('cache read failed'),
    )
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(
      screen.getByText('Сохраненные данные недоступны. Нужно подключение.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
  })

  it('leaves splash when saved tenant cache read never settles', async () => {
    vi.useFakeTimers()
    vi.spyOn(offlineStore, 'readTenantContext').mockReturnValueOnce(
      new Promise(() => {}),
    )
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)

    expect(
      screen.getByText('Сохраненные данные недоступны. Нужно подключение.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('no tenant')).not.toBeInTheDocument()
  })

  it('invalidates cached tenant on authoritative rejection', async () => {
    await offlineStore.saveTenantContext(cachedTenantRecord())
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Личный кабинет для этого домена не найден.',
          },
        },
        404,
      ),
    )

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    expect(
      await screen.findByText('Нужно подключение к интернету.'),
    ).toBeInTheDocument()
    await expect(
      offlineStore.readTenantContext(window.location.host),
    ).resolves.toBeNull()
  })

  it('shows online-required state when cached tenant invalidation fails', async () => {
    vi.spyOn(offlineStore, 'deleteTenantContext').mockRejectedValueOnce(
      new DOMException('IndexedDB unavailable', 'InvalidStateError'),
    )
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Личный кабинет для этого домена не найден.',
          },
        },
        404,
      ),
    )

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    expect(
      await screen.findByText('Нужно подключение к интернету.'),
    ).toBeInTheDocument()
  })

  it('opens cached tenant on non-authoritative tenant startup failure', async () => {
    await offlineStore.saveTenantContext(cachedTenantRecord())
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_SECRET_KEY_INVALID',
            message: 'Tenant secret key is invalid.',
          },
        },
        500,
      ),
    )

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    expect(await screen.findByText('ready_cached')).toBeInTheDocument()
    expect(screen.getByText('cached tenant')).toBeInTheDocument()
    expect(screen.getByText('Бухфирма')).toBeInTheDocument()
    await expect(
      offlineStore.readTenantContext(window.location.host),
    ).resolves.toMatchObject({
      tenant: {
        slug: 'buhfirma',
      },
    })
  })

  it('does not let slow-start timers overwrite a fast online tenant', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(createTenantResponse())

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument()
    })

    await advanceBootTimers(BOOT_REQUEST_TIMEOUT_MS)

    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.getByText('online tenant')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Связь отвечает медленно. Проверяем сохраненные данные.',
      ),
    ).not.toBeInTheDocument()
  })

  it('does not let delayed cache fallback overwrite a fresh online tenant', async () => {
    vi.useFakeTimers()
    const cachedTenant =
      createDeferred<
        Awaited<ReturnType<typeof offlineStore.readTenantContext>>
      >()
    const onlineTenant = createDeferred<Response>()

    vi.spyOn(offlineStore, 'readTenantContext').mockReturnValueOnce(
      cachedTenant.promise,
    )
    fetchMock.mockReturnValueOnce(onlineTenant.promise)

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await advanceBootTimers(BOOT_CACHE_FALLBACK_MS)

    await act(async () => {
      onlineTenant.resolve(createTenantResponse('Fresh Tenant'))
    })

    await vi.waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument()
    })

    await act(async () => {
      cachedTenant.resolve(cachedTenantRecord())
    })

    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.getByText('online tenant')).toBeInTheDocument()
    expect(screen.getByText('Fresh Tenant')).toBeInTheDocument()
    expect(screen.queryByText('cached tenant')).not.toBeInTheDocument()
  })

  it('retries tenant load from online-required state', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))

    render(
      <TenantProvider>
        <TenantProbe />
      </TenantProvider>,
    )

    await advanceBootTimers(BOOT_ONLINE_REQUIRED_MS)
    expect(
      screen.getByText('Нужно подключение к интернету.'),
    ).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(createTenantResponse())
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

    await vi.waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument()
    })
    expect(screen.getByText('online tenant')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('creates readable monograms from tenant names', () => {
    expect(createTenantMonogram('Бухгалтерская Фирма')).toBe('БФ')
    expect(createTenantMonogram('Zubi')).toBe('ZU')
    expect(createTenantMonogram('')).toBe('ЛК')
  })
})
