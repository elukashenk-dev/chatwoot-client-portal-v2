import { Blob as NodeBlob } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import {
  createServiceWorkerIndexedDbFake,
  createShareTargetNavigationRequest,
  loadServiceWorker,
  type ServiceWorkerTestListener,
} from './serviceWorkerAsset.testSupport'

const HOST = 'lk.provgroup.ru'
const TENANT_SLUG = 'provgroup'
const USER_ID = 7
const SHARE_TARGET_URL = `https://${HOST}/pwa/share-target`
const RAW_SHARE_LIMIT_BYTES = 40 * 1024 * 1024 + 256 * 1024

function createIdentity() {
  return {
    host: HOST,
    savedAt: new Date().toISOString(),
    tenantSlug: TENANT_SLUG,
    userId: USER_ID,
  }
}

function createImageFile(
  name: string,
  {
    bytes = 'image-bytes',
    type = 'image/png',
  }: {
    bytes?: string | Uint8Array
    type?: string
  } = {},
) {
  return new File([bytes], name, { type })
}

async function createShareRequest(files: File[]) {
  const formData = new FormData()

  for (const file of files) {
    formData.append('attachments', file)
  }

  return createShareTargetNavigationRequest({ formData })
}

async function dispatchFetch(
  listener: ServiceWorkerTestListener,
  request: Request,
) {
  let responsePromise: Promise<Response> | null = null

  listener({
    request,
    respondWith(response) {
      responsePromise = Promise.resolve(response)
    },
  })

  return responsePromise ? await responsePromise : null
}

function getShareError(response: Response) {
  const location = response.headers.get('Location')

  expect(location).not.toBeNull()

  return new URL(location!, SHARE_TARGET_URL).searchParams.get('shareError')
}

function loadShareWorker({
  records = {},
}: {
  records?: Record<string, Record<string, unknown>>
} = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  const indexedDbFake = createServiceWorkerIndexedDbFake({ records })
  const { listeners } = loadServiceWorker({
    fetch,
    indexedDB: indexedDbFake.indexedDB,
  })
  const fetchListener = listeners.get('fetch')?.[0]

  expect(fetchListener).toBeDefined()

  return {
    fetch,
    fetchListener: fetchListener!,
    indexedDbFake,
  }
}

describe('service worker PWA share target', () => {
  it('stages ordered images for the exact identity without sending them', async () => {
    const { fetch, fetchListener, indexedDbFake } = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
      },
    })

    const request = await createShareRequest([
      createImageFile('screen.png'),
      createImageFile('photo.jpg', { type: 'image/jpeg' }),
    ])

    const response = await dispatchFetch(fetchListener, request)

    expect(response?.status).toBe(303)
    expect(response?.headers.get('Location')).toMatch(
      /^\/app\/chat\?shareDraft=[0-9a-f-]+$/,
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(indexedDbFake.getAllCalls).toEqual([])
    expect(indexedDbFake.primaryCursorCalls).toEqual([])
    expect(indexedDbFake.indexLookups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexName: 'by_expiry',
          operation: 'openKeyCursor',
          storeName: 'pending_share_drafts',
        }),
        {
          indexName: 'by_identity',
          key: [HOST, TENANT_SLUG, USER_ID],
          operation: 'get',
          storeName: 'pending_share_drafts',
        },
      ]),
    )

    const pendingWrite = indexedDbFake.putCalls.find(
      (call) => call.storeName === 'pending_share_drafts',
    )

    expect(pendingWrite).toEqual({
      key: undefined,
      storeName: 'pending_share_drafts',
      value: expect.objectContaining({
        draftId: expect.stringMatching(/^[0-9a-f-]+$/),
        files: [
          expect.objectContaining({ fileName: 'screen.png' }),
          expect.objectContaining({ fileName: 'photo.jpg' }),
        ],
        host: HOST,
        tenantSlug: TENANT_SLUG,
        userId: USER_ID,
      }),
    })
  })

  it.each([
    {
      destination: 'document',
      method: 'GET',
      mode: 'navigate',
      name: 'GET action',
      url: SHARE_TARGET_URL,
    },
    {
      destination: 'document',
      method: 'POST',
      mode: 'navigate',
      name: 'cross-origin POST',
      url: 'https://evil.example/pwa/share-target',
    },
    {
      destination: 'document',
      method: 'POST',
      mode: 'same-origin',
      name: 'non-navigation POST',
      url: SHARE_TARGET_URL,
    },
    {
      destination: '',
      method: 'POST',
      mode: 'navigate',
      name: 'non-document navigation POST',
      url: SHARE_TARGET_URL,
    },
    {
      destination: 'document',
      method: 'POST',
      mode: 'navigate',
      name: 'near-path POST',
      url: `${SHARE_TARGET_URL}/extra`,
    },
  ])('does not intercept $name', ({ destination, method, mode, url }) => {
    const { fetchListener } = loadShareWorker()
    const respondWith = vi.fn()

    fetchListener({
      request: {
        destination,
        method,
        mode,
        url,
      } as Request,
      respondWith,
    })

    expect(respondWith).not.toHaveBeenCalled()
  })

  it('returns a controlled error when the navigation body is unreadable', async () => {
    const { fetchListener } = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
      },
    })
    const response = await dispatchFetch(fetchListener, {
      body: null,
      destination: 'document',
      headers: new Headers({
        'Content-Type': 'multipart/form-data; boundary=test',
      }),
      method: 'POST',
      mode: 'navigate',
      url: SHARE_TARGET_URL,
    } as Request)

    expect(response?.status).toBe(303)
    expect(getShareError(response!)).toBe('body_unavailable')
  })

  it('cancels a raw body that exceeds the hard pre-decode limit', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array(RAW_SHARE_LIMIT_BYTES + 1))
      },
    })
    const { fetchListener, indexedDbFake } = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
      },
    })
    const response = await dispatchFetch(fetchListener, {
      body,
      destination: 'document',
      headers: new Headers({
        'Content-Type': 'multipart/form-data; boundary=test',
      }),
      method: 'POST',
      mode: 'navigate',
      url: SHARE_TARGET_URL,
    } as Request)

    expect(response?.status).toBe(303)
    expect(getShareError(response!)).toBe('batch_too_large')
    expect(cancel).toHaveBeenCalledOnce()
    expect(indexedDbFake.putCalls).toEqual([])
  })

  it('requires a last-active identity and rejects an exact local signout', async () => {
    const missingIdentityWorker = loadShareWorker()
    const missingIdentityResponse = await dispatchFetch(
      missingIdentityWorker.fetchListener,
      await createShareRequest([createImageFile('screen.png')]),
    )

    expect(getShareError(missingIdentityResponse!)).toBe('session_required')
    expect(missingIdentityWorker.indexedDbFake.putCalls).toEqual([])

    const signedOutWorker = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
        local_device_signouts: {
          [HOST]: {
            createdAt: new Date().toISOString(),
            host: HOST,
            tenantSlug: TENANT_SLUG,
            userId: USER_ID,
          },
        },
      },
    })
    const signedOutResponse = await dispatchFetch(
      signedOutWorker.fetchListener,
      await createShareRequest([createImageFile('screen.png')]),
    )

    expect(getShareError(signedOutResponse!)).toBe('session_required')
    expect(signedOutWorker.indexedDbFake.putCalls).toEqual([])
  })

  it('rejects unsupported types, a sixth file and aggregate overflow', async () => {
    const unsupportedWorker = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
      },
    })
    const unsupportedResponse = await dispatchFetch(
      unsupportedWorker.fetchListener,
      await createShareRequest([
        createImageFile('notes.txt', { type: 'text/plain' }),
      ]),
    )

    expect(getShareError(unsupportedResponse!)).toBe('type_not_allowed')

    const countWorker = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
      },
    })
    const countResponse = await dispatchFetch(
      countWorker.fetchListener,
      await createShareRequest(
        Array.from({ length: 6 }, (_, index) =>
          createImageFile(`screen-${index}.png`),
        ),
      ),
    )

    expect(getShareError(countResponse!)).toBe('count_exceeded')

    const aggregateWorker = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
      },
    })
    const aggregateResponse = await dispatchFetch(
      aggregateWorker.fetchListener,
      await createShareRequest([
        createImageFile('large-1.png', {
          bytes: new Uint8Array(20 * 1024 * 1024 + 1),
        }),
        createImageFile('large-2.png', {
          bytes: new Uint8Array(20 * 1024 * 1024),
        }),
      ]),
    )

    expect(getShareError(aggregateResponse!)).toBe('batch_too_large')
  })

  it('admits only one active share parse per service-worker scope', async () => {
    const { fetchListener } = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
      },
    })
    let firstResponsePromise: Promise<Response> | null = null
    const firstRequest = await createShareRequest([
      createImageFile('first.png'),
    ])

    fetchListener({
      request: firstRequest,
      respondWith(response) {
        firstResponsePromise = Promise.resolve(response)
      },
    })

    const secondResponse = await dispatchFetch(
      fetchListener,
      await createShareRequest([createImageFile('second.png')]),
    )

    expect(getShareError(secondResponse!)).toBe('busy')
    await expect(firstResponsePromise).resolves.toMatchObject({ status: 303 })
  })

  it('appends in order to one unexpired draft for the same identity', async () => {
    const existingDraft = {
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      draftId: '11111111-1111-4111-8111-111111111111',
      expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
      files: [
        {
          blob: new NodeBlob(['first'], { type: 'image/png' }),
          fileName: 'first.png',
          lastModified: 1,
          mimeType: 'image/png',
        },
      ],
      host: HOST,
      tenantSlug: TENANT_SLUG,
      userId: USER_ID,
    }
    const { fetchListener, indexedDbFake } = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
        pending_share_drafts: {
          [existingDraft.draftId]: existingDraft,
        },
      },
    })
    const response = await dispatchFetch(
      fetchListener,
      await createShareRequest([createImageFile('second.png')]),
    )

    expect(response?.headers.get('Location')).toBe(
      `/app/chat?shareDraft=${existingDraft.draftId}`,
    )
    expect(indexedDbFake.putCalls).toContainEqual({
      key: undefined,
      storeName: 'pending_share_drafts',
      value: expect.objectContaining({
        draftId: existingDraft.draftId,
        files: [
          expect.objectContaining({ fileName: 'first.png' }),
          expect.objectContaining({ fileName: 'second.png' }),
        ],
      }),
    })
  })

  it('retains an existing draft unchanged when append would overflow', async () => {
    const existingDraft = {
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      draftId: '22222222-2222-4222-8222-222222222222',
      expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
      files: Array.from({ length: 5 }, (_, index) => ({
        blob: new NodeBlob([`file-${index}`], { type: 'image/png' }),
        fileName: `existing-${index}.png`,
        lastModified: index,
        mimeType: 'image/png',
      })),
      host: HOST,
      tenantSlug: TENANT_SLUG,
      userId: USER_ID,
    }
    const { fetchListener, indexedDbFake } = loadShareWorker({
      records: {
        last_active_identities: {
          [HOST]: createIdentity(),
        },
        pending_share_drafts: {
          [existingDraft.draftId]: existingDraft,
        },
      },
    })
    const response = await dispatchFetch(
      fetchListener,
      await createShareRequest([createImageFile('sixth.png')]),
    )

    expect(getShareError(response!)).toBe('count_exceeded')
    expect(
      indexedDbFake.putCalls.filter(
        (call) => call.storeName === 'pending_share_drafts',
      ),
    ).toEqual([])
    expect(
      indexedDbFake.storeRecords
        .get('pending_share_drafts')
        ?.get(existingDraft.draftId),
    ).toEqual(existingDraft)
  })
})
