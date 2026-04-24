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
  waiting: ServiceWorker | null
  readonly update = vi.fn().mockResolvedValue(undefined)

  constructor({
    installing = null,
    waiting = null,
  }: {
    installing?: ServiceWorker | null
    waiting?: ServiceWorker | null
  } = {}) {
    super()
    this.installing = installing
    this.waiting = waiting
  }
}

class MockServiceWorkerContainer extends EventTarget {
  controller: ServiceWorker | null
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
    this.register.mockResolvedValue(registration)
  }
}

function setServiceWorkerContainer(
  container: MockServiceWorkerContainer | undefined,
) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  })
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
})
