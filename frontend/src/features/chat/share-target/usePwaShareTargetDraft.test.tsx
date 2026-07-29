import {
  type PropsWithChildren,
  act,
  useState,
} from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AuthSessionContext,
  type AuthSessionContextValue,
} from '../../auth/lib/authSessionContext'
import type { OfflinePendingShareDraftRecord } from '../../offline/types'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'
import type { AttachmentAdmissionResult } from '../lib/attachmentDraft'
import {
  deletePendingShareDraft,
  pruneExpiredPendingShareDrafts,
  readPendingShareDraft,
  replacePendingShareDraftFiles,
} from './pendingShareDraftStore'
import { usePwaShareTargetDraft } from './usePwaShareTargetDraft'

vi.mock('./pendingShareDraftStore', () => ({
  deletePendingShareDraft: vi.fn(),
  pruneExpiredPendingShareDrafts: vi.fn(),
  readPendingShareDraft: vi.fn(),
  replacePendingShareDraftFiles: vi.fn(),
}))

const deletePendingShareDraftMock = vi.mocked(deletePendingShareDraft)
const pruneExpiredPendingShareDraftsMock = vi.mocked(
  pruneExpiredPendingShareDrafts,
)
const readPendingShareDraftMock = vi.mocked(readPendingShareDraft)
const replacePendingShareDraftFilesMock = vi.mocked(
  replacePendingShareDraftFiles,
)
const privateThread = {
  id: 'private:me' as const,
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private' as const,
  unreadCount: 0,
}
const groupThread = {
  id: 'group:17' as const,
  subtitle: '3 участника',
  title: 'Бухгалтерия',
  type: 'group' as const,
  unreadCount: 0,
}
const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'Бухфирма',
    primaryDomain: 'localhost',
    publicBaseUrl: 'http://localhost',
    slug: 'buhfirma',
  },
}

function createAuthValue({
  refreshSession = vi.fn(async () => {}),
  sessionSource = 'online',
  userId = 7,
}: {
  refreshSession?: AuthSessionContextValue['refreshSession']
  sessionSource?: AuthSessionContextValue['sessionSource']
  userId?: number
} = {}): AuthSessionContextValue {
  return {
    completeAuthenticatedSession: vi.fn(async () => {}),
    errorMessage: null,
    localDeviceDataRemovalAvailable: true,
    refreshSession,
    removeLocalDeviceData: vi.fn(async () => {}),
    sessionSource,
    signIn: vi.fn(),
    signOut: vi.fn(async () => {}),
    status: 'authenticated',
    user: {
      email: `user-${userId}@company.ru`,
      fullName: `User ${userId}`,
      id: userId,
      passwordConfigured: true,
    },
  }
}

function createDraft(
  files: Array<{
    contents: string
    fileName: string
    mimeType: string
  }> = [
    {
      contents: 'screen',
      fileName: 'screenshot.png',
      mimeType: 'image/png',
    },
  ],
): OfflinePendingShareDraftRecord {
  return {
    createdAt: '2026-07-29T10:00:00.000Z',
    draftId: 'draft-123',
    expiresAt: '2099-07-29T10:15:00.000Z',
    files: files.map(({ contents, fileName, mimeType }) => ({
      blob: new Blob([contents], { type: mimeType }),
      fileName,
      lastModified: 1_800_000_000_000,
      mimeType,
    })),
    host: window.location.host,
    tenantSlug: 'buhfirma',
    userId: 7,
  }
}

function acceptAllFiles(
  files: readonly File[],
  source: 'share-target',
): AttachmentAdmissionResult {
  const accepted = files.map((file, index) => ({
    file,
    id: `accepted-${index}`,
    source,
  }))

  return {
    accepted,
    items: accepted,
    rejections: [],
  }
}

function renderShareTargetHook({
  addFiles = vi.fn(acceptAllFiles),
  authValue = createAuthValue(),
  entry = '/app/chat?shareDraft=draft-123',
  threads = [privateThread, groupThread],
}: {
  addFiles?: ReturnType<typeof vi.fn<typeof acceptAllFiles>>
  authValue?: AuthSessionContextValue
  entry?: string
  threads?: Array<typeof privateThread | typeof groupThread>
} = {}) {
  let setAuthValue:
    | ((value: AuthSessionContextValue) => void)
    | undefined

  function Wrapper({ children }: PropsWithChildren) {
    const [auth, setAuth] = useState(authValue)

    setAuthValue = setAuth

    return (
      <MemoryRouter initialEntries={[entry]}>
        <TenantIdentityContext.Provider value={tenantContextValue}>
          <AuthSessionContext.Provider value={auth}>
            {children}
          </AuthSessionContext.Provider>
        </TenantIdentityContext.Provider>
      </MemoryRouter>
    )
  }

  const hook = renderHook(
    () => {
      const controller = usePwaShareTargetDraft({
        addFiles,
        canImport: true,
        pageStatus: 'ready',
        selectedThreadId: privateThread.id,
        threads,
      })
      const location = useLocation()

      return { controller, search: location.search }
    },
    { wrapper: Wrapper },
  )

  return {
    ...hook,
    addFiles,
    setAuth(value: AuthSessionContextValue) {
      act(() => setAuthValue?.(value))
    },
  }
}

describe('usePwaShareTargetDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deletePendingShareDraftMock.mockResolvedValue()
    pruneExpiredPendingShareDraftsMock.mockResolvedValue(0)
    readPendingShareDraftMock.mockResolvedValue(null)
    replacePendingShareDraftFilesMock.mockResolvedValue()
  })

  it('requires a live session before reading file metadata', async () => {
    const refreshSession = vi.fn(async () => {})
    readPendingShareDraftMock.mockResolvedValue(createDraft())
    const hook = renderShareTargetHook({
      authValue: createAuthValue({
        refreshSession,
        sessionSource: 'cached',
      }),
    })

    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1))
    expect(readPendingShareDraftMock).not.toHaveBeenCalled()
    expect(hook.result.current.controller.pendingDraft).toBeNull()
    expect(hook.result.current.controller.status).toBe('checking-session')

    hook.setAuth(createAuthValue({ refreshSession, sessionSource: 'online' }))

    await waitFor(() =>
      expect(hook.result.current.controller.pendingDraft?.files[0]?.fileName)
        .toBe('screenshot.png'),
    )
    expect(readPendingShareDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-123',
        host: window.location.host,
        tenantSlug: 'buhfirma',
        userId: 7,
      }),
    )
  })

  it('deletes an opaque mismatched draft without exposing its file names', async () => {
    const hook = renderShareTargetHook()

    await waitFor(() =>
      expect(deletePendingShareDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: 'draft-123',
          host: window.location.host,
          tenantSlug: 'buhfirma',
          userId: 7,
        }),
      ),
    )
    expect(hook.result.current.controller.pendingDraft).toBeNull()
    expect(hook.result.current.controller.status).toBe('error')
  })

  it('keeps the original record when every shared file is rejected', async () => {
    const addFiles = vi.fn((): AttachmentAdmissionResult => ({
      accepted: [],
      items: [],
      rejections: [
        {
          code: 'attachment_duplicate',
          fileName: 'screenshot.png',
          message: 'Файл «screenshot.png» уже добавлен.',
        },
      ],
    }))

    readPendingShareDraftMock.mockResolvedValue(createDraft())
    const hook = renderShareTargetHook({ addFiles })

    await waitFor(() =>
      expect(hook.result.current.controller.status).toBe(
        'choosing-destination',
      ),
    )
    await act(async () => {
      await hook.result.current.controller.confirmDestination(privateThread.id)
    })
    await waitFor(() =>
      expect(hook.result.current.controller.errorMessage).toContain(
        'уже добавлен',
      ),
    )

    expect(replacePendingShareDraftFilesMock).not.toHaveBeenCalled()
    expect(hook.result.current.search).toContain('shareDraft=draft-123')
    expect(hook.result.current.controller.pendingDraft).not.toBeNull()
  })

  it('imports only an accepted subset and removes only share query parameters', async () => {
    const draft = createDraft([
      {
        contents: 'first',
        fileName: 'first.png',
        mimeType: 'image/png',
      },
      {
        contents: 'second',
        fileName: 'second.jpg',
        mimeType: 'image/jpeg',
      },
    ])
    const addFiles = vi.fn(
      (files: readonly File[]): AttachmentAdmissionResult => ({
        accepted: [
          {
            file: files[0]!,
            id: 'accepted-first',
            source: 'share-target',
          },
        ],
        items: [
          {
            file: files[0]!,
            id: 'accepted-first',
            source: 'share-target',
          },
        ],
        rejections: [
          {
            code: 'attachment_count_exceeded',
            fileName: files[1]!.name,
            message: 'Можно добавить не больше 5 файлов.',
          },
        ],
      }),
    )

    readPendingShareDraftMock.mockResolvedValue(draft)
    const hook = renderShareTargetHook({
      addFiles,
      entry: '/app/chat?shareDraft=draft-123&panel=media',
    })

    await waitFor(() =>
      expect(hook.result.current.controller.status).toBe(
        'choosing-destination',
      ),
    )
    await act(async () => {
      await hook.result.current.controller.confirmDestination(privateThread.id)
    })
    await waitFor(() =>
      expect(hook.result.current.controller.status).toBe('imported'),
    )

    expect(addFiles).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          name: 'first.png',
          type: 'image/png',
        }),
        expect.objectContaining({
          name: 'second.jpg',
          type: 'image/jpeg',
        }),
      ],
      'share-target',
    )
    expect(replacePendingShareDraftFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-123',
        files: [expect.objectContaining({ name: 'first.png' })],
      }),
    )
    expect(hook.result.current.search).toContain('panel=media')
    expect(hook.result.current.search).toContain('threadId=private%3Ame')
    expect(hook.result.current.search).not.toContain('shareDraft')
  })

  it('resolves queued replace and delete scopes from the current live user', async () => {
    readPendingShareDraftMock.mockResolvedValue(createDraft())
    const hook = renderShareTargetHook()

    await waitFor(() =>
      expect(hook.result.current.controller.status).toBe(
        'choosing-destination',
      ),
    )
    await act(async () => {
      await hook.result.current.controller.confirmDestination(privateThread.id)
    })
    await waitFor(() =>
      expect(hook.result.current.controller.status).toBe('imported'),
    )
    replacePendingShareDraftFilesMock.mockClear()

    const replacement = {
      file: new File(['replacement'], 'replacement.png', {
        type: 'image/png',
      }),
      id: 'replacement',
      source: 'share-target' as const,
    }
    const replacePromise =
      hook.result.current.controller.syncRemainingShareDraftItems([
        replacement,
      ])

    hook.setAuth(createAuthValue({ userId: 8 }))
    await replacePromise

    expect(replacePendingShareDraftFilesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draftId: 'draft-123',
        host: window.location.host,
        tenantSlug: 'buhfirma',
        userId: 8,
      }),
    )

    const deletePromise =
      hook.result.current.controller.afterCanonicalAttachmentBatchSend([
        replacement,
      ])

    hook.setAuth(createAuthValue({ userId: 9 }))
    await deletePromise

    expect(deletePendingShareDraftMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draftId: 'draft-123',
        host: window.location.host,
        tenantSlug: 'buhfirma',
        userId: 9,
      }),
    )
  })
})
