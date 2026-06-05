# Chat Group Member Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show portal user avatars in group chat participant lists and group message bubbles without exposing direct Chatwoot avatar URLs to the browser.

**Architecture:** Keep Chatwoot as the avatar source of truth, but expose only portal-owned `/api/...` avatar URLs. Reuse the existing chat avatar proxy surface, add a thread-scoped participant avatar proxy, and map group message avatars only when the message author is known through the portal send ledger. Do not infer identity from display names or Markdown author prefixes.

**Tech Stack:** Fastify, Zod, Drizzle, Chatwoot Application API, React 19, React Router, Vitest, Testing Library, Playwright, TypeScript, Tailwind.

---

## Source Documents And Baseline

- Project rules: `AGENTS.md`
- Architecture baseline: `docs/architecture/overview.md`
- Current roadmap: `docs/roadmap/implementation-plan.md`
- Profile avatar source slice: `docs/superpowers/specs/2026-06-05-profile-readonly-avatar-design.md`
- Profile implementation plan: `docs/superpowers/plans/2026-06-05-profile-readonly-avatar.md`
- Current branch for this plan: `docs/group-member-avatars-plan`
- Required implementation branch after this docs-only plan: `feature/phase-chat-group-member-avatars`

Profile avatar baseline was fast-forwarded into local `main` before this plan:

```text
main -> a661320 feat: add readonly profile avatar flow
```

The implementation branch must start from this updated `main`, not from the old remote `origin/main`, unless `origin/main` has first been updated to include `a661320`.

## Product Scope

Implement approach 2:

- show avatars in the group `Участники портала` list on `Информация о чате`;
- show avatars next to `group_member` message bubbles in the transcript;
- show a group member avatar in messages only when the author is known through `portal_chat_message_sends`;
- keep initials fallback when there is no avatar, the proxy fails, or the group member author is unknown;
- never expose raw Chatwoot URLs, Chatwoot contact IDs, Chatwoot account IDs, or Chatwoot authority to the browser.

Non-goals:

- no avatar delete flow;
- no profile fields beyond the existing profile slice;
- no direct browser fetches to Chatwoot or ActiveStorage;
- no identity matching by author name, email, contact name, or Markdown prefix;
- no database avatar cache in this slice.

## File Structure

Backend:

- Modify `backend/src/modules/chat-threads/types.ts`
  - Add `avatarUrl` to `PublicChatThreadInfoParticipant`.
  - Add `buildPortalGroupParticipantAvatarUrl(threadId, participantUserId)`.
- Modify `backend/src/modules/chat-threads/info.ts`
  - Carry participant `avatarUrl` through dedupe/sort normalization.
- Modify `backend/src/modules/chat-threads/service.ts`
  - Build participant avatar URLs when the linked Chatwoot contact has an avatar.
- Modify `backend/src/modules/chat-threads/contactRepository.ts`
  - Add a tenant-scoped active-user contact-link lookup for one participant user.
- Modify `backend/src/modules/chat-messages/messageMapping.ts`
  - Assign `authorAvatarUrl` for ledger-known `group_member` messages.
- Modify `backend/src/modules/chat-messages/avatarProxyService.ts`
  - Add `getCurrentUserGroupParticipantAvatar`.
  - Validate current user access, group thread type, active participant link, participant group membership, and avatar presence before proxying bytes.
- Modify `backend/src/modules/chat-messages/avatarProxyRoutes.ts`
  - Add `GET /api/chat/threads/:threadId/participants/:participantUserId/avatar`.
- Modify `backend/src/modules/chat-messages/service.ts`
  - Pass the new contact repository dependency into avatar proxy methods.
- Modify `backend/src/app.ts`
  - Provide `contactRepository` to `createChatMessagesService`.
- Update backend tests:
  - `backend/src/modules/chat-threads/info.test.ts`
  - `backend/src/modules/chat-threads/service.info.test.ts`
  - `backend/src/modules/chat-threads/contactRepository.test.ts`
  - `backend/src/modules/chat-messages/messageMapping.test.ts`
  - `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`
  - `backend/src/modules/chat-messages/routes.attachment-proxy.test.ts`
  - existing chat message service test-support files that construct `createChatMessagesService`.

Frontend:

- Modify `frontend/src/features/chat/types.ts`
  - Add `avatarUrl?: string | null` to `ChatThreadInfoParticipant`.
- Modify `frontend/src/features/chat/components/ChatInfoPage.tsx`
  - Render participant avatars with `ChatAvatar`.
- Modify `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
  - Generalize the incoming author avatar slot from agent-only to agent-or-group-member.
  - Use Russian accessibility labels for `Агент` and `Участник`.
- Update frontend tests:
  - `frontend/src/features/chat/components/ChatInfoPage.test.tsx`
  - `frontend/src/features/chat/components/ChatTranscript.test.tsx`

Runtime/browser:

- Add or extend a Playwright smoke that verifies group participant/avatar rendering if the local Chatwoot test harness has group contacts available.
- If the harness cannot reliably seed group member avatars, record the blocker in the final response and keep backend/frontend automated tests as the required safety net.

Docs:

- Update `docs/roadmap/work-log.md` only after implementation, review, fixes, targeted checks, and required tests are complete, because the slice changes the stable chat UI/runtime baseline.

## Task 1: Backend Participant Avatar Contract

**Files:**

- Modify: `backend/src/modules/chat-threads/types.ts`
- Modify: `backend/src/modules/chat-threads/info.ts`
- Test: `backend/src/modules/chat-threads/info.test.ts`

- [ ] **Step 1: Write failing info normalization test**

Add a test case to `backend/src/modules/chat-threads/info.test.ts` near existing participant normalization tests:

```ts
it('keeps portal-owned participant avatar URLs while deduping users', () => {
  const participants = normalizeChatInfoParticipantRows([
    {
      avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
      displayName: 'Мария Соколова',
      email: 'maria@example.test',
      isCurrentUser: false,
      userId: 8,
    },
    {
      avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
      displayName: 'Мария Соколова',
      email: 'maria@example.test',
      isCurrentUser: false,
      userId: 8,
    },
  ])

  expect(participants).toEqual([
    {
      avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
      displayName: 'Мария Соколова',
      id: 'portal-user:8',
      isCurrentUser: false,
    },
  ])
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --dir backend test src/modules/chat-threads/info.test.ts
```

Expected: fail because `SafeChatInfoParticipantRow` and `PublicChatThreadInfoParticipant` do not accept `avatarUrl`.

- [ ] **Step 3: Add participant avatar type and helper**

In `backend/src/modules/chat-threads/types.ts`, extend the participant type and add the helper next to `buildPortalThreadAvatarUrl`:

```ts
export type PublicChatThreadInfoParticipant = {
  avatarUrl?: string | null
  displayName: string
  id: `portal-user:${number}`
  isCurrentUser: boolean
}

export function buildPortalGroupParticipantAvatarUrl({
  participantUserId,
  threadId,
}: {
  participantUserId: number
  threadId: string
}) {
  return `/api/chat/threads/${encodeURIComponent(
    threadId,
  )}/participants/${participantUserId}/avatar`
}
```

In `backend/src/modules/chat-threads/info.ts`, add `avatarUrl` to `SafeChatInfoParticipantRow`:

```ts
export type SafeChatInfoParticipantRow = {
  avatarUrl: string | null
  displayName: string | null
  email: string
  isCurrentUser: boolean
  userId: number
}
```

When setting the participant in `normalizeChatInfoParticipantRows`, include:

```ts
avatarUrl: row.avatarUrl,
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/chat-threads/info.test.ts
```

Expected: PASS.

## Task 2: Backend Group Info Participant Avatar URLs

**Files:**

- Modify: `backend/src/modules/chat-threads/service.ts`
- Test: `backend/src/modules/chat-threads/service.info.test.ts`

- [ ] **Step 1: Write failing group info service test**

Update the test `returns group participants only for active portal users with current group access` in `backend/src/modules/chat-threads/service.info.test.ts` so contacts `44` and `55` include avatar state:

```ts
avatarUrl: 'https://chatwoot.test/rails/active_storage/ivan.png',
```

for contact `44`, and:

```ts
avatarUrl: 'https://chatwoot.test/rails/active_storage/maria.png',
```

for contact `55`.

Then change the expected participants to:

```ts
participants: [
  {
    avatarUrl: '/api/chat/threads/group%3A154/participants/7/avatar',
    displayName: 'Иван Петров',
    id: 'portal-user:7',
    isCurrentUser: true,
  },
  {
    avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
    displayName: 'Мария Соколова',
    id: 'portal-user:8',
    isCurrentUser: false,
  },
],
```

Add one more participant contact with the same group membership but no `avatarUrl`, and assert its participant row has `avatarUrl: null`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --dir backend test src/modules/chat-threads/service.info.test.ts
```

Expected: fail because `listSafeGroupParticipants` still pushes no participant avatar URL.

- [ ] **Step 3: Build participant avatar URLs only from avatar presence**

In `backend/src/modules/chat-threads/service.ts`, import:

```ts
  buildPortalGroupParticipantAvatarUrl,
```

from `./types.js`.

Inside `listSafeGroupParticipants`, after the group membership check, set:

```ts
const threadId = `group:${groupContactId}`
const avatarUrl = contact.avatarUrl?.trim()
  ? buildPortalGroupParticipantAvatarUrl({
      participantUserId: row.userId,
      threadId,
    })
  : null
```

Then push:

```ts
participantRows.push({
  avatarUrl,
  displayName: row.fullName,
  email: row.email,
  isCurrentUser: row.userId === currentUserId,
  userId: row.userId,
})
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/chat-threads/service.info.test.ts
```

Expected: PASS.

## Task 3: Active Participant Contact Link Lookup

**Files:**

- Modify: `backend/src/modules/chat-threads/contactRepository.ts`
- Test: `backend/src/modules/chat-threads/contactRepository.test.ts`

- [ ] **Step 1: Write failing repository test**

Add this test to `backend/src/modules/chat-threads/contactRepository.test.ts`:

```ts
it('finds an active participant contact link by portal user id in the scoped tenant', async () => {
  const tenant = await seedTestTenant(database.db)
  const otherTenant = await seedTestTenant(database.db, {
    primaryDomain: 'other.localhost',
    slug: 'other',
  })
  const activeUser = await createUser({
    database,
    email: 'ivan@example.test',
    fullName: 'Иван Петров',
    tenantId: tenant.id,
  })
  const inactiveUser = await createUser({
    database,
    email: 'inactive@example.test',
    fullName: 'Отключенный пользователь',
    isActive: false,
    tenantId: tenant.id,
  })
  const otherTenantUser = await createUser({
    database,
    email: 'other@example.test',
    fullName: 'Другой tenant',
    tenantId: otherTenant.id,
  })
  const repository = createChatThreadContactRepository(database.db, {
    tenantId: tenant.id,
  })

  await database.db.insert(portalUserContactLinks).values([
    {
      chatwootContactId: 44,
      tenantId: tenant.id,
      userId: activeUser.id,
    },
    {
      chatwootContactId: 55,
      tenantId: tenant.id,
      userId: inactiveUser.id,
    },
    {
      chatwootContactId: 66,
      tenantId: otherTenant.id,
      userId: otherTenantUser.id,
    },
  ])

  await expect(
    repository.findActivePortalUserContactLinkByUserId(activeUser.id),
  ).resolves.toEqual({
    chatwootContactId: 44,
    userId: activeUser.id,
  })
  await expect(
    repository.findActivePortalUserContactLinkByUserId(inactiveUser.id),
  ).resolves.toBeNull()
  await expect(
    repository.findActivePortalUserContactLinkByUserId(otherTenantUser.id),
  ).resolves.toBeNull()
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --dir backend test src/modules/chat-threads/contactRepository.test.ts
```

Expected: fail because `findActivePortalUserContactLinkByUserId` is missing.

- [ ] **Step 3: Implement active participant lookup**

In `backend/src/modules/chat-threads/contactRepository.ts`, add this method inside the returned repository object:

```ts
async findActivePortalUserContactLinkByUserId(userId: number) {
  const [link] = await db
    .select({
      chatwootContactId: portalUserContactLinks.chatwootContactId,
      userId: portalUserContactLinks.userId,
    })
    .from(portalUserContactLinks)
    .innerJoin(
      portalUsers,
      eq(portalUserContactLinks.userId, portalUsers.id),
    )
    .where(
      and(
        eq(portalUserContactLinks.tenantId, tenantId),
        eq(portalUserContactLinks.userId, userId),
        eq(portalUsers.tenantId, tenantId),
        eq(portalUsers.isActive, true),
      ),
    )
    .limit(1)

  return link ?? null
},
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/chat-threads/contactRepository.test.ts
```

Expected: PASS.

## Task 4: Backend Participant Avatar Proxy

**Files:**

- Modify: `backend/src/modules/chat-messages/avatarProxyService.ts`
- Modify: `backend/src/modules/chat-messages/avatarProxyRoutes.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`
- Test: `backend/src/modules/chat-messages/routes.attachment-proxy.test.ts`
- Test support: `backend/src/modules/chat-messages/service.testSupport.ts` and any other service test file that constructs `createChatMessagesService`.

- [ ] **Step 1: Write failing avatar proxy service tests**

In `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`, add tests for the new service method.

The happy-path test should arrange:

```ts
const context = {
  ...readyGroupContext,
  targetChatwootContactId: 154,
  threadType: 'group',
}
const contactRepository = {
  findActivePortalUserContactLinkByUserId: vi.fn().mockResolvedValue({
    chatwootContactId: 55,
    userId: 8,
  }),
}
const findContactById = vi.fn(async (contactId: number) => {
  if (contactId === 55) {
    return {
      avatarUrl: 'https://chatwoot.test/rails/active_storage/maria.png',
      customAttributes: {
        portal_client_group_contact_ids: '154',
        portal_contact_type: 'person',
        portal_enabled: true,
      },
      email: 'maria@example.test',
      id: 55,
      name: 'Мария Соколова',
      phoneNumber: null,
    }
  }

  return null
})
```

Then assert:

```ts
const result = await service.getCurrentUserGroupParticipantAvatar({
  participantUserId: 8,
  threadId: 'group:154',
  userId: 7,
})

expect(
  contactRepository.findActivePortalUserContactLinkByUserId,
).toHaveBeenCalledWith(8)
expect(findContactById).toHaveBeenCalledWith(55)
expect(attachmentFetchFn).toHaveBeenCalledWith(
  'https://chatwoot.test/rails/active_storage/maria.png',
  expect.any(Object),
)
expect(result.status).toBe(206)
expect(result.headers.get('content-type')).toBe('image/png')
await expect(new Response(result.body).text()).resolves.toBe('proxy-body')
```

Add failure tests:

```ts
await expect(
  service.getCurrentUserGroupParticipantAvatar({
    participantUserId: 8,
    threadId: 'private:me',
    userId: 7,
  }),
).rejects.toMatchObject({ statusCode: 404 })
```

```ts
contactRepository.findActivePortalUserContactLinkByUserId.mockResolvedValueOnce(
  null,
)

await expect(
  service.getCurrentUserGroupParticipantAvatar({
    participantUserId: 8,
    threadId: 'group:154',
    userId: 7,
  }),
).rejects.toMatchObject({ statusCode: 404 })
```

```ts
findContactById.mockResolvedValueOnce({
  avatarUrl: 'https://chatwoot.test/rails/active_storage/maria.png',
  customAttributes: {
    portal_client_group_contact_ids: '',
    portal_contact_type: 'person',
    portal_enabled: true,
  },
  email: 'maria@example.test',
  id: 55,
  name: 'Мария Соколова',
  phoneNumber: null,
})

await expect(
  service.getCurrentUserGroupParticipantAvatar({
    participantUserId: 8,
    threadId: 'group:154',
    userId: 7,
  }),
).rejects.toMatchObject({ statusCode: 404 })
```

```ts
findContactById.mockResolvedValueOnce({
  avatarUrl: null,
  customAttributes: {
    portal_client_group_contact_ids: '154',
    portal_contact_type: 'person',
    portal_enabled: true,
  },
  email: 'maria@example.test',
  id: 55,
  name: 'Мария Соколова',
  phoneNumber: null,
})

await expect(
  service.getCurrentUserGroupParticipantAvatar({
    participantUserId: 8,
    threadId: 'group:154',
    userId: 7,
  }),
).rejects.toMatchObject({ statusCode: 404 })
```

- [ ] **Step 2: Run the focused service test and verify RED**

Run:

```bash
pnpm --dir backend test src/modules/chat-messages/service.attachment-proxy.test.ts
```

Expected: fail because `getCurrentUserGroupParticipantAvatar` and the contact repository dependency do not exist.

- [ ] **Step 3: Add service dependency**

In `backend/src/modules/chat-messages/avatarProxyService.ts`, import:

```ts
import { assertPortalPersonContactEnabled } from '../chat-threads/contactAttributes.js'
import type { ChatThreadContactRepository } from '../chat-threads/contactRepository.js'
```

Extend `ChatAvatarProxyDependencies`:

```ts
contactRepository: Pick<
  ChatThreadContactRepository,
  'findActivePortalUserContactLinkByUserId'
>
```

In `backend/src/modules/chat-messages/service.ts`, extend `CreateChatMessagesServiceOptions` with:

```ts
contactRepository: Pick<
  ChatThreadContactRepository,
  'findActivePortalUserContactLinkByUserId'
>
```

Import `ChatThreadContactRepository` from `../chat-threads/contactRepository.js`.

Pass `contactRepository` into `createChatAvatarProxyMethods`.

In `backend/src/app.ts`, pass:

```ts
contactRepository: createChatThreadContactRepository(database.db, {
  tenantId: tenant.id,
}),
```

to `createChatMessagesService`.

Update all `createChatMessagesService` test stubs with:

```ts
contactRepository: {
  findActivePortalUserContactLinkByUserId: vi.fn().mockResolvedValue(null),
},
```

- [ ] **Step 4: Implement participant avatar proxy method**

In `backend/src/modules/chat-messages/avatarProxyService.ts`, add:

```ts
export async function getCurrentUserGroupParticipantAvatarFromService({
  chatThreadsService,
  chatwootClient,
  contactRepository,
  fetchAllowedAttachment,
  participantUserId,
  threadId,
  userId,
}: ChatAvatarProxyDependencies & {
  participantUserId: number
  threadId: string
  userId: number
}): Promise<ChatAttachmentProxyResponse> {
  const context = await chatThreadsService.getCurrentUserThreadContext({
    threadId,
    userId,
  })

  if (context.result !== 'ready') {
    throw createAvatarThreadContextError(context)
  }

  if (
    context.threadType !== 'group' ||
    context.targetChatwootContactId === null
  ) {
    throw createAvatarUnavailableError()
  }

  try {
    if (!chatwootClient.findContactById) {
      throw createAvatarUnavailableError()
    }

    const link =
      await contactRepository.findActivePortalUserContactLinkByUserId(
        participantUserId,
      )

    if (!link) {
      throw createAvatarUnavailableError()
    }

    const contact = await chatwootClient.findContactById(link.chatwootContactId)
    const avatarUrl = contact?.avatarUrl?.trim() ?? ''

    if (!contact || !avatarUrl) {
      throw createAvatarUnavailableError()
    }

    let attributes: ReturnType<typeof assertPortalPersonContactEnabled>

    try {
      attributes = assertPortalPersonContactEnabled(contact)
    } catch {
      throw createAvatarUnavailableError()
    }

    if (!attributes.groupContactIds.includes(context.targetChatwootContactId)) {
      throw createAvatarUnavailableError()
    }

    return fetchAllowedChatwootAvatar({
      fetchAllowedAttachment,
      initialUrl: avatarUrl,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (
      error instanceof ChatwootClientConfigurationError ||
      error instanceof ChatwootClientRequestError
    ) {
      throw createAvatarUnavailableError(503)
    }

    throw error
  }
}
```

Add the public method in `createChatAvatarProxyMethods`:

```ts
getCurrentUserGroupParticipantAvatar({
  participantUserId,
  threadId,
  userId,
}: {
  participantUserId: number
  threadId: string
  userId: number
}) {
  return getCurrentUserGroupParticipantAvatarFromService({
    ...dependencies,
    participantUserId,
    threadId,
    userId,
  })
},
```

- [ ] **Step 5: Add route and route test**

In `backend/src/modules/chat-messages/avatarProxyRoutes.ts`, add params schema:

```ts
const participantAvatarParamsSchema = z
  .object({
    participantUserId: z.coerce.number().int().positive(),
    threadId: publicThreadIdSchema,
  })
  .strict()
```

Add route before `/api/chat/threads/:threadId/avatar`:

```ts
app.get(
  '/api/chat/threads/:threadId/participants/:participantUserId/avatar',
  async (request, reply) => {
    const user = await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })
    const params = participantAvatarParamsSchema.parse(request.params)
    const avatar = await createChatMessagesService(
      request,
    ).getCurrentUserGroupParticipantAvatar({
      participantUserId: params.participantUserId,
      threadId: params.threadId,
      userId: user.id,
    })

    return sendAvatarProxy({ avatar, reply })
  },
)
```

In `backend/src/modules/chat-messages/routes.attachment-proxy.test.ts`, add a test:

```ts
it('streams group participant avatar content through the message service', async () => {
  const { app, getCurrentUserGroupParticipantAvatar } =
    await buildAttachmentProxyRoutesTestApp()

  try {
    const response = await app.inject({
      headers: {
        cookie: createAuthorizedCookie(app),
      },
      method: 'GET',
      url: '/api/chat/threads/group%3A154/participants/8/avatar',
    })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toBe('participant-avatar-bytes')
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(getCurrentUserGroupParticipantAvatar).toHaveBeenCalledWith({
      participantUserId: 8,
      threadId: 'group:154',
      userId: 7,
    })
  } finally {
    await app.close()
  }
})
```

Update the test app service stub to include:

```ts
getCurrentUserGroupParticipantAvatar: vi.fn().mockResolvedValue({
  body: new Response('participant-avatar-bytes').body,
  headers: new Headers({ 'content-type': 'image/png' }),
  status: 200,
}),
```

- [ ] **Step 6: Run focused backend avatar proxy tests and verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/chat-messages/service.attachment-proxy.test.ts src/modules/chat-messages/routes.attachment-proxy.test.ts
```

Expected: PASS.

## Task 5: Backend Group Message Avatar Mapping

**Files:**

- Modify: `backend/src/modules/chat-messages/messageMapping.ts`
- Test: `backend/src/modules/chat-messages/messageMapping.test.ts`

- [ ] **Step 1: Write failing ledger-only avatar mapping tests**

Add tests to `backend/src/modules/chat-messages/messageMapping.test.ts`:

```ts
it('maps ledger-known group member avatars to portal participant avatar URLs', () => {
  const message = mapPortalMessage(
    {
      attachments: [],
      content: '**Мария Соколова**\nДобрый день',
      contentAttributes: {},
      contentType: 'text',
      createdAt: 1_779_107_173,
      id: 701,
      messageType: 0,
      private: false,
      sender: {
        id: 154,
        name: 'ООО "Ромашка"',
        type: 'contact',
      },
      sourceId: 'portal-send:member-key',
      status: 'sent',
    },
    {
      currentUserId: 7,
      ledgerAuthorsByMessageId: new Map([
        [
          701,
          {
            authorDisplayName: 'Мария Соколова',
            userId: 8,
          },
        ],
      ]),
      threadId: 'group:154',
      threadType: 'group',
    },
  )

  expect(message).toMatchObject({
    authorAvatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
    authorName: 'Мария Соколова',
    authorRole: 'group_member',
    direction: 'incoming',
  })
})

it('does not infer group member avatars from parsed author names', () => {
  const message = mapPortalMessage(
    {
      attachments: [],
      content: '**Мария Соколова**\nДобрый день',
      contentAttributes: {},
      contentType: 'text',
      createdAt: 1_779_107_173,
      id: 702,
      messageType: 0,
      private: false,
      sender: {
        id: 154,
        name: 'ООО "Ромашка"',
        type: 'contact',
      },
      sourceId: null,
      status: 'sent',
    },
    {
      currentUserId: 7,
      ledgerAuthorsByMessageId: new Map(),
      threadId: 'group:154',
      threadType: 'group',
    },
  )

  expect(message).toMatchObject({
    authorAvatarUrl: null,
    authorName: 'Мария Соколова',
    authorRole: 'group_member',
  })
})
```

- [ ] **Step 2: Run focused mapping test and verify RED**

Run:

```bash
pnpm --dir backend test src/modules/chat-messages/messageMapping.test.ts
```

Expected: fail because group members still get `authorAvatarUrl: null`.

- [ ] **Step 3: Implement ledger-only group member avatar URL**

In `backend/src/modules/chat-messages/messageMapping.ts`, import:

```ts
import { buildPortalGroupParticipantAvatarUrl } from '../chat-threads/types.js'
```

Add helper:

```ts
function getGroupMemberAvatarUrl({
  ledgerAuthor,
  threadId,
}: {
  ledgerAuthor: SendLedgerAuthor | undefined
  threadId: string
}) {
  return ledgerAuthor
    ? buildPortalGroupParticipantAvatarUrl({
        participantUserId: ledgerAuthor.userId,
        threadId,
      })
    : null
}
```

In the final `group_member` return block, replace `authorAvatarUrl: null` with:

```ts
authorAvatarUrl: getGroupMemberAvatarUrl({
  ledgerAuthor,
  threadId,
}),
```

Keep the current-user branch unchanged:

```ts
if (ledgerAuthor?.userId === currentUserId) {
  return {
    authorAvatarUrl: null,
    authorName: 'Вы',
    authorRole: 'current_user',
    content: parsedGroupContent.content,
    direction: 'outgoing',
  }
}
```

- [ ] **Step 4: Run focused mapping test and verify GREEN**

Run:

```bash
pnpm --dir backend test src/modules/chat-messages/messageMapping.test.ts
```

Expected: PASS.

## Task 6: Frontend Participant List Avatars

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/components/ChatInfoPage.tsx`
- Test: `frontend/src/features/chat/components/ChatInfoPage.test.tsx`

- [ ] **Step 1: Write failing participant avatar UI test**

In `frontend/src/features/chat/components/ChatInfoPage.test.tsx`, update the group participants fixture:

```ts
participants: [
  {
    avatarUrl: '/api/chat/threads/group%3A154/participants/7/avatar',
    displayName: 'Иван Петров',
    id: 'portal-user:7',
    isCurrentUser: true,
  },
  {
    avatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
    displayName: 'Мария Соколова',
    id: 'portal-user:8',
    isCurrentUser: false,
  },
],
```

Add assertions:

```ts
expect(screen.getByRole('img', { name: 'Иван Петров' })).toHaveAttribute(
  'src',
  '/api/chat/threads/group%3A154/participants/7/avatar',
)
expect(screen.getByRole('img', { name: 'Мария Соколова' })).toHaveAttribute(
  'src',
  '/api/chat/threads/group%3A154/participants/8/avatar',
)
```

- [ ] **Step 2: Run focused frontend test and verify RED**

Run:

```bash
pnpm --dir frontend test src/features/chat/components/ChatInfoPage.test.tsx
```

Expected: fail because participant rows still render initials-only spans.

- [ ] **Step 3: Update frontend type and participant avatar component**

In `frontend/src/features/chat/types.ts`, extend:

```ts
export type ChatThreadInfoParticipant = {
  avatarUrl?: string | null
  displayName: string
  id: `portal-user:${number}`
  isCurrentUser: boolean
}
```

In `frontend/src/features/chat/components/ChatInfoPage.tsx`, replace `ParticipantAvatar` with:

```tsx
function ParticipantAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl?: string | null
  name: string
}) {
  return (
    <ChatAvatar
      alt={name}
      avatarUrl={avatarUrl}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800"
      title={name}
    >
      {createTenantMonogram(name)}
    </ChatAvatar>
  )
}
```

Update render call:

```tsx
<ParticipantAvatar
  avatarUrl={participant.avatarUrl}
  name={participant.displayName}
/>
```

- [ ] **Step 4: Run focused frontend test and verify GREEN**

Run:

```bash
pnpm --dir frontend test src/features/chat/components/ChatInfoPage.test.tsx
```

Expected: PASS.

## Task 7: Frontend Group Member Message Avatars

**Files:**

- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Test: `frontend/src/features/chat/components/ChatTranscript.test.tsx`

- [ ] **Step 1: Write failing transcript avatar tests**

In `frontend/src/features/chat/components/ChatTranscript.test.tsx`, replace the existing group member avatar expectation with a positive case:

```ts
it('renders a group member portal-proxy avatar image on the first incoming bubble', () => {
  const { container } = renderTranscript([
    createMessage({
      authorAvatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
      authorName: 'Мария Соколова',
      authorRole: 'group_member',
      content: 'Сообщение из общего чата',
      direction: 'incoming',
      id: 1,
    }),
    createMessage({
      authorAvatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
      authorName: 'Мария Соколова',
      authorRole: 'group_member',
      content: 'Следующее сообщение',
      direction: 'incoming',
      id: 2,
    }),
  ])

  expect(getMessageHeader(container, 1)).toHaveTextContent('Мария Соколова')
  expect(getMessageHeader(container, 2)).toBeNull()

  const avatars = container.querySelectorAll('[data-author-avatar]')
  expect(avatars).toHaveLength(1)
  expect(avatars[0]).toHaveAttribute('aria-label', 'Участник Мария Соколова')
  expect(avatars[0]?.querySelector('img')).toHaveAttribute(
    'src',
    '/api/chat/threads/group%3A154/participants/8/avatar',
  )
})
```

Keep the existing unsafe URL regression, but make it check the generalized selector:

```ts
const avatar = container.querySelector('[data-author-avatar]')
expect(avatar).toHaveTextContent('ОS')
expect(avatar?.querySelector('img')).toBeNull()
```

Add a no-ledger/fallback case:

```ts
it('keeps group member initials when no portal avatar URL is provided', () => {
  const { container } = renderTranscript([
    createMessage({
      authorAvatarUrl: null,
      authorName: 'Иван Петров',
      authorRole: 'group_member',
      content: 'Сообщение из общего чата',
      direction: 'incoming',
      id: 1,
    }),
  ])

  const avatar = container.querySelector('[data-author-avatar]')
  expect(avatar).toHaveAttribute('aria-label', 'Участник Иван Петров')
  expect(avatar).toHaveTextContent('ИП')
  expect(avatar?.querySelector('img')).toBeNull()
})
```

- [ ] **Step 2: Run focused transcript test and verify RED**

Run:

```bash
pnpm --dir frontend test src/features/chat/components/ChatTranscript.test.tsx
```

Expected: fail because `MessageBubble` only renders avatar slots for `agent` and uses `data-agent-avatar`.

- [ ] **Step 3: Generalize incoming avatar slot**

In `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`, rename `AgentAvatar` to `AuthorAvatar` and use role-specific labels:

```tsx
function AuthorAvatar({
  authorName,
  authorRole,
  avatarUrl,
  isVisible,
}: {
  authorName: string
  authorRole: ChatMessage['authorRole']
  avatarUrl?: string | null
  isVisible: boolean
}) {
  const labelPrefix = authorRole === 'agent' ? 'Агент' : 'Участник'

  return (
    <div className="mr-2 mt-0.5 flex w-8 shrink-0 justify-center sm:mr-2.5 sm:w-9">
      {isVisible ? (
        <ChatAvatar
          aria-label={`${labelPrefix} ${authorName}`}
          alt={`${labelPrefix} ${authorName}`}
          avatarUrl={avatarUrl}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-[11px] font-medium leading-none text-slate-500 sm:h-9 sm:w-9 sm:text-[12px]"
          data-author-avatar
          title={authorName}
        >
          {getAuthorInitials(authorName)}
        </ChatAvatar>
      ) : null}
    </div>
  )
}
```

Replace:

```ts
const hasAgentAvatarSlot = message.authorRole === 'agent'
const shouldRenderAgentAvatar =
  hasAgentAvatarSlot && shouldRenderAuthorName(blockPosition)
```

with:

```ts
const hasIncomingAuthorAvatarSlot =
  message.authorRole === 'agent' || message.authorRole === 'group_member'
const shouldRenderAuthorAvatar =
  hasIncomingAuthorAvatarSlot && shouldRenderAuthorName(blockPosition)
```

Replace render and max-width branches to use `hasIncomingAuthorAvatarSlot`.

- [ ] **Step 4: Run focused transcript test and verify GREEN**

Run:

```bash
pnpm --dir frontend test src/features/chat/components/ChatTranscript.test.tsx
```

Expected: PASS.

## Task 8: Integration Coverage For Message Surfaces

**Files:**

- Test: `backend/src/modules/chat-messages/service.thread-runtime.test.ts`
- Test: `backend/src/modules/chat-messages/service.context.test.ts`
- Test: `backend/src/modules/chat-messages/service.search.test.ts`
- Test: `frontend/src/features/chat/pages/ChatPage.offline-cache.test.tsx`

- [ ] **Step 1: Add service-level regression for group member avatar URL in snapshots**

In `backend/src/modules/chat-messages/service.thread-runtime.test.ts`, add a test where:

- `listConversationMessages` returns a group contact incoming message with id `701`;
- `findSendLedgerAuthorsByMessageIds` returns author `{ userId: 8, authorDisplayName: 'Мария Соколова' }`;
- current user id is `7`.

Assert the snapshot message includes:

```ts
expect(snapshot.messages[0]).toMatchObject({
  authorAvatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
  authorName: 'Мария Соколова',
  authorRole: 'group_member',
  direction: 'incoming',
})
```

- [ ] **Step 2: Add context/search compatibility checks**

For `backend/src/modules/chat-messages/service.context.test.ts` and `backend/src/modules/chat-messages/service.search.test.ts`, add narrow assertions that existing context/search mapping still succeeds with `authorAvatarUrl` present on `PortalChatMessage`, but search results remain unchanged because `PortalChatSearchResult` does not expose avatars.

Use this assertion for context responses:

```ts
expect(response.messages).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      authorAvatarUrl: '/api/chat/threads/group%3A154/participants/8/avatar',
      authorRole: 'group_member',
    }),
  ]),
)
```

Use this assertion for search responses:

```ts
expect(JSON.stringify(response.items)).not.toContain('participants/8/avatar')
```

- [ ] **Step 3: Add offline cache compatibility check**

In `frontend/src/features/chat/pages/ChatPage.offline-cache.test.tsx`, add one cached group message with:

```ts
authorAvatarUrl: '/api/chat/threads/group%3A254/participants/8/avatar',
authorName: 'Мария Соколова',
authorRole: 'group_member',
```

Assert the cached open renders the author name and the avatar image:

```ts
expect(screen.getByText('Мария Соколова')).toBeInTheDocument()
expect(
  screen.getByRole('img', { name: 'Участник Мария Соколова' }),
).toHaveAttribute('src', '/api/chat/threads/group%3A254/participants/8/avatar')
```

- [ ] **Step 4: Run integration-focused tests**

Run:

```bash
pnpm --dir backend test src/modules/chat-messages/service.thread-runtime.test.ts src/modules/chat-messages/service.context.test.ts src/modules/chat-messages/service.search.test.ts
pnpm --dir frontend test src/features/chat/pages/ChatPage.offline-cache.test.tsx
```

Expected: PASS.

## Task 9: Browser Smoke

**Files:**

- Create or modify: `tests/e2e/chat-group-member-avatars.spec.ts`
- Use existing helpers in `tests/e2e/support/`.

- [ ] **Step 1: Check whether the local e2e harness can seed group member avatars**

Inspect:

```bash
sed -n '1,260p' tests/e2e/support/chatwoot.ts
sed -n '1,260p' tests/e2e/profile-page.spec.ts
```

If helpers can create/update portal users and linked Chatwoot contacts, proceed with the smoke. If they cannot reliably seed a second group participant with an avatar, do not invent a brittle Chatwoot setup path; record the e2e blocker in the final response and rely on backend/frontend automated coverage for this slice.

- [ ] **Step 2: Add e2e smoke when seeding is supported**

Create `tests/e2e/chat-group-member-avatars.spec.ts` with this flow:

```ts
import { expect, test } from '@playwright/test'

test('shows group participant avatars through portal URLs', async ({
  page,
}) => {
  await page.goto('/app/chat')

  await page.getByRole('button', { name: /меню чата/i }).click()
  await page.getByRole('menuitem', { name: 'Информация о чате' }).click()

  await expect(
    page.getByRole('heading', { name: 'Информация о чате' }),
  ).toBeVisible()
  const participantAvatar = page
    .locator('img[src^="/api/chat/threads/"][src*="/participants/"]')
    .first()

  await expect(participantAvatar).toBeVisible()
  await expect(participantAvatar).toHaveAttribute(
    'src',
    /\/api\/chat\/threads\/.+\/participants\/\d+\/avatar/,
  )
})
```

If the transcript fixture includes a ledger-known group member message, extend the smoke:

```ts
await page.getByRole('button', { name: 'Назад' }).click()
await expect(
  page.locator(
    '[data-author-avatar] img[src^="/api/chat/threads/"][src*="/participants/"]',
  ),
).toBeVisible()
```

- [ ] **Step 3: Run the e2e smoke or record blocker**

Run when supported:

```bash
pnpm test:e2e tests/e2e/chat-group-member-avatars.spec.ts
```

Expected: PASS.

If unsupported, final response must say:

```text
Playwright group avatar smoke was not added because the current e2e harness does not seed a second group participant avatar; backend service/routes and frontend component/offline tests cover the slice.
```

## Task 10: Review, Checks, Docs, And Checkpoint

**Files:**

- Modify: `docs/roadmap/work-log.md` only after implementation and verification are done.

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
pnpm --dir backend test src/modules/chat-threads/info.test.ts src/modules/chat-threads/service.info.test.ts src/modules/chat-threads/contactRepository.test.ts src/modules/chat-messages/messageMapping.test.ts src/modules/chat-messages/service.attachment-proxy.test.ts src/modules/chat-messages/routes.attachment-proxy.test.ts src/modules/chat-messages/service.thread-runtime.test.ts src/modules/chat-messages/service.context.test.ts src/modules/chat-messages/service.search.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend tests**

Run:

```bash
pnpm --dir frontend test src/features/chat/components/ChatInfoPage.test.tsx src/features/chat/components/ChatTranscript.test.tsx src/features/chat/pages/ChatPage.offline-cache.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run type/build/lint checks**

Run:

```bash
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm lint
git diff --check
```

Expected: all commands PASS with no whitespace errors.

- [ ] **Step 4: Run required browser check**

Run the new e2e smoke if added:

```bash
pnpm test:e2e tests/e2e/chat-group-member-avatars.spec.ts
```

Expected: PASS.

If the smoke is blocked by test harness readiness, keep the blocker text from Task 9 in the final response.

- [ ] **Step 5: Code review the touched area**

Review for these concrete failure modes:

- browser receives only `/api/...` avatar URLs;
- direct Chatwoot avatar URLs never enter `PublicChatThreadInfoParticipant` or `PortalChatMessage`;
- participant avatar proxy rejects private threads;
- participant avatar proxy rejects inactive participants;
- participant avatar proxy rejects contacts that no longer have group membership;
- group message avatars are assigned only from send ledger author identity;
- current user's outgoing group messages still show no left-side avatar;
- unknown group messages with parsed author names still get no `authorAvatarUrl`;
- frontend ignores unsafe cached direct Chatwoot avatar URLs;
- no `portal_chat_threads` or send ledger schema migration is added.

- [ ] **Step 6: Update work log after closure**

Append a short completed baseline entry to `docs/roadmap/work-log.md` and keep a single final `Recommended Next Step` block.

Use wording in this style:

```md
- Group chat member avatars added: group info participants and ledger-known
  group member transcript messages now use backend-owned avatar proxy URLs,
  while unknown group authors keep initials fallback and browser still receives
  no direct Chatwoot asset URLs.
```

- [ ] **Step 7: Check git status before checkpoint commit**

Run:

```bash
git status --short --branch
```

Expected:

- on `feature/phase-chat-group-member-avatars`;
- only files from this slice are modified;
- no `.env`, `node_modules`, `dist`, `playwright-report`, `test-results`, or runtime artifacts are present.

- [ ] **Step 8: Create checkpoint commit**

Commit after all checks and review findings are closed:

```bash
git add backend/src frontend/src tests/e2e docs/roadmap/work-log.md
git commit -m "feat(chat): show group member avatars"
```

Expected: commit created on `feature/phase-chat-group-member-avatars`.

## Plan Self-Review

- Spec coverage: approach 2 is covered by Tasks 1-2 for group info participants, Tasks 4-5 for backend proxy/message mapping, Tasks 6-8 for frontend and integration surfaces, and Task 9 for browser/runtime smoke.
- Placeholder scan: no deferred implementation placeholders are required for code tasks. The only conditional path is the explicit Playwright harness readiness decision in Task 9.
- Type consistency: participant avatar URLs use `avatarUrl` in backend and frontend participant DTOs; message bubbles continue using `authorAvatarUrl`; proxy route uses `participantUserId`.
- Scope check: one feature slice, no schema migration, no Chatwoot core changes, no direct browser Chatwoot access.
