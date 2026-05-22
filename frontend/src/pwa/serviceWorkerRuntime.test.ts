import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MockServiceWorker extends EventTarget {
  state: ServiceWorkerState
  readonly postMessage = vi.fn()

  constructor(state: ServiceWorkerState) {
    super()
    this.state = state
  }
}

class MockServiceWorkerRegistration extends EventTarget {
  installing: ServiceWorker | null
  pushManager?: PushManager
  waiting: ServiceWorker | null
  readonly update = vi.fn().mockResolvedValue(undefined)

  constructor({
    installing = null,
    pushManager,
    waiting = null,
  }: {
    installing?: ServiceWorker | null
    pushManager?: PushManager
    waiting?: ServiceWorker | null
  } = {}) {
    super()
    this.installing = installing
    this.pushManager = pushManager
    this.waiting = waiting
  }
}

class MockServiceWorkerContainer extends EventTarget {
  controller: ServiceWorker | null
  ready: Promise<ServiceWorkerRegistration>
  readonly register = vi.fn<() => Promise<ServiceWorkerRegistration>>()

  constructor({
    controller = {} as ServiceWorker,
    registration,
  }: {
    controller?: ServiceWorker | null
    registration: ServiceWorkerRegistration
  }) {
    super()
    this.controller = controller
    this.ready = Promise.resolve(registration)
    this.register.mockResolvedValue(registration)
  }
}

class MockPushSubscription {
  endpoint: string
  readonly unsubscribe = vi.fn(async () => true)

  constructor(endpoint = 'https://push.example.test/subscription') {
    this.endpoint = endpoint
  }

  toJSON(): PushSubscriptionJSON {
    return {
      endpoint: this.endpoint,
      keys: {
        auth: 'auth-secret',
        p256dh: 'p256dh-key',
      },
    }
  }
}

function createPushManager({
  existingSubscription = null,
}: {
  existingSubscription?: MockPushSubscription | null
} = {}) {
  return {
    getSubscription: vi.fn(async () => existingSubscription),
    subscribe: vi.fn(async () => new MockPushSubscription()),
  } as unknown as PushManager
}

function setServiceWorkerContainer(
  container: MockServiceWorkerContainer | undefined,
) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  })
}

function setSecurePushBrowser() {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true,
  })
  vi.stubGlobal('PushManager', class MockPushManager {})
  vi.stubGlobal('Notification', class MockNotification {})
}

describe('serviceWorkerRuntime', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    const runtime = await import('./serviceWorkerRuntime')

    runtime.resetServiceWorkerRuntimeForTests()
    vi.restoreAllMocks()
  })

  it('detects an already waiting worker and applies the update on demand', async () => {
    const waitingWorker = new MockServiceWorker('installed')
    const registration = new MockServiceWorkerRegistration({
      waiting: waitingWorker as unknown as ServiceWorker,
    })

    setServiceWorkerContainer(
      new MockServiceWorkerContainer({
        registration: registration as unknown as ServiceWorkerRegistration,
      }),
    )

    const runtime = await import('./serviceWorkerRuntime')

    await runtime.startServiceWorkerRuntime()

    expect(runtime.getServiceWorkerUpdateSnapshot()).toMatchObject({
      isSupported: true,
      status: 'update_available',
    })
    expect(registration.update).toHaveBeenCalled()
    expect(runtime.applyServiceWorkerUpdate()).toBe(true)
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    })
    expect(runtime.getServiceWorkerUpdateSnapshot().status).toBe('applying')
  })

  it('marks a newly installed worker as update available after updatefound', async () => {
    const installingWorker = new MockServiceWorker('installing')
    const registration = new MockServiceWorkerRegistration({
      installing: installingWorker as unknown as ServiceWorker,
    })

    setServiceWorkerContainer(
      new MockServiceWorkerContainer({
        registration: registration as unknown as ServiceWorkerRegistration,
      }),
    )

    const runtime = await import('./serviceWorkerRuntime')

    await runtime.startServiceWorkerRuntime()
    registration.dispatchEvent(new Event('updatefound'))
    installingWorker.state = 'installed'
    installingWorker.dispatchEvent(new Event('statechange'))

    expect(runtime.getServiceWorkerUpdateSnapshot()).toMatchObject({
      isSupported: true,
      status: 'update_available',
    })
  })

  it('reports unsupported browser push outside a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    })

    const runtime = await import('./serviceWorkerRuntime')

    expect(runtime.getBrowserPushSupportState()).toEqual({
      reason: 'insecure_context',
      supported: false,
    })
  })

  it('converts VAPID base64url public keys to bytes', async () => {
    const runtime = await import('./serviceWorkerRuntime')

    expect(
      Array.from(
        runtime.serviceWorkerRuntimeInternalsForTests.base64UrlToUint8Array(
          'AQID-__',
        ),
      ),
    ).toEqual([1, 2, 3, 251, 255])
  })

  it('subscribes through the ready service worker registration', async () => {
    setSecurePushBrowser()
    const pushManager = createPushManager()
    const registration = new MockServiceWorkerRegistration({
      pushManager,
    })
    setServiceWorkerContainer(
      new MockServiceWorkerContainer({
        registration: registration as unknown as ServiceWorkerRegistration,
      }),
    )

    const runtime = await import('./serviceWorkerRuntime')

    await expect(runtime.subscribeBrowserPush('AQID')).resolves.toEqual({
      endpoint: 'https://push.example.test/subscription',
      keys: {
        auth: 'auth-secret',
        p256dh: 'p256dh-key',
      },
    })
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      applicationServerKey: new Uint8Array([1, 2, 3]),
      userVisibleOnly: true,
    })
  })

  it('registers the page as push-ready while a message listener is active', async () => {
    const controller = new MockServiceWorker('activated')
    const registration = new MockServiceWorkerRegistration()
    const container = new MockServiceWorkerContainer({
      controller: controller as unknown as ServiceWorker,
      registration: registration as unknown as ServiceWorkerRegistration,
    })
    setServiceWorkerContainer(container)
    const handler = vi.fn()

    const runtime = await import('./serviceWorkerRuntime')
    const unregister = runtime.registerPortalPushMessageListener(handler)

    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'PORTAL_PUSH_CLIENT_READY',
    })

    container.dispatchEvent(
      new MessageEvent('message', {
        data: {
          payload: {
            tenantSlug: 'buhfirma',
            type: 'chat_message',
            url: '/',
          },
          type: 'PORTAL_PUSH_MESSAGE',
        },
      }),
    )
    unregister()

    expect(handler).toHaveBeenCalledWith({
      tenantSlug: 'buhfirma',
      type: 'chat_message',
      url: '/',
    })
    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'PORTAL_PUSH_CLIENT_NOT_READY',
    })
  })
})
