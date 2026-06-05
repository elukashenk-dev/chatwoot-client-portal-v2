# Profile Read-Only Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only customer profile page with avatar upload synced to the linked Chatwoot contact through the portal backend.

**Architecture:** Add a small backend `profile` module that resolves the current authenticated tenant/user/contact, reads phone/avatar state from Chatwoot, proxies avatar bytes through portal `/api`, and uploads avatar files to Chatwoot Application API. Add a frontend `profile` feature route using the existing `ChatFullScreenPanel`, opened from the grouped right chat menu.

**Tech Stack:** Fastify, Drizzle, Chatwoot Application API, React 19, React Router, Vitest, Testing Library, TypeScript, Tailwind.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-06-05-profile-readonly-avatar-design.md`
- Project rules: `AGENTS.md`
- Current app wiring: `backend/src/app.ts`, `frontend/src/app/AppRoutes.tsx`

## File Structure

Backend:

- Create `backend/src/modules/profile/types.ts`
  - Owns public profile response types and avatar upload type.
- Create `backend/src/modules/profile/avatarValidation.ts`
  - Owns avatar file validation: jpeg/png/gif, non-empty, max 15 MB.
- Create `backend/src/modules/profile/service.ts`
  - Resolves linked contact, returns public profile data, updates Chatwoot avatar, proxies current avatar.
- Create `backend/src/modules/profile/routes.ts`
  - Registers `GET /api/profile`, `GET /api/profile/avatar`, `POST /api/profile/avatar`.
- Create tests:
  - `backend/src/modules/profile/avatarValidation.test.ts`
  - `backend/src/modules/profile/service.test.ts`
  - `backend/src/modules/profile/routes.test.ts`
- Modify `backend/src/integrations/chatwoot/client.ts`
  - Add `updateContactAvatar(contactId, avatar)` method.
- Modify `backend/src/integrations/chatwoot/client.test.ts`
  - Cover multipart contact avatar update.
- Modify `backend/src/app.ts`
  - Register profile service/routes and set multipart route limits.

Frontend:

- Create `frontend/src/features/profile/api/profileClient.ts`
  - Owns `/profile` API calls and upload request.
- Create `frontend/src/features/profile/pages/UserProfilePage.tsx`
  - Renders compact profile card and handles avatar upload.
- Create `frontend/src/features/profile/pages/UserProfilePage.test.tsx`
  - Covers read-only fields, upload labels, validation, success and failure.
- Modify `frontend/src/app/routePaths.ts`
  - Add `routePaths.app.profile`.
- Modify `frontend/src/app/AppRoutes.tsx`
  - Lazy-load `/app/profile`.
- Modify `frontend/src/features/chat/components/ChatHeader.tsx`
  - Add grouped right menu sections and `Профиль` menu item.
- Modify `frontend/src/features/chat/pages/ChatPage.test.tsx`
  - Cover right menu grouping and profile navigation.
- Modify `frontend/src/shared/ui/icons.tsx` if a reusable `UserIcon` is needed.

Docs:

- Update `docs/roadmap/work-log.md` only after implementation, review and tests are complete because this changes stable product baseline.

## Task 1: Backend Avatar Validation

**Files:**

- Create: `backend/src/modules/profile/avatarValidation.ts`
- Test: `backend/src/modules/profile/avatarValidation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add tests:

```ts
import { describe, expect, it } from 'vitest'

import {
  PROFILE_AVATAR_MAX_BYTES,
  normalizeProfileAvatarUpload,
} from './avatarValidation.js'

describe('profile avatar validation', () => {
  it('accepts a non-empty PNG avatar under the Chatwoot limit', () => {
    const avatar = normalizeProfileAvatarUpload({
      data: Buffer.from('png-bytes'),
      fileName: 'avatar.png',
      mimeType: 'image/png',
      size: 9,
    })

    expect(avatar).toMatchObject({
      fileName: 'avatar.png',
      mimeType: 'image/png',
      size: 9,
    })
    expect(Buffer.from(avatar.data).toString('utf8')).toBe('png-bytes')
  })

  it('rejects empty avatars', () => {
    expect(() =>
      normalizeProfileAvatarUpload({
        data: Buffer.alloc(0),
        fileName: 'avatar.png',
        mimeType: 'image/png',
        size: 0,
      }),
    ).toThrow('Файл пустой. Выберите другое изображение.')
  })

  it('rejects avatars over 15 MB', () => {
    expect(() =>
      normalizeProfileAvatarUpload({
        data: Buffer.alloc(PROFILE_AVATAR_MAX_BYTES + 1),
        fileName: 'avatar.png',
        mimeType: 'image/png',
        size: PROFILE_AVATAR_MAX_BYTES + 1,
      }),
    ).toThrow('Файл должен быть не больше 15 МБ.')
  })

  it('rejects unsupported avatar mime types', () => {
    expect(() =>
      normalizeProfileAvatarUpload({
        data: Buffer.from('svg'),
        fileName: 'avatar.svg',
        mimeType: 'image/svg+xml',
        size: 3,
      }),
    ).toThrow('Можно загрузить JPEG, PNG или GIF.')
  })
})
```

- [ ] **Step 2: Run validation test to verify RED**

Run:

```bash
pnpm --dir backend test src/modules/profile/avatarValidation.test.ts
```

Expected: fail because `avatarValidation.ts` does not exist.

- [ ] **Step 3: Implement validation**

Create `avatarValidation.ts` with:

```ts
import { ApiError } from '../../lib/errors.js'
import type { ProfileAvatarUpload } from './types.js'

export const PROFILE_AVATAR_MAX_BYTES = 15 * 1024 * 1024

const PROFILE_AVATAR_ALLOWED_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
])

export function normalizeProfileAvatarUpload(
  avatar: ProfileAvatarUpload,
): ProfileAvatarUpload {
  const fileName = avatar.fileName.trim() || 'avatar'
  const mimeType = avatar.mimeType.trim().toLowerCase()
  const data = Buffer.from(avatar.data)
  const size = data.byteLength

  if (size <= 0) {
    throw new ApiError(
      400,
      'profile_avatar_empty',
      'Файл пустой. Выберите другое изображение.',
    )
  }

  if (size > PROFILE_AVATAR_MAX_BYTES) {
    throw new ApiError(
      413,
      'profile_avatar_too_large',
      'Файл должен быть не больше 15 МБ.',
    )
  }

  if (!PROFILE_AVATAR_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ApiError(
      415,
      'profile_avatar_type_not_allowed',
      'Можно загрузить JPEG, PNG или GIF.',
    )
  }

  return {
    data,
    fileName,
    mimeType,
    size,
  }
}
```

Create `types.ts` with:

```ts
export type PublicUserProfile = {
  avatarUrl: string | null
  email: string
  fullName: string | null
  phoneNumber: string | null
  reason?: 'contact_unavailable'
  result: 'ready' | 'unavailable'
}

export type ProfileAvatarUpload = {
  data: Buffer
  fileName: string
  mimeType: string
  size: number
}
```

- [ ] **Step 4: Run validation test to verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/profile/avatarValidation.test.ts
```

Expected: PASS.

## Task 2: Chatwoot Contact Avatar Update Client

**Files:**

- Modify: `backend/src/integrations/chatwoot/client.ts`
- Test: `backend/src/integrations/chatwoot/client.test.ts`

- [ ] **Step 1: Write failing Chatwoot client test**

Add a test near existing attachment multipart tests:

```ts
it('updates a contact avatar with multipart form data', async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ payload: { id: 44 } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
  )
  const client = createChatwootClientFactory({ fetchFn: fetchMock }).forTenant({
    accountId: 3,
    apiAccessToken: 'tenant-token',
    baseUrl: 'http://127.0.0.1:3000',
    portalInboxId: 7,
  })

  await client.updateContactAvatar(44, {
    data: Buffer.from('avatar-bytes'),
    fileName: 'avatar.png',
    mimeType: 'image/png',
  })

  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, _message, init] = fetchMock.mock.calls[0]
  expect(String(url)).toBe(
    'http://127.0.0.1:3000/api/v1/accounts/3/contacts/44',
  )
  expect(init?.method).toBe('PUT')
  expect(init?.headers).toMatchObject({
    Accept: 'application/json',
    api_access_token: 'tenant-token',
  })
  expect(init?.body).toBeInstanceOf(FormData)
  const formData = init?.body as FormData
  expect(formData.get('avatar')).toBeInstanceOf(File)
  expect((formData.get('avatar') as File).name).toBe('avatar.png')
})
```

- [ ] **Step 2: Run client test to verify RED**

Run:

```bash
pnpm --dir backend test src/integrations/chatwoot/client.test.ts -t "updates a contact avatar"
```

Expected: FAIL because `updateContactAvatar` is not defined.

- [ ] **Step 3: Implement Chatwoot client method**

In `ChatwootAttachmentUpload`, make `size` optional if needed:

```ts
export type ChatwootAttachmentUpload = {
  data: Uint8Array
  fileName: string
  mimeType: string
  size?: number
}
```

Add method inside `createChatwootClient`:

```ts
async function updateContactAvatar(
  contactId: number,
  avatar: ChatwootAttachmentUpload,
) {
  const resolvedConfig = assertConfigured()

  if (!Number.isInteger(contactId) || contactId <= 0) {
    throw new ChatwootClientRequestError(
      'Chatwoot contact avatar update requires a valid contact id.',
    )
  }

  const requestUrl = new URL(
    `/api/v1/accounts/${resolvedConfig.accountId}/contacts/${contactId}`,
    resolvedConfig.baseUrl,
  )
  const formData = new FormData()

  formData.append('avatar', createAttachmentBlob(avatar), avatar.fileName)

  const request = await fetchChatwoot(
    requestUrl,
    'Chatwoot contact avatar update is unavailable.',
    {
      body: formData,
      headers: {
        Accept: 'application/json',
        api_access_token: resolvedConfig.apiAccessToken,
      },
      method: 'PUT',
    },
  )
  const { response } = request

  try {
    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new ChatwootClientRequestError(
        `Chatwoot contact avatar update failed with status ${response.status}.`,
      )
    }

    return true
  } finally {
    request.clearTimeout()
  }
}
```

Return it from the client object:

```ts
updateContactAvatar,
```

- [ ] **Step 4: Run client test to verify GREEN**

Run:

```bash
pnpm --dir backend test src/integrations/chatwoot/client.test.ts -t "updates a contact avatar"
```

Expected: PASS.

## Task 3: Backend Profile Service

**Files:**

- Create: `backend/src/modules/profile/service.ts`
- Test: `backend/src/modules/profile/service.test.ts`

- [ ] **Step 1: Write failing service tests**

Add tests for read profile, upload and avatar proxy:

```ts
import { describe, expect, it, vi } from 'vitest'

import { createProfileService } from './service.js'

function createService(
  overrides: Partial<Parameters<typeof createProfileService>[0]> = {},
) {
  const contactRepository = {
    findContactLinkByUserId: vi.fn().mockResolvedValue({
      chatwootContactId: 44,
      userId: 7,
    }),
  }
  const chatwootClient = {
    findContactById: vi.fn().mockResolvedValue({
      avatarUrl: 'https://chatwoot.example.test/rails/avatar.png',
      email: 'contact@example.test',
      id: 44,
      name: 'Chatwoot Contact',
      phoneNumber: '+79001234567',
    }),
    updateContactAvatar: vi.fn().mockResolvedValue(true),
  }
  const fetchAllowedAttachment = vi.fn().mockResolvedValue(
    new Response('avatar-bytes', {
      headers: { 'content-type': 'image/png' },
      status: 200,
    }),
  )

  return {
    chatwootClient,
    contactRepository,
    fetchAllowedAttachment,
    service: createProfileService({
      chatwootClient,
      contactRepository,
      fetchAllowedAttachment,
      ...overrides,
    }),
  }
}

describe('profile service', () => {
  it('returns portal user fields and Chatwoot phone through a portal avatar URL', async () => {
    const { service } = createService()

    await expect(
      service.getCurrentUserProfile({
        user: { email: 'user@example.test', fullName: 'Portal User', id: 7 },
      }),
    ).resolves.toEqual({
      avatarUrl: '/api/profile/avatar',
      email: 'user@example.test',
      fullName: 'Portal User',
      phoneNumber: '+79001234567',
      result: 'ready',
    })
  })

  it('fails closed when the current user has no linked Chatwoot contact', async () => {
    const { contactRepository, service } = createService()
    contactRepository.findContactLinkByUserId.mockResolvedValueOnce(null)

    await expect(
      service.getCurrentUserProfile({
        user: { email: 'user@example.test', fullName: null, id: 7 },
      }),
    ).resolves.toMatchObject({
      avatarUrl: null,
      reason: 'contact_unavailable',
      result: 'unavailable',
    })
  })

  it('uploads avatar only to the current linked contact', async () => {
    const { chatwootClient, service } = createService()

    await expect(
      service.updateCurrentUserAvatar({
        avatar: {
          data: Buffer.from('avatar'),
          fileName: 'avatar.png',
          mimeType: 'image/png',
          size: 6,
        },
        userId: 7,
      }),
    ).resolves.toEqual({
      avatarUrl: '/api/profile/avatar',
      result: 'updated',
    })
    expect(chatwootClient.updateContactAvatar).toHaveBeenCalledWith(44, {
      data: expect.any(Buffer),
      fileName: 'avatar.png',
      mimeType: 'image/png',
      size: 6,
    })
  })
})
```

- [ ] **Step 2: Run service test to verify RED**

Run:

```bash
pnpm --dir backend test src/modules/profile/service.test.ts
```

Expected: FAIL because `service.ts` does not exist.

- [ ] **Step 3: Implement profile service**

Create service with these exported methods:

```ts
import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import { ApiError } from '../../lib/errors.js'
import type { ChatAttachmentProxyResponse } from '../chat-messages/service.js'
import {
  createAttachmentProxyFetcher,
  createAttachmentProxyUnavailableError,
} from '../chat-messages/attachmentProxy.js'
import type { ChatThreadContactRepository } from '../chat-threads/contactRepository.js'
import type { PublicPortalUser } from '../auth/service.js'
import { normalizeProfileAvatarUpload } from './avatarValidation.js'
import type { ProfileAvatarUpload, PublicUserProfile } from './types.js'

type ProfileServiceOptions = {
  chatwootClient: Pick<ChatwootClient, 'findContactById'> &
    Partial<Pick<ChatwootClient, 'updateContactAvatar'>>
  contactRepository: Pick<
    ChatThreadContactRepository,
    'findContactLinkByUserId'
  >
  fetchAllowedAttachment: ReturnType<typeof createAttachmentProxyFetcher>
}

function buildAvatarUrl(hasAvatar: boolean) {
  return hasAvatar ? '/api/profile/avatar' : null
}

function createProfileUnavailable(user: PublicPortalUser): PublicUserProfile {
  return {
    avatarUrl: null,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: null,
    reason: 'contact_unavailable',
    result: 'unavailable',
  }
}

export function createProfileService({
  chatwootClient,
  contactRepository,
  fetchAllowedAttachment,
}: ProfileServiceOptions) {
  async function resolveLinkedContact(userId: number) {
    const link = await contactRepository.findContactLinkByUserId(userId)

    if (!link) {
      return null
    }

    return chatwootClient.findContactById(link.chatwootContactId)
  }

  return {
    async getCurrentUserProfile({
      user,
    }: {
      user: PublicPortalUser
    }): Promise<PublicUserProfile> {
      try {
        const contact = await resolveLinkedContact(user.id)

        if (!contact) {
          return createProfileUnavailable(user)
        }

        return {
          avatarUrl: buildAvatarUrl(Boolean(contact.avatarUrl?.trim())),
          email: user.email,
          fullName: user.fullName,
          phoneNumber: contact.phoneNumber ?? null,
          result: 'ready',
        }
      } catch (error) {
        if (
          error instanceof ChatwootClientConfigurationError ||
          error instanceof ChatwootClientRequestError
        ) {
          return createProfileUnavailable(user)
        }

        throw error
      }
    },

    async getCurrentUserAvatar({
      userId,
    }: {
      userId: number
    }): Promise<ChatAttachmentProxyResponse> {
      const contact = await resolveLinkedContact(userId)
      const avatarUrl = contact?.avatarUrl?.trim() ?? ''

      if (!avatarUrl) {
        throw new ApiError(
          404,
          'profile_avatar_unavailable',
          'Файл недоступен.',
        )
      }

      const headers = new Headers()
      headers.set('accept-encoding', 'identity')

      const response = await fetchAllowedAttachment({
        headers,
        initialUrl: avatarUrl,
      })

      if (!response.ok) {
        await response.body?.cancel()
        throw createAttachmentProxyUnavailableError()
      }

      return {
        body: response.body,
        headers: response.headers,
        status: response.status,
      }
    },

    async updateCurrentUserAvatar({
      avatar,
      userId,
    }: {
      avatar: ProfileAvatarUpload
      userId: number
    }) {
      const normalizedAvatar = normalizeProfileAvatarUpload(avatar)
      const link = await contactRepository.findContactLinkByUserId(userId)

      if (!link || !chatwootClient.updateContactAvatar) {
        throw new ApiError(
          503,
          'profile_unavailable',
          'Профиль временно недоступен. Обратитесь в поддержку.',
        )
      }

      const result = await chatwootClient.updateContactAvatar(
        link.chatwootContactId,
        normalizedAvatar,
      )

      if (!result) {
        throw new ApiError(
          503,
          'profile_avatar_update_unavailable',
          'Не удалось обновить аватар. Попробуйте позже.',
        )
      }

      return {
        avatarUrl: '/api/profile/avatar',
        result: 'updated' as const,
      }
    },
  }
}

export type ProfileService = ReturnType<typeof createProfileService>
```

Also extend `ChatwootContact` in `contactLookup.ts` with:

```ts
phoneNumber?: string | null
```

and map:

```ts
phoneNumber: readString(payload.phone_number),
```

- [ ] **Step 4: Run service test to verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/profile/service.test.ts
```

Expected: PASS.

## Task 4: Backend Profile Routes And App Wiring

**Files:**

- Create: `backend/src/modules/profile/routes.ts`
- Test: `backend/src/modules/profile/routes.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write failing route tests**

Add route tests covering unauthenticated request, profile read, upload validation and service delegation. Use `createMultipartAttachmentPayload` as a model but create profile-specific multipart with field `avatar`.

Expected tests:

```ts
it('returns current user profile through the profile service', async () => {
  const response = await app.inject({
    headers: { cookie: createAuthorizedCookie(app) },
    method: 'GET',
    url: '/api/profile',
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({
    avatarUrl: '/api/profile/avatar',
    email: 'user@example.test',
    fullName: 'Portal User',
    phoneNumber: '+79001234567',
    result: 'ready',
  })
})

it('uploads avatar through the profile service', async () => {
  const multipart = createMultipartProfileAvatarPayload({
    fileContent: Buffer.from('avatar'),
    fileName: 'avatar.png',
    mimeType: 'image/png',
  })

  const response = await app.inject({
    headers: {
      'content-type': multipart.contentType,
      cookie: createAuthorizedCookie(app),
      origin: testEnv.APP_ORIGIN,
    },
    method: 'POST',
    payload: multipart.payload,
    url: '/api/profile/avatar',
  })

  expect(response.statusCode).toBe(200)
  expect(profileService.updateCurrentUserAvatar).toHaveBeenCalledWith({
    avatar: expect.objectContaining({
      fileName: 'avatar.png',
      mimeType: 'image/png',
      size: 6,
    }),
    userId: 7,
  })
})
```

- [ ] **Step 2: Run route tests to verify RED**

Run:

```bash
pnpm --dir backend test src/modules/profile/routes.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement routes**

Create `routes.ts` with:

- `registerProfileRoutes(app, { authService, createProfileService, env })`;
- `GET /api/profile`;
- `GET /api/profile/avatar`;
- `POST /api/profile/avatar`;
- `assertAllowedTenantOrigin(request)` for avatar upload;
- multipart parser accepting one file field `avatar`;
- multipart error mapping:
  - too large -> `profile_avatar_too_large`;
  - wrong content type -> `multipart_required`;
  - extra files/parts -> `invalid_profile_avatar_request`.

Use existing `copyAttachmentProxyHeaders` and `ATTACHMENT_PROXY_CACHE_CONTROL` for avatar proxy response.

Modify `app.ts`:

```ts
import { registerProfileRoutes } from './modules/profile/routes.js'
import { createProfileService } from './modules/profile/service.js'
```

Add factory:

```ts
const createProfileServiceForRequest = (request: FastifyRequest) => {
  const tenant = requireTenantContext(request)

  return createProfileService({
    chatwootClient: createChatwootClientForRequest(request),
    contactRepository: createChatThreadContactRepository(database.db, {
      tenantId: tenant.id,
    }),
    fetchAllowedAttachment: createAttachmentProxyFetcher({
      allowedOrigins: getAttachmentProxyAllowedOrigins({
        env,
        tenantChatwootBaseUrl: tenant.chatwoot.baseUrl,
      }),
      allowPrivateNetwork: env.NODE_ENV !== 'production',
      fetchFn: fetch,
      requestTimeoutMs: env.CHATWOOT_REQUEST_TIMEOUT_MS,
    }),
  })
}
```

Register route after auth routes:

```ts
registerProfileRoutes(app, {
  authService,
  createProfileService: createProfileServiceForRequest,
  env,
})
```

- [ ] **Step 4: Run route tests to verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/profile/routes.test.ts
```

Expected: PASS.

## Task 5: Frontend Profile API And Page

**Files:**

- Create: `frontend/src/features/profile/api/profileClient.ts`
- Create: `frontend/src/features/profile/pages/UserProfilePage.tsx`
- Test: `frontend/src/features/profile/pages/UserProfilePage.test.tsx`

- [ ] **Step 1: Write failing frontend page tests**

Add tests:

```tsx
it('renders read-only profile fields and upload label for a missing avatar', async () => {
  fetchMock.mockResolvedValueOnce(
    createJsonResponse({
      avatarUrl: null,
      email: 'name@group.ru',
      fullName: 'Portal User',
      phoneNumber: null,
      result: 'ready',
    }),
  )

  renderPage()

  expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeVisible()
  expect(screen.getByText('Portal User')).toBeVisible()
  expect(screen.getByText('name@group.ru')).toBeVisible()
  expect(screen.getByText('Не указан')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Загрузить аватар' })).toBeVisible()
})

it('shows replace label and updates avatar after successful upload', async () => {
  const user = userEvent.setup()
  fetchMock
    .mockResolvedValueOnce(
      createJsonResponse({
        avatarUrl: '/api/profile/avatar',
        email: 'name@group.ru',
        fullName: 'Portal User',
        phoneNumber: '+79001234567',
        result: 'ready',
      }),
    )
    .mockResolvedValueOnce(
      createJsonResponse({
        avatarUrl: '/api/profile/avatar?version=updated',
        result: 'updated',
      }),
    )

  renderPage()
  const input = await screen.findByLabelText('Заменить аватар')

  await user.upload(
    input,
    new File(['avatar'], 'avatar.png', { type: 'image/png' }),
  )

  await waitFor(() => {
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/profile/avatar',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
  })
})
```

- [ ] **Step 2: Run page test to verify RED**

Run:

```bash
pnpm --dir frontend test src/features/profile/pages/UserProfilePage.test.tsx
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement profile client**

Create `profileClient.ts`:

```ts
import { ApiClientError } from '../../auth/api/authClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type UserProfile = {
  avatarUrl: string | null
  email: string
  fullName: string | null
  phoneNumber: string | null
  reason?: 'contact_unavailable'
  result: 'ready' | 'unavailable'
}

export type ProfileAvatarUpdateResponse = {
  avatarUrl: string
  result: 'updated'
}

async function parseJsonBody(response: Response) {
  const contentType = response.headers.get('content-type')
  return contentType?.includes('application/json') ? response.json() : null
}

export async function getUserProfile() {
  const response = await fetch(`${API_BASE_URL}/profile`, {
    credentials: 'include',
    method: 'GET',
  })
  const payload = await parseJsonBody(response)

  if (!response.ok) {
    throw new ApiClientError({
      message: 'Не удалось загрузить профиль.',
      statusCode: response.status,
    })
  }

  return payload as UserProfile
}

export async function uploadUserProfileAvatar(file: File) {
  const formData = new FormData()
  formData.append('avatar', file)

  const response = await fetch(`${API_BASE_URL}/profile/avatar`, {
    body: formData,
    credentials: 'include',
    method: 'POST',
  })
  const payload = await parseJsonBody(response)

  if (!response.ok) {
    const errorPayload = payload as
      | { error?: { message?: string } }
      | null
      | undefined

    throw new ApiClientError({
      message:
        errorPayload?.error?.message ??
        'Не удалось обновить аватар. Попробуйте позже.',
      statusCode: response.status,
    })
  }

  return payload as ProfileAvatarUpdateResponse
}
```

- [ ] **Step 4: Implement profile page**

Create `UserProfilePage.tsx`:

- use `ChatFullScreenPanel`;
- call `getUserProfile` on mount;
- validate selected file before upload:
  - size `0`;
  - size over `15 * 1024 * 1024`;
  - MIME not `image/jpeg|image/png|image/gif` if present;
- render file input with accessible label equal to visible action label;
- update local `profile.avatarUrl` with returned avatar URL on success;
- show `InlineAlert` on upload/load errors.

- [ ] **Step 5: Run page tests to verify GREEN**

Run:

```bash
pnpm --dir frontend test src/features/profile/pages/UserProfilePage.test.tsx
```

Expected: PASS.

## Task 6: Frontend Route And Right Menu Grouping

**Files:**

- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Test: `frontend/src/features/chat/pages/ChatPage.test.tsx`

- [ ] **Step 1: Write failing navigation test**

Add/modify test:

```tsx
it('opens profile from the grouped chat menu', async () => {
  const user = userEvent.setup()
  mockInitialReadyChatResponses()

  renderChatRoute()

  await user.click(
    await screen.findByRole(
      'button',
      { name: 'Открыть меню чата' },
      CHAT_PAGE_LOAD_TIMEOUT,
    ),
  )

  expect(screen.getByText('Аккаунт')).toBeInTheDocument()
  expect(screen.getByText('Чат')).toBeInTheDocument()
  await user.click(screen.getByRole('menuitem', { name: 'Профиль' }))

  await waitFor(() => {
    expect(window.location.pathname).toBe('/app/profile')
  })
})
```

- [ ] **Step 2: Run navigation test to verify RED**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.test.tsx -t "opens profile"
```

Expected: FAIL because route/menu item does not exist.

- [ ] **Step 3: Implement route**

In `routePaths.ts` add:

```ts
profile: '/app/profile',
```

In `AppRoutes.tsx` lazy-load:

```ts
const UserProfilePage = lazyRouteComponent(() =>
  import('../features/profile/pages/UserProfilePage').then(
    (module) => module.UserProfilePage,
  ),
)
```

and add:

```tsx
<Route
  path="profile"
  element={
    <LazyRoute>
      <UserProfilePage />
    </LazyRoute>
  }
/>
```

- [ ] **Step 4: Implement grouped right menu**

In `ChatHeader.tsx`:

- import `UserPlusIcon` or create/import `UserIcon`;
- add account section label before profile item;
- add chat section label before chat-specific items;
- navigate profile with `navigate(routePaths.app.profile)`.

Keep current keyboard/focus behavior unchanged.

- [ ] **Step 5: Run navigation test to verify GREEN**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.test.tsx -t "opens profile"
```

Expected: PASS.

## Task 7: Targeted Integration And Regression Checks

**Files:**

- Modify only files needed by fixes from test failures.

- [ ] **Step 1: Run targeted backend profile/client tests**

Run:

```bash
pnpm --dir backend test \
  src/modules/profile/avatarValidation.test.ts \
  src/modules/profile/service.test.ts \
  src/modules/profile/routes.test.ts \
  src/integrations/chatwoot/client.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend profile/chat menu tests**

Run:

```bash
pnpm --dir frontend test \
  src/features/profile/pages/UserProfilePage.test.tsx \
  src/features/chat/pages/ChatPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run type/build checks**

Run:

```bash
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Expected: PASS or record exact blocker.

- [ ] **Step 4: Run root hygiene checks**

Run:

```bash
pnpm lint
git diff --check
```

Expected: PASS.

## Task 8: Review, Work Log, And Checkpoint

**Files:**

- Modify: `docs/roadmap/work-log.md` only after implementation and checks pass.

- [ ] **Step 1: Code review the changed area**

Review for:

- no browser Chatwoot URLs/tokens;
- profile routes require auth and tenant;
- avatar upload updates only linked current-user contact;
- no name/email/phone editing;
- no avatar deletion;
- menu grouping does not break keyboard/escape behavior.

- [ ] **Step 2: Fix review findings**

If review finds in-scope bugs, write failing targeted tests first, then fix.

- [ ] **Step 3: Update work-log baseline**

Add one concise completed baseline bullet under UI/Product area after tests pass:

```md
- Реализован read-only slice `Профиль`: пункт добавлен в правое меню чата,
  страница показывает имя, email и телефон, а avatar upload синхронизируется
  через portal backend с linked Chatwoot contact без browser Chatwoot authority.
```

Update the final `Recommended Next Step` block to the next realistic follow-up.

- [ ] **Step 4: Final verification**

Run:

```bash
pnpm --dir backend test src/modules/profile
pnpm --dir frontend test src/features/profile
git status --short --branch
```

Expected: tests PASS, only in-scope files changed.

- [ ] **Step 5: Commit checkpoint**

Only after closure flow:

```bash
git add backend frontend docs/roadmap/work-log.md
git commit -m "feat: add read-only profile avatar page"
```

## Self-Review

- Spec coverage:
  - right menu grouping: Task 6;
  - compact profile page: Task 5;
  - read-only name/email/phone: Tasks 3 and 5;
  - avatar upload without deletion: Tasks 1-5;
  - backend-only Chatwoot sync: Tasks 2-4;
  - no browser Chatwoot authority: Tasks 3, 4, 8;
  - tests and validation: Tasks 7-8.
- Placeholder scan:
  - This plan avoids TBD/TODO placeholders.
- Type consistency:
  - `ProfileAvatarUpload`, `PublicUserProfile`, and `updateContactAvatar` are introduced before later usage.
