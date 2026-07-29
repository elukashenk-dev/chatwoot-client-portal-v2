# Attachment UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:subagent-driven-development` only if the user explicitly requests subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let portal customers prepare and explicitly send up to five files as one message through picker, clipboard, drag-and-drop, mobile sources and supported installed-PWA share sheets.

**Architecture:** The normal send path remains online-only and browser-to-portal-backend-to-Chatwoot. One bounded in-memory frontend draft feeds one plural multipart portal request, one send-ledger entry and one Chatwoot message-create request. The installed-PWA share target adds only a 15-minute, identity-scoped IndexedDB handoff; it never sends in the service worker and never becomes an attachment outbox.

**Tech Stack:** Node.js 24, pnpm 10.33.0, React 19, TypeScript 6, Vite 8, Vitest 4, Fastify 5, `@fastify/multipart` 10, IndexedDB/idb 8, Playwright 1.59, Chatwoot CE 4.15.1.

**Design source:** `docs/superpowers/specs/2026-07-29-attachment-ux-design.md`

## Global Constraints

- Implement in three separately merged branches, each created from the then-current `main`:
  `feature/phase-attachment-batch-foundation`,
  `feature/phase-attachment-input-transfer-ux`, then
  `feature/phase-pwa-share-target`.
- Never merge an intermediate task commit from a slice before that whole slice
  completes its review and required checks.
- One attachment batch is one portal request, one `clientMessageKey`, one
  send-ledger lifecycle, one Chatwoot request and one canonical message.
- Accept `1..5` files, at most `40 MiB` aggregate bytes, at most `40 MiB` for
  any individual file and at most `255` characters in each file name.
- Keep the existing `4000`-character caption limit, optional positive
  `replyToMessageId` and ordered file list.
- Keep attachment admission at five starts per minute per tenant/user, two
  active attachment requests per backend process and five minutes for complete
  request receipt.
- Preserve admission order: Origin/tenant, authenticated user, process slot,
  tenant/user rate limit, body read, file validation, thread/reply authority,
  Chatwoot send.
- Keep a maximum of about `80 MiB` raw attachment buffers per backend process:
  two active requests multiplied by `40 MiB` aggregate file bytes.
- Do not add polling, a server-side upload queue, portal binary storage,
  resumable upload, automatic retry or background attachment delivery.
- Picker, clipboard, drop, camera and system share only prepare a draft.
  Nothing sends until the customer presses the normal Send button.
- Browser code receives no Chatwoot token, conversation authority, direct
  Chatwoot upload URL or object-storage authority.
- Remove the singular portal endpoint and singular frontend/backend contract in
  Slice 1. Do not retain a compatibility route or fallback reader.
- Keep voice as an immediate, single-file online send. It uses the same local
  file validator but does not join a selected document batch.
- The service worker may stage system-shared images only. Normal picker,
  clipboard, camera and drop files stay in memory.
- System-share files are limited to PNG, JPEG and WebP, one pending draft per
  tenant/user, five files, `40 MiB`, `15` minutes and one active share parse per
  service-worker scope.
- Pending-share lookup uses one unique host/tenant/user index; expiry cleanup
  uses a key-only expiry index and deletes at most 25 records per invocation.
  Never scan or materialize every staged blob.
- Do not change Chatwoot core or use another portal repository as a source.
- Keep production `.ts`/`.tsx` files within the `500`-line code-health limit.
  Do not increase an allowlist ceiling.
- Before every Node-dependent command, follow the version file present on the
  then-current `main`. If neither `.nvmrc` nor `.node-version` exists, verify
  `node --version` is `v24.x` from root `package.json#engines` and
  `pnpm --version` is `10.33.0`.

## File And Responsibility Map

### Backend batch boundary

- `backend/src/modules/chat-messages/attachmentSend.ts` owns batch constants,
  ordered normalization, aggregate validation and payload hashing.
- `backend/src/modules/chat-messages/types.ts` owns
  `PortalAttachmentUpload`; the service boundary consumes an ordered array.
- `backend/src/modules/chat-messages/routes.ts` owns plural multipart parsing
  and preserves pre-body admission.
- `backend/src/modules/chat-messages/service.ts` resolves authority once and
  sends one ordered batch through one ledger entry.
- `backend/src/integrations/chatwoot/client.ts` validates `1..5` attachments and
  appends one `attachments[]` part per file to one Chatwoot request.

### Frontend draft and transfer boundary

- `frontend/src/features/chat/lib/attachmentDraft.ts` is the pure source of
  local limits, file normalization, duplicate detection, admission and batch
  signatures.
- `frontend/src/features/chat/components/message-composer/useAttachmentDraft.ts`
  owns the bounded in-memory collection and image preview object-URL lifecycle.
- `frontend/src/features/chat/components/message-composer/ComposerAttachmentTray.tsx`
  renders ordered previews, remove/clear controls, count and total size.
- `frontend/src/features/chat/components/MessageComposer.tsx` owns caption,
  reply and retry-key semantics, but receives the lifted attachment draft.
- `frontend/src/features/chat/api/chatAttachmentTransport.ts` is the only XHR
  transport; the rest of `chatClient.ts` stays on `fetch`.
- `frontend/src/features/chat/pages/useChatAttachmentSend.ts` maps XHR
  progress, cancellation, backend errors and canonical success into chat page
  state.
- `frontend/src/features/chat/components/ChatAttachmentDropZone.tsx` owns
  file-only drag state and the active-chat overlay.
- `frontend/src/features/chat/components/message-composer/ComposerAttachmentMenu.tsx`
  owns the accessible photo/video, camera and file actions.

### Installed-PWA handoff boundary

- `backend/src/modules/tenants/routes.ts` advertises the same-origin share
  target in the tenant-aware manifest.
- `frontend/src/features/offline/offlineDatabase.ts` adds only the
  `pending_share_drafts` object store and bumps the shared database version.
- `frontend/src/features/chat/share-target/pendingShareDraftStore.ts` owns
  typed foreground reads, identity checks, expiry, updates and deletion.
- `frontend/public/sw.js` owns bounded raw POST reception, system-share
  validation, one-draft append/replace rules and redirect.
- `frontend/src/features/chat/share-target/usePwaShareTargetDraft.ts` requires a
  live online session before exposing names or importing files.
- `frontend/src/features/chat/share-target/PwaShareDestinationDialog.tsx` owns
  explicit destination confirmation or selection.

## Stable Interfaces

The tasks below use these names. Do not introduce parallel aliases.

```ts
export const CHAT_ATTACHMENT_MAX_FILES = 5
export const CHAT_ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024
export const CHAT_ATTACHMENT_FILE_NAME_MAX_LENGTH = 255

export type AttachmentDraftSource =
  | 'camera'
  | 'clipboard'
  | 'drop'
  | 'picker'
  | 'share-target'

export type AttachmentDraftItem = {
  readonly file: File
  readonly id: string
  readonly source: AttachmentDraftSource
}

export type AttachmentDraftRejection = {
  code:
    | 'attachment_batch_too_large'
    | 'attachment_count_exceeded'
    | 'attachment_duplicate'
    | 'attachment_empty'
    | 'attachment_file_name_required'
    | 'attachment_file_name_too_long'
    | 'attachment_too_large'
    | 'attachment_type_not_allowed'
  fileName: string | null
  message: string
}

export type AttachmentAdmissionResult = {
  accepted: AttachmentDraftItem[]
  items: AttachmentDraftItem[]
  rejections: AttachmentDraftRejection[]
}

export function normalizeAttachmentFile(file: File): File
export function validateAttachmentFile(
  file: File,
): AttachmentDraftRejection | null
export function admitAttachmentFiles(input: {
  createId?: () => string
  currentItems: readonly AttachmentDraftItem[]
  files: readonly File[]
  source: AttachmentDraftSource
}): AttachmentAdmissionResult
export function createAttachmentBatchSignature(
  items: readonly AttachmentDraftItem[],
): string
```

```ts
export type SendAttachmentBatchInput = {
  clientMessageKey: string
  content?: string | null
  items: readonly AttachmentDraftItem[]
  replyToMessageId?: number | null
}

export type AttachmentTransferState =
  | { percent: null; stage: 'idle' }
  | { percent: 0; stage: 'preparing' }
  | { percent: number; stage: 'uploading' }
  | { percent: 100; stage: 'sending' }
  | { percent: null; stage: 'error' }

export async function sendChatAttachments(input: {
  attachments: readonly File[]
  clientMessageKey: string
  content?: string | null
  onTransferState: (state: AttachmentTransferState) => void
  replyToMessageId?: number | null
  signal: AbortSignal
  threadId: string
}): Promise<ChatSendResult>
```

`SendAttachmentBatchInput` is the UI-only send contract. `ChatPage` snapshots
its immutable `items` before awaiting the request so `id` and `source` remain
available for local lifecycle work. `useChatAttachmentSend` maps that snapshot
to `attachments: items.map(({ file }) => file)` only at the
`sendChatAttachments` transport boundary. Draft IDs and sources never enter the
multipart request.

```ts
export type PortalAttachmentUpload = {
  data: Buffer
  fileName: string
  mimeType: string
  size: number
}

export function normalizeAttachmentUploads(
  attachments: readonly PortalAttachmentUpload[],
): PortalAttachmentUpload[]

export function createAttachmentPayloadSha256(
  attachments: readonly PortalAttachmentUpload[],
  content: string | null,
  replyToMessageId: number | null,
): string
```

```ts
export type OfflinePendingShareFile = {
  blob: Blob
  fileName: string
  lastModified: number
  mimeType: string
}

export type OfflinePendingShareDraftRecord = {
  createdAt: string
  draftId: string
  expiresAt: string
  files: OfflinePendingShareFile[]
  host: string
  tenantSlug: string
  userId: number
}

export type PendingShareDraftScope = {
  draftId: string
  host: string
  tenantSlug: string
  userId: number
}

export const PWA_SHARE_DRAFT_IDENTITY_INDEX = 'by_identity'
export const PWA_SHARE_DRAFT_EXPIRY_INDEX = 'by_expiry'
export const PWA_SHARE_DRAFT_PRUNE_LIMIT = 25
```

---

## Slice 1 — Batch Foundation

Create `feature/phase-attachment-batch-foundation` from the then-current
`main`. Tasks 1–5 stay on that branch.

### Task 1: Convert backend send authority and Chatwoot client to ordered batches

**Files:**

- Modify: `backend/src/modules/chat-messages/attachmentSend.ts`
- Create: `backend/src/modules/chat-messages/attachmentSend.test.ts`
- Modify: `backend/src/modules/chat-messages/types.ts`
- Modify: `backend/src/modules/chat-messages/service.ts`
- Modify: `backend/src/modules/chat-messages/service.test.ts`
- Modify: `backend/src/modules/chat-messages/service.conversation-recovery.test.ts`
- Modify: `backend/src/modules/chat-messages/routes.ts`
- Modify: `backend/src/integrations/chatwoot/client.ts`
- Modify: `backend/src/integrations/chatwoot/client.test.ts`

**Interfaces:**

- Consumes an ordered `readonly PortalAttachmentUpload[]`.
- Produces one normalized `PortalAttachmentUpload[]`, one order-sensitive
  SHA-256 payload and one Chatwoot message request.
- Keeps `messageKind = 'attachment'` and one `clientMessageKey`.
- The existing singular route temporarily wraps its one parsed file in an
  array inside this unmerged branch; Task 2 removes that route.

- [ ] **Step 1: Write failing batch normalization and hash tests.**

  Add focused cases to `attachmentSend.test.ts`:

  ```ts
  const first = {
    data: Buffer.from('first'),
    fileName: ' first.pdf ',
    mimeType: 'Application/PDF',
    size: 5,
  }
  const second = {
    data: Buffer.from('second'),
    fileName: ' second.txt ',
    mimeType: 'Text/Plain',
    size: 6,
  }

  expect(normalizeAttachmentUploads([first, second])).toMatchObject([
    { fileName: 'first.pdf', mimeType: 'application/pdf', size: 5 },
    { fileName: 'second.txt', mimeType: 'text/plain', size: 6 },
  ])
  expect(
    createAttachmentPayloadSha256([first, second], 'caption', 77),
  ).not.toBe(createAttachmentPayloadSha256([second, first], 'caption', 77))
  ```

  Add explicit rejections for zero files, six files, an empty file, a
  `40 MiB + 1` aggregate and an unsupported MIME type. Use a table to prove
  that changing file bytes, file order, caption or reply target changes the
  hash:

  ```ts
  for (const changedHash of [
    createAttachmentPayloadSha256([changedBytes, second], 'caption', 77),
    createAttachmentPayloadSha256([second, first], 'caption', 77),
    createAttachmentPayloadSha256([first, second], 'changed', 77),
    createAttachmentPayloadSha256([first, second], 'caption', 78),
  ]) {
    expect(changedHash).not.toBe(
      createAttachmentPayloadSha256([first, second], 'caption', 77),
    )
  }
  ```

- [ ] **Step 2: Run the focused backend tests and confirm RED.**

  Run:

  ```bash
  pnpm --dir backend exec vitest run \
    src/modules/chat-messages/attachmentSend.test.ts \
    src/modules/chat-messages/service.test.ts \
    src/integrations/chatwoot/client.test.ts \
    --no-file-parallelism
  ```

  Expected: FAIL because the plural functions and `attachments` service/client
  inputs do not exist.

- [ ] **Step 3: Implement ordered batch normalization and hashing.**

  Export the three exact constants from `attachmentSend.ts`. Normalize every
  file with the existing name/MIME/data rules, reject outside `1..5`, and
  accumulate bytes before returning:

  ```ts
  export function normalizeAttachmentUploads(
    attachments: readonly PortalAttachmentUpload[],
  ) {
    if (attachments.length < 1) {
      throw new ApiError(400, 'attachment_required', 'Прикрепите файл.')
    }

    if (attachments.length > CHAT_ATTACHMENT_MAX_FILES) {
      throw new ApiError(
        400,
        'attachment_count_exceeded',
        'Можно добавить не больше 5 файлов.',
      )
    }

    const normalized = attachments.map(normalizeOneAttachmentUpload)
    const totalBytes = normalized.reduce((sum, file) => sum + file.size, 0)

    if (totalBytes > CHAT_ATTACHMENT_MAX_BYTES) {
      throw new ApiError(
        413,
        'attachment_batch_too_large',
        'Общий размер файлов не должен превышать 40 МБ.',
      )
    }

    return normalized
  }
  ```

  Build the hash by adding message kind, caption, reply target and then each
  normalized file's index, name, MIME, size and bytes in order.

- [ ] **Step 4: Convert service and recovery calls to `attachments`.**

  Change only the attachment-message method input:

  ```ts
  async sendCurrentUserAttachmentMessage({
    attachments,
    clientMessageKey,
    content = null,
    replyToMessageId = null,
    threadId,
    userId,
  }: {
    attachments: readonly PortalAttachmentUpload[]
    clientMessageKey: string
    content?: string | null
    replyToMessageId?: number | null
    threadId: string
    userId: number
  }): Promise<ChatSendResult>
  ```

  Resolve writable thread and reply once, normalize once, hash once and call
  `createOrReplayCanonicalMessage` once. Update the temporary singular route
  call to `attachments: [upload.attachment]` so this task remains green.

  In `service.test.ts`, make the repository return `payload_mismatch` and
  assert the batch send rejects with:

  ```ts
  {
    code: 'client_message_key_conflict',
    statusCode: 409,
  }
  ```

  Inspect the normal `acquireSendLedgerEntry` call and assert it contains the
  hash and metadata but no `attachments`, `data` or file buffer property.

- [ ] **Step 5: Convert the Chatwoot client to repeated ordered parts.**

  Change `createConversationIncomingAttachmentMessage` to accept:

  ```ts
  attachments: readonly ChatwootAttachmentUpload[]
  ```

  Validate length `1..5`, trim/normalize every item and append in order:

  ```ts
  for (const attachment of attachments) {
    formData.append(
      'attachments[]',
      createAttachmentBlob(attachment),
      attachment.fileName,
    )
  }
  ```

  In `client.test.ts`, assert:

  ```ts
  const files = formData.getAll('attachments[]')
  expect(files).toHaveLength(2)
  expect(files.map((file) => (file as File).name)).toEqual([
    'first.pdf',
    'second.txt',
  ])
  expect(fetchFn).toHaveBeenCalledTimes(1)
  ```

- [ ] **Step 6: Run focused tests and commit the internal batch boundary.**

  Run the Step 2 command. Expected: PASS.

  Commit:

  ```bash
  git add backend/src/modules/chat-messages/attachmentSend.ts \
    backend/src/modules/chat-messages/attachmentSend.test.ts \
    backend/src/modules/chat-messages/types.ts \
    backend/src/modules/chat-messages/service.ts \
    backend/src/modules/chat-messages/service.test.ts \
    backend/src/modules/chat-messages/service.conversation-recovery.test.ts \
    backend/src/modules/chat-messages/routes.ts \
    backend/src/integrations/chatwoot/client.ts \
    backend/src/integrations/chatwoot/client.test.ts
  git commit -m "feat(chat): support ordered attachment batches"
  ```

### Task 2: Replace the singular portal upload route with bounded plural multipart

**Files:**

- Modify: `backend/src/test/appTestHelpers.ts`
- Modify: `backend/src/modules/chat-messages/routes.ts`
- Modify: `backend/src/modules/chat-messages/routes.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/app.test.ts`

**Interfaces:**

- Produces only `POST /api/chat/messages/attachments`.
- Accepts repeated multipart field `attachments`, one through five times.
- Parser limits are `files: 5`, `fields: 5`, `parts: 10`,
  `fileSize: 40 MiB`.
- Route `bodyLimit` is `40 MiB + 256 KiB` bounded multipart overhead.
- Returns controlled codes from the approved design.

- [ ] **Step 1: Make the multipart test helper produce repeated file fields.**

  Replace `createMultipartAttachmentPayload` with:

  ```ts
  export function createMultipartAttachmentsPayload({
    attachments,
    clientMessageKey,
    content,
    replyToMessageId,
    threadId,
  }: {
    attachments: Array<{
      fileContent: Buffer
      fileName: string
      mimeType: string
    }>
    clientMessageKey: string
    content?: string
    replyToMessageId?: number
    threadId: string
  }) {
    const boundary = '----portal-test-boundary'
    const chunks: Buffer[] = []

    for (const attachment of attachments) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="attachments"; filename="${attachment.fileName}"\r\nContent-Type: ${attachment.mimeType}\r\n\r\n`,
        ),
        attachment.fileContent,
        Buffer.from('\r\n'),
      )
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`))

    return {
      contentType: `multipart/form-data; boundary=${boundary}`,
      payload: Buffer.concat(chunks),
    }
  }
  ```

  Keep the existing scalar-field appends before this loop. Update existing
  backend callers to pass a one-element `attachments` array.

- [ ] **Step 2: Write failing plural route tests.**

  Add assertions that:

  ```ts
  expect(
    chatMessagesService.sendCurrentUserAttachmentMessage,
  ).toHaveBeenCalledWith(
    expect.objectContaining({
      attachments: [
        expect.objectContaining({ fileName: 'first.pdf' }),
        expect.objectContaining({ fileName: 'second.txt' }),
      ],
    }),
  )
  ```

  Add separate cases for:

  ```text
  zero files       -> attachment_required
  six files        -> attachment_count_exceeded
  40 MiB + 1 byte  -> attachment_batch_too_large
  wrong file field -> attachment_field_required
  old singular URL -> 404
  ```

  Preserve the existing assertions that rate limiting and a third process-wide
  upload reject without reading the request body. Add an aborted multipart
  stream case, then prove the next request acquires the released slot.

- [ ] **Step 3: Run route and app tests and confirm RED.**

  Run:

  ```bash
  pnpm --dir backend exec vitest run \
    src/modules/chat-messages/routes.test.ts \
    src/app.test.ts \
    --no-file-parallelism
  ```

  Expected: FAIL because the plural URL, repeated field and parser limits are
  absent.

- [ ] **Step 4: Implement the plural parser and remove the old route.**

  Make the parser return:

  ```ts
  {
    attachments: PortalAttachmentUpload[]
    clientMessageKey: string
    content: string | null
    replyToMessageId: number | null
    threadId: string
  }
  ```

  During serial `request.parts()` iteration:

  ```ts
  attachments.push(await readMultipartFile(part))
  aggregateBytes += attachments.at(-1)?.size ?? 0

  if (aggregateBytes > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new ApiError(
      413,
      'attachment_batch_too_large',
      'Общий размер файлов не должен превышать 40 МБ.',
    )
  }
  ```

  Map Fastify `FilesLimitError` to `attachment_count_exceeded`; keep field and
  part overflow controlled. Register only:

  ```ts
  app.post(
    '/api/chat/messages/attachments',
    {
      bodyLimit: CHAT_ATTACHMENT_REQUEST_MAX_BYTES,
    },
    handler,
  )
  ```

  Keep the acquire/rate-limit/parser/service sequence inside the existing
  `try/finally`.

- [ ] **Step 5: Raise only the root multipart parser ceilings needed by the route.**

  In `backend/src/app.ts`, set the plugin defaults to:

  ```ts
  limits: {
    fields: 5,
    fileSize: CHAT_ATTACHMENT_MAX_BYTES,
    files: CHAT_ATTACHMENT_MAX_FILES,
    parts: 10,
  }
  ```

  The route retains its own identical or stricter limits. Do not change the
  five-minute Fastify request timeout.

- [ ] **Step 6: Run focused tests and commit the public API change.**

  Run the Step 3 command. Expected: PASS.

  Commit:

  ```bash
  git add backend/src/test/appTestHelpers.ts \
    backend/src/modules/chat-messages/routes.ts \
    backend/src/modules/chat-messages/routes.test.ts \
    backend/src/app.ts \
    backend/src/app.test.ts
  git commit -m "feat(chat): accept bounded attachment multipart batches"
  ```

### Task 3: Build the pure frontend draft model and compact preview tray

**Files:**

- Create: `frontend/src/features/chat/lib/attachmentDraft.ts`
- Create: `frontend/src/features/chat/lib/attachmentDraft.test.ts`
- Create: `frontend/src/features/chat/components/message-composer/useAttachmentDraft.ts`
- Create: `frontend/src/features/chat/components/message-composer/useAttachmentDraft.test.tsx`
- Create: `frontend/src/features/chat/components/message-composer/ComposerAttachmentTray.tsx`
- Create: `frontend/src/features/chat/components/message-composer/ComposerAttachmentTray.test.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/utils.ts`
- Modify: `frontend/src/features/chat/components/message-composer/utils.test.ts`

**Interfaces:**

- Produces the exact draft types and functions under **Stable Interfaces**.
- Duplicate identity is `name + normalized MIME + size + lastModified`.
- Local rejection never removes already accepted files.
- Image object URLs exist only in the hook's derived view items.

- [ ] **Step 1: Write the admission matrix before implementation.**

  In `attachmentDraft.test.ts`, cover:

  ```ts
  expect(
    admitAttachmentFiles({
      createId: () => 'new-id',
      currentItems: [existing],
      files: [second, third],
      source: 'picker',
    }).items.map((item) => item.file.name),
  ).toEqual(['existing.pdf', 'second.png', 'third.txt'])
  ```

  Add explicit assertions for:

  ```text
  five accepted in order; sixth rejected
  aggregate 40 MiB accepted; 40 MiB + 1 rejected
  empty file rejected
  empty and 256-character names rejected
  unsupported MIME/extension rejected
  exact duplicate suppressed
  duplicate bytes under a different name accepted
  valid candidates remain when another candidate is rejected
  ```

- [ ] **Step 2: Run the pure test and confirm RED.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/lib/attachmentDraft.test.ts
  ```

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement local normalization, validation and admission.**

  Export one `COMPOSER_ATTACHMENT_ACCEPT` string from
  `attachmentDraft.ts`, replacing the private constant in
  `ComposerInputRow.tsx` during Task 4.

  Use the backend-visible MIME allowlist, plus explicit known extensions when
  the browser supplies an empty or generic MIME. Rebuild only such a file:

  ```ts
  return new File([file], file.name, {
    lastModified: file.lastModified,
    type: inferredMimeType,
  })
  ```

  Return one rejection object per rejected candidate. The UI may summarize
  them, but this pure layer retains each reason.

- [ ] **Step 4: Write and implement object-URL lifecycle tests.**

  Stub:

  ```ts
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  ```

  Prove an image gets a URL, a document gets `null`, removal revokes exactly
  its URL, clear revokes all remaining URLs and unmount revokes leftovers.
  Implement `useAttachmentDraft` with `addFiles`, `removeItem`, `clearItems`,
  ordered `items`, derived `viewItems`, `totalBytes` and a summarized Russian
  `errorMessage`.

- [ ] **Step 5: Write and implement the compact tray component.**

  Assert accessible names and batch summary:

  ```ts
  expect(screen.getByText('3/5 · 18,4 МБ')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Убрать файл invoice.pdf' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Очистить файлы' })).toBeVisible()
  ```

  Render image thumbnails with `alt=""`, document icons, truncated names,
  sizes, horizontal overflow and a single `aria-live="polite"` summary. Do not
  announce every object-URL or layout change.

- [ ] **Step 6: Run focused tests and commit the reusable draft foundation.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/lib/attachmentDraft.test.ts \
    src/features/chat/components/message-composer/useAttachmentDraft.test.tsx \
    src/features/chat/components/message-composer/ComposerAttachmentTray.test.tsx \
    src/features/chat/components/message-composer/utils.test.ts
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add frontend/src/features/chat/lib/attachmentDraft.ts \
    frontend/src/features/chat/lib/attachmentDraft.test.ts \
    frontend/src/features/chat/components/message-composer/useAttachmentDraft.ts \
    frontend/src/features/chat/components/message-composer/useAttachmentDraft.test.tsx \
    frontend/src/features/chat/components/message-composer/ComposerAttachmentTray.tsx \
    frontend/src/features/chat/components/message-composer/ComposerAttachmentTray.test.tsx \
    frontend/src/features/chat/components/message-composer/utils.ts \
    frontend/src/features/chat/components/message-composer/utils.test.ts
  git commit -m "feat(chat): add bounded attachment draft model"
  ```

### Task 4: Wire multi-file picker, one retry key and the plural frontend API

**Files:**

- Modify: `frontend/src/features/chat/components/message-composer/types.ts`
- Modify: `frontend/src/features/chat/components/message-composer/interactionState.ts`
- Create: `frontend/src/features/chat/components/message-composer/interactionState.test.ts`
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.test.tsx`
- Delete: `frontend/src/features/chat/components/message-composer/ComposerAttachmentPreview.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerInputRow.tsx`
- Modify: `frontend/src/features/chat/pages/ChatComposerDock.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/useChatAttachmentSend.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/api/chatClient.attachments.test.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.search-context-regression.test.tsx`

**Interfaces:**

- Replaces `SendAttachmentInput` with `SendAttachmentBatchInput`.
- Replaces `onSendAttachment` with `onSendAttachmentBatch`.
- Replaces `sendChatAttachment` with `sendChatAttachments`.
- Preserves immutable `AttachmentDraftItem[]` through the UI send callback and
  maps it to `File[]` only at the transport boundary.
- Uses `attachments` repeated fields and the plural endpoint.
- Keeps the same key for an unchanged failed batch; any file/order/caption/reply
  change clears that key.

- [ ] **Step 1: Write failing composer behavior tests.**

  Add cases that upload three files in one selection and assert:

  ```ts
  expect(screen.getByText('3/5 · 22 Б')).toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: 'Убрать файл second.txt' }),
  )
  expect(screen.getByText('2/5 · 17 Б')).toBeInTheDocument()
  ```

  Submit the remaining batch with a caption and reply, then assert:

  ```ts
  expect(onSendAttachmentBatch).toHaveBeenCalledWith({
    clientMessageKey: expect.stringMatching(/^portal-send:/),
    content: 'Подпись',
    items: [
      expect.objectContaining({ file: first, source: 'picker' }),
      expect.objectContaining({ file: third, source: 'picker' }),
    ],
    replyToMessageId: 77,
  })
  ```

  Make the first call resolve `false`, submit unchanged again and compare keys.
  Remove/re-add a file, reorder through a new selection, edit caption and cancel
  reply in separate cases; each must produce a new key.

- [ ] **Step 2: Write failing API and chat-page integration tests.**

  In `chatClient.attachments.test.ts`, use two files and assert:

  ```ts
  expect(formData.getAll('attachments')).toHaveLength(2)
  expect(
    formData.getAll('attachments').map((file) => (file as File).name),
  ).toEqual(['first.pdf', 'second.txt'])
  ```

  In `ChatPage.test.tsx`, assert the request path is
  `/api/chat/messages/attachments`, the canonical response contains both
  attachments and both render under one outgoing message.

  In `ChatPage.search-context-regression.test.tsx`, replace the singular
  response fixture with `/api/chat/messages/attachments` and keep the
  regression assertion that starting an attachment send exits message-history
  context.

- [ ] **Step 3: Run focused frontend tests and confirm RED.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/components/MessageComposer.test.tsx \
    src/features/chat/api/chatClient.attachments.test.ts \
    src/features/chat/pages/ChatPage.test.tsx \
    src/features/chat/pages/ChatPage.search-context-regression.test.tsx
  ```

  Expected: FAIL on singular state, props, form field and endpoint.

- [ ] **Step 4: Lift the draft to `ChatPage` and keep composer files bounded.**

  Call `useAttachmentDraft()` once in `ChatPage` and pass its result through
  `ChatComposerDock`. `MessageComposer` receives:

  ```ts
  attachmentDraft: ReturnType<typeof useAttachmentDraft>
  onSendAttachmentBatch: (input: SendAttachmentBatchInput) => Promise<boolean>
  ```

  When submitting, create `const submittedItems = [...attachmentDraft.items]`
  before the first `await` and pass that immutable snapshot through
  `onSendAttachmentBatch`. In `useChatAttachmentSend`, call the transport with
  `attachments: submittedItems.map(({ file }) => file)`. Do not reconstruct
  lifecycle state from a later mutable draft.

  `ComposerInputRow` uses `multiple` and forwards
  `Array.from(event.target.files ?? [])`. Reset the input value after every
  selection so choosing the same file again still fires `change`; duplicate
  admission decides whether it is added.

  Replace the single preview with `ComposerAttachmentTray`. Keep
  `MessageComposer.tsx` below `500` lines by moving draft mutation and preview
  mechanics into the new hook/components.

- [ ] **Step 5: Send one plural multipart request and keep voice validation.**

  Implement `sendChatAttachments` with `fetch` in this slice:

  ```ts
  for (const file of attachments) {
    formData.append('attachments', file, file.name)
  }

  return request<ChatSendResult>('/chat/messages/attachments', {
    formData,
    method: 'POST',
    networkErrorMessage:
      'Не удалось загрузить файлы. Они остались в сообщении — попробуйте ещё раз.',
    signal,
  })
  ```

  Before the voice callback reaches the page send hook, call
  `validateAttachmentFile(voiceFile)`. Show its Russian rejection and do not
  call the backend when invalid.

- [ ] **Step 6: Run focused tests and commit frontend batch behavior.**

  Create `interactionState.test.ts` with one shared valid base input and these
  exact expectations:

  ```ts
  expect(
    getComposerInteractionState({ ...baseInput, attachmentCount: 0 })
      .canSendAttachment,
  ).toBe(false)
  expect(
    getComposerInteractionState({ ...baseInput, attachmentCount: 1 })
      .canSendAttachment,
  ).toBe(true)
  expect(
    getComposerInteractionState({
      ...baseInput,
      attachmentCount: 1,
      isSending: true,
    }).canSendAttachment,
  ).toBe(false)
  ```

  Replace the old `selectedAttachment` interaction input with
  `attachmentCount: number`. Then run the Step 3 command plus:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/components/message-composer/interactionState.test.ts
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add frontend/src/features/chat/components \
    frontend/src/features/chat/pages/ChatComposerDock.tsx \
    frontend/src/features/chat/pages/ChatPage.tsx \
    frontend/src/features/chat/pages/useChatAttachmentSend.ts \
    frontend/src/features/chat/api/chatClient.ts \
    frontend/src/features/chat/api/chatClient.attachments.test.ts \
    frontend/src/features/chat/pages/ChatPage.test.tsx \
    frontend/src/features/chat/pages/ChatPage.search-context-regression.test.tsx
  git commit -m "feat(chat): send attachment batches from composer"
  ```

### Task 5: Prove Slice 1, close F-CHAT-005 and prepare the slice merge

**Files:**

- Create: `tests/e2e/chat-attachments.spec.ts`
- Modify: `tests/e2e/chat-read-model.spec.ts`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/operations/local-cross-tenant-test-data.md`
- Delete: `docs/findings/F-CHAT-005-frontend-attachment-validation.md`
- Modify: `docs/superpowers/specs/2026-06-02-chat-message-reliability-design.md`
- Modify: `docs/superpowers/specs/2026-07-29-attachment-ux-design.md`
- Verify: all Slice 1 code and tests

**Interfaces:**

- Browser proves a real multiple picker and one canonical message.
- Stable architecture names only `/api/chat/messages/attachments`.
- Finding deletion occurs only after implementation, review and verification.

- [ ] **Step 1: Add the focused browser batch scenario.**

  Reuse the existing authenticated mocked chat bootstrap. Set two files in one
  chooser operation:

  ```ts
  await page.locator('input[type="file"]').setInputFiles([
    {
      buffer: Buffer.from('%PDF-1.7\n'),
      mimeType: 'application/pdf',
      name: 'first.pdf',
    },
    {
      buffer: Buffer.from('second'),
      mimeType: 'text/plain',
      name: 'second.txt',
    },
  ])
  ```

  Assert preview order, `2/5`, total size, individual removal and one plural
  multipart POST. Fulfil one canonical message with two attachments and assert
  both appear in the same message bubble.

  In the existing “sends an attachment through the backend chat contract”
  scenario in `chat-read-model.spec.ts`, change the chooser to two ordered
  files, fulfil two canonical attachment records and replace the hard-coded
  singular path with `/api/chat/messages/attachments`. Keep the existing
  assertion that only one POST produces one canonical message.

- [ ] **Step 2: Run the two affected browser scenarios.**

  Run:

  ```bash
  pnpm exec playwright test tests/e2e/chat-attachments.spec.ts
  pnpm exec playwright test tests/e2e/chat-read-model.spec.ts \
    --grep "sends an attachment through the backend chat contract"
  ```

  Expected: PASS in the configured Chromium project.

- [ ] **Step 3: Perform the mandatory docs-preservation audit before deletion.**

  Run before deleting the finding:

  ```bash
  git status --short --branch
  git log --all -- \
    docs/findings/F-CHAT-005-frontend-attachment-validation.md \
    docs/superpowers/specs/2026-06-02-chat-message-reliability-design.md \
    docs/superpowers/specs/2026-07-29-attachment-ux-design.md
  rg -n \
    "F-CHAT-005|F-CHAT-005-frontend-attachment-validation\\.md" \
    docs
  ```

  Confirm from code, review and green verification that this is a real finding
  closure. Classify the July audit and older implementation-plan references as
  historical evidence and preserve their original facts. Record that
  `2026-07-29-attachment-ux-design.md` becomes the durable closure source and
  `overview.md` becomes the runtime/API source of truth. Stop instead of
  deleting if the audit finds another active source that still depends on the
  finding file.

- [ ] **Step 4: Update durable documentation and remove the closed finding.**

  In `overview.md`, replace “отправляет один файл” with an ordered five-file
  batch and replace the singular API path with:

  ```text
  /api/chat/messages/attachments
  ```

  Change the local cross-tenant smoke from one attachment to one two-file batch
  and require `attachments_count = 2` for one Chatwoot message. Delete
  `F-CHAT-005` and change the preserved reliability spec status so it no longer
  claims that finding is active. Add an `Implementation Status` note to
  `2026-07-29-attachment-ux-design.md` stating that Slice 1 closed
  `F-CHAT-005`, while Slices 2–3 remain planned. Do not rewrite historical audit
  conclusions and do not add an intermediate work-log entry.

- [ ] **Step 5: Run one focused independent security/load review.**

  Give the reviewer the Slice 1 diff and require review of:

  ```text
  pre-body Origin/auth/process/rate admission
  5-file and 40 MiB aggregate enforcement
  abort/finally slot release
  order-sensitive idempotency hash
  one Chatwoot request
  no binary database persistence
  singular route removal
  ```

  Fix every Critical or Important issue in one batch and rerun only affected
  targeted tests plus the browser scenario.

- [ ] **Step 6: Run the Slice 1 closure gate.**

  Activate/verify Node 24 first, then run:

  ```bash
  pnpm --dir backend exec vitest run \
    src/modules/chat-messages/attachmentSend.test.ts \
    src/modules/chat-messages/routes.test.ts \
    src/modules/chat-messages/service.test.ts \
    src/modules/chat-messages/service.conversation-recovery.test.ts \
    src/integrations/chatwoot/client.test.ts \
    src/app.test.ts \
    --no-file-parallelism
  pnpm --dir frontend exec vitest run \
    src/features/chat/lib/attachmentDraft.test.ts \
    src/features/chat/components/message-composer/useAttachmentDraft.test.tsx \
    src/features/chat/components/message-composer/ComposerAttachmentTray.test.tsx \
    src/features/chat/components/MessageComposer.test.tsx \
    src/features/chat/api/chatClient.attachments.test.ts \
    src/features/chat/pages/ChatPage.test.tsx \
    src/features/chat/pages/ChatPage.search-context-regression.test.tsx
  pnpm exec playwright test \
    tests/e2e/chat-attachments.spec.ts \
    tests/e2e/chat-read-model.spec.ts
  pnpm lint
  pnpm build
  pnpm exec prettier --check \
    docs/architecture/overview.md \
    docs/operations/local-cross-tenant-test-data.md \
    docs/superpowers/specs/2026-06-02-chat-message-reliability-design.md \
    docs/superpowers/specs/2026-07-29-attachment-ux-design.md
  git diff --check
  ```

  Expected: every command exits zero. Do not run unrelated production, Ops,
  Telegram or real Chatwoot mutation commands.

- [ ] **Step 7: Commit closure changes and request merge authorization.**

  ```bash
  git add tests/e2e/chat-attachments.spec.ts \
    tests/e2e/chat-read-model.spec.ts \
    docs/architecture/overview.md \
    docs/operations/local-cross-tenant-test-data.md \
    docs/superpowers/specs/2026-06-02-chat-message-reliability-design.md \
    docs/superpowers/specs/2026-07-29-attachment-ux-design.md
  git add -u docs/findings/F-CHAT-005-frontend-attachment-validation.md
  git commit -m "docs(chat): record attachment batch baseline"
  ```

  Report the exact review result, closure commands and branch status. Merge and
  push only after the user authorizes them.

---

## Slice 2 — Input And Transfer UX

After Slice 1 is merged, create
`feature/phase-attachment-input-transfer-ux` from updated `main`. Tasks 6–9
stay on that branch.

### Task 6: Add screenshot paste and file-only drag-and-drop

**Files:**

- Modify: `frontend/src/features/chat/lib/attachmentDraft.ts`
- Modify: `frontend/src/features/chat/lib/attachmentDraft.test.ts`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerTextarea.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Create: `frontend/src/features/chat/components/ChatAttachmentDropZone.tsx`
- Create: `frontend/src/features/chat/components/ChatAttachmentDropZone.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.test.tsx`

**Interfaces:**

- Clipboard file items enter `addFiles(files, 'clipboard')`.
- Dropped file entries enter `addFiles(files, 'drop')`.
- Text-only paste and dragged text retain browser-native behavior.
- Neither source invokes send.

- [ ] **Step 1: Write failing clipboard tests.**

  Dispatch a text-only paste and assert the textarea receives text. Dispatch a
  clipboard with an image `File` and assert:

  ```ts
  expect(screen.getByText(/screenshot-\d{8}-\d{6}\.png/)).toBeVisible()
  expect(onSendAttachmentBatch).not.toHaveBeenCalled()
  ```

  Include an image plus alternate HTML/text representations and prove only the
  file is consumed.

- [ ] **Step 2: Implement clipboard extraction and readable screenshot names.**

  Add:

  ```ts
  export function normalizePastedScreenshotFile(
    file: File,
    now: Date = new Date(),
  ): File
  ```

  Rename only generic clipboard image names such as `image.png` or an empty
  name to `screenshot-YYYYMMDD-HHmmss.<ext>`. In `onPaste`, call
  `preventDefault()` only when at least one file item is accepted for
  admission.

- [ ] **Step 3: Write failing drag-and-drop tests.**

  Assert file drag shows `Перетащите файлы сюда`, drop adds files and does not
  send. Assert `DataTransferItem.kind = 'string'` neither shows the overlay nor
  prevents default.

- [ ] **Step 4: Implement the bounded active-chat drop zone.**

  `ChatAttachmentDropZone` accepts:

  ```ts
  {
    children: ReactNode
    disabled: boolean
    onFiles: (files: File[]) => void
  }
  ```

  Maintain a drag-enter depth counter so child transitions do not flicker.
  Handle only `dataTransfer.items` whose `kind === 'file'`. Render one absolute
  overlay containing:

  ```text
  Перетащите файлы сюда
  До 5 файлов, общий размер до 40 МБ
  ```

- [ ] **Step 5: Run focused tests and commit.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/lib/attachmentDraft.test.ts \
    src/features/chat/components/MessageComposer.test.tsx \
    src/features/chat/components/ChatAttachmentDropZone.test.tsx
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add frontend/src/features/chat/lib/attachmentDraft.ts \
    frontend/src/features/chat/lib/attachmentDraft.test.ts \
    frontend/src/features/chat/components/message-composer/ComposerTextarea.tsx \
    frontend/src/features/chat/components/MessageComposer.tsx \
    frontend/src/features/chat/components/MessageComposer.test.tsx \
    frontend/src/features/chat/components/ChatAttachmentDropZone.tsx \
    frontend/src/features/chat/components/ChatAttachmentDropZone.test.tsx \
    frontend/src/features/chat/pages/ChatPage.tsx
  git commit -m "feat(chat): add paste and drop attachments"
  ```

### Task 7: Add the accessible mobile attachment source menu

**Files:**

- Create: `frontend/src/features/chat/components/message-composer/ComposerAttachmentMenu.tsx`
- Create: `frontend/src/features/chat/components/message-composer/ComposerAttachmentMenu.test.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerInputRow.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.test.tsx`

**Interfaces:**

- `Фото и видео`: `accept="image/*,video/*"` and `multiple`.
- `Камера`: `accept="image/*"`, `capture="environment"` and no `multiple`.
- `Файл`: common accepted formats and `multiple`.
- All selected files use the common admission function and explicit Send.

- [ ] **Step 1: Write the source-control contract test.**

  Open `Прикрепить файл` and assert three normal buttons. Trigger each hidden
  input and inspect:

  ```ts
  expect(mediaInput).toHaveAttribute('accept', 'image/*,video/*')
  expect(mediaInput).toHaveAttribute('multiple')
  expect(cameraInput).toHaveAttribute('accept', 'image/*')
  expect(cameraInput).toHaveAttribute('capture', 'environment')
  expect(cameraInput).not.toHaveAttribute('multiple')
  expect(fileInput).toHaveAttribute('multiple')
  ```

  Press Escape and prove focus returns to the paperclip button.

- [ ] **Step 2: Implement the accessible menu and focused inputs.**

  Render a labelled modal/bottom-sheet surface on narrow screens and a compact
  anchored menu on wider screens using the same semantic buttons. Do not use
  user-agent detection. Closing by action, Escape or backdrop restores focus.
  If the browser ignores `capture`, the native picker remains the fallback.

- [ ] **Step 3: Pass each source into common admission.**

  Use:

  ```ts
  onFilesSelected(files, 'picker')
  onFilesSelected(files, 'camera')
  ```

  Media library and general file input both use `picker`; camera uses
  `camera`. Reset each input after selection.

- [ ] **Step 4: Run focused tests and commit.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/components/message-composer/ComposerAttachmentMenu.test.tsx \
    src/features/chat/components/MessageComposer.test.tsx
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add frontend/src/features/chat/components/message-composer/ComposerAttachmentMenu.tsx \
    frontend/src/features/chat/components/message-composer/ComposerAttachmentMenu.test.tsx \
    frontend/src/features/chat/components/message-composer/ComposerInputRow.tsx \
    frontend/src/features/chat/components/MessageComposer.tsx \
    frontend/src/features/chat/components/MessageComposer.test.tsx
  git commit -m "feat(chat): add attachment source menu"
  ```

### Task 8: Add aggregate upload progress, bounded cancellation and manual retry

**Files:**

- Create: `frontend/src/features/chat/api/chatAttachmentTransport.ts`
- Create: `frontend/src/features/chat/api/chatAttachmentTransport.test.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Modify: `frontend/src/features/chat/api/chatClient.retry-after.test.ts`
- Modify: `frontend/src/features/chat/pages/useChatAttachmentSend.ts`
- Create: `frontend/src/features/chat/pages/useChatAttachmentSend.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatComposerDock.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.test.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerFeedback.tsx`

**Interfaces:**

- XHR owns only plural attachment POST.
- `withCredentials = true`, same-origin URL and ten-second current frontend
  request timeout remain.
- Cancel exists only in `uploading`; once upload body completes, state is
  `sending` and the button disappears.
- Cancel and controlled failure retain files, caption, reply and unchanged key.
- No automatic retry loop.

- [ ] **Step 1: Write XHR transport contract tests with a fake XHR.**

  Prove:

  ```ts
  expect(xhr.open).toHaveBeenCalledWith(
    'POST',
    '/api/chat/messages/attachments',
    true,
  )
  expect(xhr.withCredentials).toBe(true)
  expect(xhr.timeout).toBe(10_000)
  ```

  Emit `loadstart`, two `progress` events and upload `load`; expect:

  ```ts
  ;[
    { percent: 0, stage: 'preparing' },
    { percent: 25, stage: 'uploading' },
    { percent: 75, stage: 'uploading' },
    { percent: 100, stage: 'sending' },
  ]
  ```

  Assert JSON error parsing, `Retry-After`, unauthorized, network error,
  timeout and AbortSignal-triggered `xhr.abort()`.

- [ ] **Step 2: Extract shared Retry-After value parsing and implement XHR.**

  Change the existing parser to:

  ```ts
  export function parseRetryAfterSeconds(
    retryAfter: string | null,
    nowMs = Date.now(),
  ): number | null
  ```

  Make both fetch and XHR callers use it. XHR resolves only a successful
  `ChatSendResult`; non-2xx responses throw `ChatApiClientError` with the same
  fields as fetch. Network and timeout failures use `statusCode: 0`.

- [ ] **Step 3: Write hook tests for cancellation and retry state.**

  Start a send, emit `uploading`, call `cancelAttachmentUpload`, then assert:

  ```ts
  expect(abortController.signal.aborted).toBe(true)
  expect(result.current.transferState).toEqual({
    percent: null,
    stage: 'idle',
  })
  expect(result.current.sendErrorMessage).toBeNull()
  ```

  For backend failure, expect `stage: 'error'` and the draft-preserving copy.
  For `Retry-After: 7`, append `Попробуйте через 7 сек.`. Display retry values
  only from `1..3600`; larger values show the base message without a huge
  countdown.

- [ ] **Step 4: Implement hook/controller and composer status UI.**

  `useChatAttachmentSend` returns:

  ```ts
  {
    cancelAttachmentUpload: () => void
    clearSendError: () => void
    handleSendAttachmentBatch: (
      input: SendAttachmentBatchInput,
    ) => Promise<boolean>
    isSending: boolean
    sendErrorMessage: string | null
    transferState: AttachmentTransferState
  }
  ```

  Keep one `AbortController` ref only while a request is active. Show
  `Подготовка`, `Загрузка N%`, `Отправка` or `Ошибка` in one throttled
  `aria-live` region. Show `Отменить загрузку` only for `uploading`.

- [ ] **Step 5: Prove composer draft and key retention.**

  Extend `MessageComposer.test.tsx`:

  ```ts
  expect(screen.getByText('Загрузка 42%')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Отменить загрузку' }))
  expect(screen.getByText('invoice.pdf')).toBeVisible()
  expect(textarea).toHaveValue('Подпись')
  ```

  Submit again unchanged and assert the same `clientMessageKey`. Change one
  batch file and assert a new key.

- [ ] **Step 6: Run focused tests and commit.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/api/chatAttachmentTransport.test.ts \
    src/features/chat/api/chatClient.retry-after.test.ts \
    src/features/chat/pages/useChatAttachmentSend.test.tsx \
    src/features/chat/components/MessageComposer.test.tsx \
    src/features/chat/pages/ChatPage.test.tsx
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add frontend/src/features/chat/api/chatAttachmentTransport.ts \
    frontend/src/features/chat/api/chatAttachmentTransport.test.ts \
    frontend/src/features/chat/api/chatClient.ts \
    frontend/src/features/chat/api/chatClient.retry-after.test.ts \
    frontend/src/features/chat/pages/useChatAttachmentSend.ts \
    frontend/src/features/chat/pages/useChatAttachmentSend.test.tsx \
    frontend/src/features/chat/pages/ChatComposerDock.tsx \
    frontend/src/features/chat/components/MessageComposer.tsx \
    frontend/src/features/chat/components/MessageComposer.test.tsx \
    frontend/src/features/chat/components/message-composer/ComposerFeedback.tsx
  git commit -m "feat(chat): show and cancel attachment uploads"
  ```

### Task 9: Prove universal input UX and prepare the Slice 2 merge

**Files:**

- Modify: `tests/e2e/chat-attachments.spec.ts`
- Verify: all Slice 2 code and tests

**Interfaces:**

- Browser covers picker, paste, drop, narrow layout, progress, cancel and
  draft-preserving failure.
- Slice closure does not claim operating-system share-target support.

- [ ] **Step 1: Add real-browser paste, drop and narrow-layout scenarios.**

  In the page, construct a `ClipboardEvent` with a screenshot file and assert
  preview without POST. Construct a file-only `DataTransfer`, dispatch
  dragenter/drop and assert the overlay and preview. Dispatch dragged text and
  assert no overlay.

  Set a mobile viewport and assert five previews remain horizontally
  scrollable while the composer and all three source buttons remain usable.

- [ ] **Step 2: Add Chromium progress/cancel and failure-retention scenarios.**

  Use Chromium network throttling for the plural multipart request and a safe
  multi-megabyte generated file. Wait for `Загрузка`, cancel before upload
  body completion and assert the request is aborted and draft remains. In a
  separate mocked `503`/`Retry-After: 7` case, assert the draft remains and a
  manual retry reuses the same key.

- [ ] **Step 3: Run the focused browser and frontend gates.**

  Run:

  ```bash
  pnpm exec playwright test tests/e2e/chat-attachments.spec.ts
  pnpm --dir frontend exec vitest run \
    src/features/chat/lib/attachmentDraft.test.ts \
    src/features/chat/components/ChatAttachmentDropZone.test.tsx \
    src/features/chat/components/message-composer/ComposerAttachmentMenu.test.tsx \
    src/features/chat/components/MessageComposer.test.tsx \
    src/features/chat/api/chatAttachmentTransport.test.ts \
    src/features/chat/pages/useChatAttachmentSend.test.tsx \
    src/features/chat/pages/ChatPage.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 4: Perform focused UI/runtime review.**

  Review file-only event filtering, no automatic send, object-URL cleanup,
  accessible focus, progress announcement throttling, cancel timing, unchanged
  retry keys and narrow layout. Fix Critical/Important findings together and
  rerun only affected tests plus `chat-attachments.spec.ts`.

- [ ] **Step 5: Run the Slice 2 closure gate.**

  Run:

  ```bash
  pnpm lint
  pnpm build
  git diff --check
  ```

  Expected: every command exits zero. Slice 1 backend tests are not rerun
  because Slice 2 does not change the backend batch boundary.

- [ ] **Step 6: Commit closure evidence changes and request merge authorization.**

  ```bash
  git add tests/e2e/chat-attachments.spec.ts
  git commit -m "test(chat): cover convenient attachment inputs"
  ```

  Report the exact checks and branch status. Merge and push only after user
  authorization.

---

## Slice 3 — Installed PWA Share Target

After Slice 2 is merged, create `feature/phase-pwa-share-target` from updated
`main`. Tasks 10–14 stay on that branch.

### Task 10: Add the tenant manifest contract and typed pending-share store

**Files:**

- Modify: `backend/src/modules/tenants/routes.ts`
- Modify: `backend/src/modules/tenants/routes.test.ts`
- Modify: `frontend/src/features/offline/types.ts`
- Modify: `frontend/src/features/offline/offlineDatabase.ts`
- Modify: `frontend/src/features/offline/offlineStore.test.ts`
- Modify: `frontend/public/sw.js`
- Modify: `frontend/src/pwa/serviceWorkerAsset.testSupport.ts`
- Modify: `frontend/src/pwa/serviceWorkerAsset.test.ts`
- Modify: `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts`
- Modify: `frontend/src/pwa/serviceWorkerPushStaleMarkers.test.ts`
- Create: `frontend/src/features/chat/share-target/pendingShareDraftStore.ts`
- Create: `frontend/src/features/chat/share-target/pendingShareDraftStore.test.ts`

**Interfaces:**

- Manifest action is `/pwa/share-target`, method `POST`, enctype
  `multipart/form-data` and repeated field `attachments`.
- IndexedDB version becomes `3`; the only new store is
  `pending_share_drafts`.
- Store keys are opaque `draftId` values; records use the stable type above and
  the store has key path `draftId`.
- A unique compound `by_identity` index covers
  `[host, tenantSlug, userId]`; a non-unique `by_expiry` index covers
  `expiresAt`.
- Foreground reads, replacements and deletions require exact host, tenant,
  user, opaque ID and an unexpired record.

- [ ] **Step 1: Write the exact manifest assertion.**

  Extend the tenant manifest test:

  ```ts
  expect(response.json().share_target).toEqual({
    action: '/pwa/share-target',
    enctype: 'multipart/form-data',
    method: 'POST',
    params: {
      files: [
        {
          accept: [
            'image/png',
            'image/jpeg',
            'image/webp',
            '.png',
            '.jpg',
            '.jpeg',
            '.webp',
          ],
          name: 'attachments',
        },
      ],
      text: 'text',
      title: 'title',
    },
  })
  ```

  Prove two tenant hosts receive the same action on their own origin and keep
  different tenant PWA identities.

- [ ] **Step 2: Write database upgrade and store-scope tests.**

  Update the expected database version to `3` and expected store list to
  include `pending_share_drafts`. Assert that `by_identity` exists and is
  unique, while `by_expiry` exists and is non-unique. In the new store tests,
  prove exact indexed identity read, expired rejection/deletion, different-user
  rejection/deletion, file-list replacement and explicit deletion.

  For both replacement and deletion, start with a successful read, then pass a
  changed host, tenant or user to simulate logout/account switching before the
  mutation. Assert the old record is not replaced, no name/blob is returned and
  the mismatched record is deleted in the same transaction. Make a fake
  `getAll()` or unbounded primary-store cursor fail the test so exact identity
  operations cannot silently become full-store scans.

- [ ] **Step 3: Run focused tests and confirm RED.**

  Run:

  ```bash
  pnpm --dir backend exec vitest run \
    src/modules/tenants/routes.test.ts \
    --no-file-parallelism
  pnpm --dir frontend exec vitest run \
    src/features/offline/offlineStore.test.ts \
    src/features/chat/share-target/pendingShareDraftStore.test.ts \
    src/pwa/serviceWorkerAsset.test.ts \
    src/pwa/serviceWorkerBackgroundSync.test.ts \
    src/pwa/serviceWorkerPushStaleMarkers.test.ts
  ```

  Expected: FAIL because neither manifest nor store exists.

- [ ] **Step 4: Implement the manifest and typed store.**

  Add the exact object from Step 1 to `getTenantPwaManifest`.
  Add `pending_share_drafts` to `OFFLINE_STORES` and
  `PortalOfflineDatabase`. Bump both the typed app opener and
  `frontend/public/sw.js` to version `3`; whichever context upgrades first must
  create the identical store and indexes. Special-case the new store instead of
  letting the generic keyless-store loop create it:

  ```ts
  const store = database.createObjectStore('pending_share_drafts', {
    keyPath: 'draftId',
  })
  store.createIndex(
    PWA_SHARE_DRAFT_IDENTITY_INDEX,
    ['host', 'tenantSlug', 'userId'],
    { unique: true },
  )
  store.createIndex(PWA_SHARE_DRAFT_EXPIRY_INDEX, 'expiresAt')
  ```

  Declare the idb schema indexes explicitly:

  ```ts
  pending_share_drafts: {
    indexes: {
      by_expiry: string
      by_identity: [string, string, number]
    }
    key: string
    value: OfflinePendingShareDraftRecord
  }
  ```

  Export:

  ```ts
  export const PWA_SHARE_DRAFT_TTL_MS = 15 * 60 * 1000
  export const PWA_SHARE_DRAFT_PRUNE_LIMIT = 25
  export async function readPendingShareDraft(input: {
    draftId: string
    host: string
    now?: Date
    tenantSlug: string
    userId: number
  }): Promise<OfflinePendingShareDraftRecord | null>
  export async function replacePendingShareDraftFiles(
    input: PendingShareDraftScope & {
      files: readonly File[]
      now?: Date
    },
  ): Promise<void>
  export async function deletePendingShareDraft(
    input: PendingShareDraftScope & { now?: Date },
  ): Promise<void>
  export async function pruneExpiredPendingShareDrafts(
    now?: Date,
  ): Promise<number>
  ```

  `replacePendingShareDraftFiles` and `deletePendingShareDraft` perform their
  `get(draftId)`, exact scope/expiry validation and mutation in one `readwrite`
  transaction. A mismatched or expired record is deleted in that transaction;
  names and blobs are never returned to that caller. Identity lookup uses
  `by_identity`. Expiry pruning uses a `by_expiry` key cursor, deletes at most
  `PWA_SHARE_DRAFT_PRUNE_LIMIT` records per call and never materializes blob
  values.

- [ ] **Step 5: Run focused tests and commit.**

  Run the Step 3 commands. Expected: PASS.

  Commit:

  ```bash
  git add backend/src/modules/tenants/routes.ts \
    backend/src/modules/tenants/routes.test.ts \
    frontend/src/features/offline/types.ts \
    frontend/src/features/offline/offlineDatabase.ts \
    frontend/src/features/offline/offlineStore.test.ts \
    frontend/public/sw.js \
    frontend/src/pwa/serviceWorkerAsset.testSupport.ts \
    frontend/src/pwa/serviceWorkerAsset.test.ts \
    frontend/src/pwa/serviceWorkerBackgroundSync.test.ts \
    frontend/src/pwa/serviceWorkerPushStaleMarkers.test.ts \
    frontend/src/features/chat/share-target/pendingShareDraftStore.ts \
    frontend/src/features/chat/share-target/pendingShareDraftStore.test.ts
  git commit -m "feat(pwa): define bounded share target storage"
  ```

### Task 11: Receive and bound the system-share POST in the service worker

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/src/pwa/serviceWorkerAsset.testSupport.ts`
- Create: `frontend/src/pwa/serviceWorkerShareTarget.test.ts`
- Modify: `frontend/src/pwa/serviceWorkerAsset.test.ts`
- Modify: `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts`
- Modify: `frontend/src/pwa/serviceWorkerPushStaleMarkers.test.ts`

**Interfaces:**

- Intercepts only a request whose method is `POST`, origin is exact,
  pathname is exactly `/pwa/share-target`, mode is `navigate` and destination
  is `document`.
- Raw request hard limit is `40 MiB + 256 KiB`.
- Uses one in-process boolean admission for share parsing.
- Writes no more than one pending record per exact tenant/user identity.
- Redirects with `303` to
  `/app/chat?shareDraft=<opaque-id>` or a controlled `shareError` code.
- Makes no portal send API call.

- [ ] **Step 1: Extend the service-worker test support.**

  Support object-store `get`, `put`, `delete`, `index(name).get`,
  `index(name).getKey` and bounded index key-cursor iteration for the new store.
  Record all index lookups, writes and deletes so tests can assert no
  cross-store mutation or unbounded `getAll`/primary-store scan. Reuse the
  version-3 store/index definitions from Task 10 and assert the worker has not
  drifted from them.

  A script-created `Request` cannot set browser-owned navigation metadata
  through `RequestInit`. Add a test-only helper that keeps a real multipart
  request/body while overriding only the read-side `mode` and `destination`
  getters:

  ```ts
  export function createShareTargetNavigationRequest({
    destination = 'document',
    formData,
    mode = 'navigate',
    url = 'https://lk.provgroup.ru/pwa/share-target',
  }: {
    destination?: RequestDestination
    formData: FormData
    mode?: RequestMode
    url?: string
  }): Request {
    const request = new Request(url, { body: formData, method: 'POST' })

    return new Proxy(request, {
      get(target, property) {
        if (property === 'destination') return destination
        if (property === 'mode') return mode

        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  ```

  This facade exists only in `serviceWorkerAsset.testSupport.ts`; production
  code continues to receive the browser's native navigation request.

- [ ] **Step 2: Write successful reception and no-auto-send tests.**

  Use `createShareTargetNavigationRequest` with a real `FormData` containing two
  image files, seed exact `last_active_identities` and no signout, dispatch the
  fetch event and assert:

  ```ts
  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toMatch(
    /^\/app\/chat\?shareDraft=[0-9a-f-]+$/,
  )
  expect(putCalls).toContainEqual(
    expect.objectContaining({
      storeName: 'pending_share_drafts',
      value: expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({ fileName: 'screen.png' }),
        ]),
      }),
    }),
  )
  expect(fetch).not.toHaveBeenCalledWith(
    expect.stringContaining('/api/chat/messages/attachments'),
    expect.anything(),
  )
  ```

- [ ] **Step 3: Write bounded failure and identity tests.**

  Add cases for:

  ```text
  GET /pwa/share-target                   -> not intercepted
  cross-origin request                    -> not intercepted
  mode same-origin + destination document -> not intercepted
  mode navigate + empty destination       -> not intercepted
  same-origin navigation POST near path   -> not intercepted
  missing readable body                   -> shareError=body_unavailable
  raw limit overflow                      -> reader cancelled; no draft write
  no last-active identity                 -> shareError=session_required
  exact local signout                     -> shareError=session_required
  unsupported type                        -> shareError=type_not_allowed
  sixth file                              -> shareError=count_exceeded
  aggregate over 40 MiB                   -> shareError=batch_too_large
  second concurrent parse                 -> shareError=busy
  valid append to same identity           -> one ordered combined draft
  append overflow                         -> existing draft retained unchanged
  ```

- [ ] **Step 4: Implement bounded raw-body reception.**

  Insert the exact share-target branch before the existing early return for
  non-GET requests:

  ```js
  const isPwaShareTargetNavigation =
    request.method === 'POST' &&
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname === '/pwa/share-target' &&
    request.mode === 'navigate' &&
    request.destination === 'document'
  ```

  Only that branch calls `event.respondWith(receivePwaShareTarget(request))`;
  every other non-GET request keeps the current pass-through behavior.

  Add constants matching Slice 1. Read through
  `request.body.getReader()` into chunks, increment before storing each chunk
  and cancel immediately on overflow. Parse only a newly constructed bounded
  request:

  ```js
  const boundedRequest = new Request(request.url, {
    body: new Blob(chunks, { type: contentType }),
    headers: { 'Content-Type': contentType },
    method: 'POST',
  })
  const formData = await boundedRequest.formData()
  ```

  Validate only `File` values from `attachments`, PNG/JPEG/WebP type and name,
  five files and `40 MiB`. The service worker never falls back to unbounded
  `request.formData()`.

- [ ] **Step 5: Implement identity-scoped append/replace and cleanup.**

  Before writing, read the host identity and exact signout marker. Prune at
  most `PWA_SHARE_DRAFT_PRUNE_LIMIT` expired keys through `by_expiry`, then use
  one exact `by_identity` lookup to find at most one unexpired record for the
  same identity. Never call `getAll` or scan the primary store. Append in share
  order only if the combined result fits. Otherwise retain the old record and
  redirect with an overflow code.

  Wrap the whole parse/write flow:

  ```js
  if (shareReceptionActive) return shareErrorRedirect('busy')
  shareReceptionActive = true
  try {
    return await receivePwaShareTarget(request)
  } finally {
    shareReceptionActive = false
  }
  ```

- [ ] **Step 6: Run focused service-worker tests and commit.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/pwa/serviceWorkerShareTarget.test.ts \
    src/pwa/serviceWorkerAsset.test.ts \
    src/pwa/serviceWorkerBackgroundSync.test.ts \
    src/pwa/serviceWorkerPushStaleMarkers.test.ts
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add frontend/public/sw.js \
    frontend/src/pwa/serviceWorkerAsset.testSupport.ts \
    frontend/src/pwa/serviceWorkerShareTarget.test.ts \
    frontend/src/pwa/serviceWorkerAsset.test.ts \
    frontend/src/pwa/serviceWorkerBackgroundSync.test.ts \
    frontend/src/pwa/serviceWorkerPushStaleMarkers.test.ts
  git commit -m "feat(pwa): receive bounded system share drafts"
  ```

### Task 12: Require live auth and explicit destination before importing a share

**Files:**

- Create: `frontend/src/features/chat/share-target/usePwaShareTargetDraft.ts`
- Create: `frontend/src/features/chat/share-target/usePwaShareTargetDraft.test.tsx`
- Create: `frontend/src/features/chat/share-target/PwaShareDestinationDialog.tsx`
- Create: `frontend/src/features/chat/share-target/PwaShareDestinationDialog.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/useChatAttachmentSend.ts`
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.test.tsx`

**Interfaces:**

- Reads `shareDraft` and `shareError` from the current `/app/chat` query.
- Does not read names/blobs while `sessionSource !== 'online'`.
- One writable thread still requires a visible confirmation.
- Several writable threads require an explicit selected thread.
- Confirmed files enter `addFiles(files, 'share-target')`.
- `ChatPage` retains the immutable submitted `AttachmentDraftItem[]` until the
  canonical send result and gives only that snapshot to local share lifecycle
  callbacks.
- Send still uses the normal plural attachment API.
- No draft ID, item ID or `source` field enters the HTTP multipart payload.

- [ ] **Step 1: Write live-auth and identity tests.**

  Start with `sessionSource: 'cached'` and assert `refreshSession()` runs while
  no file name appears. Change to `online` for the same tenant/user and assert
  the store read occurs. Supply another user's record and assert deletion plus
  no exposed name.

  After the initial valid read, switch the live session to another user before
  `replacePendingShareDraftFiles` and before `deletePendingShareDraft`. Assert
  each lifecycle action resolves its scope from the current live session at
  execution time, passes the full `{ draftId, host, tenantSlug, userId }` tuple
  and never mutates the record as the stale identity.

- [ ] **Step 2: Write destination-dialog tests.**

  With one thread, assert the title and a selected destination plus
  `Продолжить`; no file sends. With private and group threads, assert no
  continue until one is chosen. `Отменить` deletes the record and removes the
  query parameter.

  Add admission cases:

  ```text
  all shared files rejected      -> original stored draft remains; show summary
  some shared files accepted     -> persist only accepted share subset
  picker + share items imported  -> retain source on each draft item
  ```

- [ ] **Step 3: Implement the foreground hook state machine.**

  Return:

  ```ts
  {
    afterCanonicalAttachmentBatchSend: (
      sentItems: readonly AttachmentDraftItem[],
    ) => Promise<void>
    cancelShareDraft: () => Promise<void>
    confirmDestination: (threadId: string) => Promise<void>
    errorMessage: string | null
    pendingDraft: OfflinePendingShareDraftRecord | null
    selectedDestinationThreadId: string | null
    setSelectedDestinationThreadId: (threadId: string) => void
    syncRemainingShareDraftItems: (
      remainingItems: readonly AttachmentDraftItem[],
    ) => Promise<void>
    status:
      | 'idle'
      | 'checking-session'
      | 'choosing-destination'
      | 'imported'
      | 'error'
  }
  ```

  On confirm, verify the thread exists in the current writable thread list,
  select/navigate to it, reconstruct `File` objects and call common admission.
  If admission accepts none, retain the stored record and keep the controlled
  error state. If it accepts a subset, persist exactly the accepted
  `source === 'share-target'` files before removing `shareDraft`/`shareError`
  from the URL. Do not delete the stored draft yet.

  Serialize foreground replace/delete actions in invocation order. Immediately
  before each queued mutation, resolve the current live online host/tenant/user
  again and pass that exact scope to the transactional store API. If there is
  no live session, expose no record data and let the existing logout cleanup own
  deletion.

- [ ] **Step 4: Integrate normal preview, edit and explicit Send.**

  Render `PwaShareDestinationDialog` above the chat only in
  `choosing-destination`. Once imported, the normal tray supports caption,
  individual removal and clear. No code path calls send from the hook or
  dialog.

  `ChatPage` passes `SendAttachmentBatchInput.items`; the send hook snapshots
  them before its first `await`, maps only their files to the transport and
  calls `afterCanonicalAttachmentBatchSend(submittedItems)` only after a
  canonical success. A mixed picker/share test proves the callback receives the
  original share item IDs/sources while the `FormData` contains only repeated
  `attachments`.

  `afterCanonicalAttachmentBatchSend` filters `source === 'share-target'` and
  deletes the exact stored record when at least one such item was sent. Cleanup
  failure must not turn an already canonical server success into a retryable
  send failure; the unseen record remains bounded by expiry.

  On every explicit remove/clear, `ChatPage` passes the post-mutation immutable
  item list to `syncRemainingShareDraftItems`. No remaining share items means
  exact deletion; otherwise replace the stored files with only the remaining
  share subset so reload cannot resurrect removed files. Picker-only changes do
  not write IndexedDB.

- [ ] **Step 5: Run focused tests and commit.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/chat/share-target/pendingShareDraftStore.test.ts \
    src/features/chat/share-target/usePwaShareTargetDraft.test.tsx \
    src/features/chat/share-target/PwaShareDestinationDialog.test.tsx \
    src/features/chat/components/MessageComposer.test.tsx \
    src/features/chat/pages/ChatPage.test.tsx
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add frontend/src/features/chat/share-target/usePwaShareTargetDraft.ts \
    frontend/src/features/chat/share-target/usePwaShareTargetDraft.test.tsx \
    frontend/src/features/chat/share-target/PwaShareDestinationDialog.tsx \
    frontend/src/features/chat/share-target/PwaShareDestinationDialog.test.tsx \
    frontend/src/features/chat/pages/ChatPage.tsx \
    frontend/src/features/chat/pages/ChatPage.test.tsx \
    frontend/src/features/chat/pages/useChatAttachmentSend.ts \
    frontend/src/features/chat/components/MessageComposer.tsx \
    frontend/src/features/chat/components/MessageComposer.test.tsx
  git commit -m "feat(pwa): confirm shared attachment destination"
  ```

### Task 13: Close expiry, logout and different-user cleanup boundaries

**Files:**

- Modify: `frontend/src/features/offline/offlineStore.ts`
- Modify: `frontend/src/features/offline/offlineStore.test.ts`
- Modify: `frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx`
- Modify: `frontend/src/features/chat/share-target/usePwaShareTargetDraft.ts`
- Modify: `frontend/src/features/chat/share-target/usePwaShareTargetDraft.test.tsx`
- Modify: `frontend/public/sw.js`
- Modify: `frontend/src/pwa/serviceWorkerShareTarget.test.ts`

**Interfaces:**

- `clearCurrentUserOfflineData` deletes exact user's pending share drafts.
- Explicit local signout preserves only the signout marker, never shared blobs.
- App startup and worker activation prune only expired keys through the
  dedicated store's `by_expiry` index, at most 25 per invocation.
- Expiry and different-user checks occur before names/previews.

- [ ] **Step 1: Write exact cleanup regression tests.**

  Seed two users' drafts. Run exact user cleanup and assert only that user's
  record is deleted through `by_identity`. Run local-device signout and assert
  no shared blob remains. Seed 26 expired records and assert app startup or
  worker activation deletes only 25 on the first call and the remainder on the
  next call without loading blob values.

- [ ] **Step 2: Add the new store to current-user cleanup.**

  Include `pending_share_drafts` in the existing readwrite transaction. Use
  `by_identity.getKey([host, tenantSlug, userId])` and delete at most that one
  key; do not cursor the primary store, clear the whole store or touch another
  user.

- [ ] **Step 3: Add bounded startup and activation pruning.**

  `usePwaShareTargetDraft` calls `pruneExpiredPendingShareDrafts()` once on
  mounted chat startup. Service-worker activation prunes only
  `pending_share_drafts` before claiming clients. Both paths use a
  `by_expiry` key cursor with an inclusive `now.toISOString()` upper bound and
  stop after `PWA_SHARE_DRAFT_PRUNE_LIMIT` deletions. A direct identity/draft
  read deletes an encountered malformed record; global cleanup never scans or
  materializes unrelated blob values.

- [ ] **Step 4: Run cleanup and auth tests.**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run \
    src/features/offline/offlineStore.test.ts \
    src/features/auth/lib/AuthSessionProvider.offline.test.tsx \
    src/features/chat/share-target/usePwaShareTargetDraft.test.tsx \
    src/pwa/serviceWorkerShareTarget.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit cleanup boundaries.**

  ```bash
  git add frontend/src/features/offline/offlineStore.ts \
    frontend/src/features/offline/offlineStore.test.ts \
    frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx \
    frontend/src/features/chat/share-target/usePwaShareTargetDraft.ts \
    frontend/src/features/chat/share-target/usePwaShareTargetDraft.test.tsx \
    frontend/public/sw.js \
    frontend/src/pwa/serviceWorkerShareTarget.test.ts
  git commit -m "fix(pwa): scope and expire shared attachment drafts"
  ```

### Task 14: Complete PWA runtime evidence, stable docs and program closure

**Files:**

- Modify: `tests/e2e/chat-attachments.spec.ts`
- Modify: `tests/e2e/pwa-runtime-smoke.spec.ts`
- Create: `docs/operations/pwa-share-target-smoke.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/architecture/decisions.md`
- Modify: `docs/roadmap/implementation-plan.md`
- Modify: `docs/roadmap/work-log.md`
- Modify: `docs/superpowers/specs/2026-07-29-attachment-ux-design.md`
- Verify: all attachment and PWA share-target code

**Interfaces:**

- Browser proves no automatic send and explicit destination.
- Operations smoke covers actual installed-app registration on supported
  Android Chromium and Windows Edge/Chrome.
- Architecture decision `D-022` receives only the narrow 15-minute handoff
  exception.
- Work log receives one completed attachment UX baseline entry.

- [ ] **Step 1: Add browser-level manifest and foreground handoff coverage.**

  Assert the tenant manifest's exact `share_target`. Seed an identity-scoped
  pending draft and navigate to `/app/chat?shareDraft=<id>`. Assert the
  destination dialog, no send request, explicit selection, normal preview and
  a send only after clicking Send. Repeat with a different user and assert no
  name or preview is exposed.

- [ ] **Step 2: Write and execute the installed-PWA smoke checklist.**

  `pwa-share-target-smoke.md` must contain exact checks:

  ```text
  Android Chromium installed PWA:
  1. Share one PNG screenshot from Photos to the tenant portal.
  2. Confirm destination UI appears and no message exists in Chatwoot.
  3. Remove/re-add, enter caption, press Send.
  4. Confirm one Chatwoot message and portal draft deletion.

  Windows Edge/Chrome installed PWA:
  1. Share one PNG and one JPEG from Explorer/Photos.
  2. Confirm one ordered draft, explicit chat selection and no auto-send.
  3. Press Send and confirm one message with two attachments.

  iPhone/iPad fallback:
  1. Confirm portal is not advertised as a web share target.
  2. Confirm Photos/Camera/File picker remains usable.
  ```

  Record device/browser versions and pass/fail without client file names. If a
  required OS/device is unavailable, create a focused finding that names only
  the missing platform smoke and report that runtime evidence as blocked; do
  not claim that platform verified.

- [ ] **Step 3: Update stable architecture and roadmap docs.**

  Update `overview.md` with picker/paste/drop/mobile/progress plus the bounded
  share handoff. Amend `D-022` with:

  ```text
  A 15-minute tenant/user-scoped pending system-share image draft is the only
  local binary staging exception. It is not an outbox, requires live auth and
  explicit destination/Send, and is deleted on success, cancel, signout,
  mismatch or expiry.
  ```

  Mark the confirmed follow-up completed in `implementation-plan.md`. Add one
  concise work-log baseline entry covering the whole attachment UX program,
  and replace the single `Recommended Next Step` with the then-current actual
  priority. Change the design status to implemented only after all closure
  evidence is complete.

- [ ] **Step 4: Perform focused independent security/privacy review.**

  Give the reviewer the full Slice 3 diff and require:

  ```text
  raw stream bounded before form decoding
  one active parse and one pending draft per identity
  exact host/tenant/user binding
  signout, mismatch and expiry deletion
  names hidden until live auth
  no automatic send
  no attachment outbox or Chatwoot authority in browser
  no normal attachment route intercepted/cached by the worker
  ```

  Fix every Critical/Important issue in one batch and rerun affected focused
  tests plus both browser specs.

- [ ] **Step 5: Run the final attachment-program gate once.**

  Run:

  ```bash
  pnpm --dir backend exec vitest run \
    src/modules/tenants/routes.test.ts \
    src/modules/chat-messages/attachmentSend.test.ts \
    src/modules/chat-messages/routes.test.ts \
    src/modules/chat-messages/service.test.ts \
    src/integrations/chatwoot/client.test.ts \
    --no-file-parallelism
  pnpm --dir frontend test
  pnpm exec playwright test \
    tests/e2e/chat-attachments.spec.ts \
    tests/e2e/pwa-runtime-smoke.spec.ts
  pnpm test:docs
  pnpm lint
  pnpm build
  pnpm exec prettier --check \
    docs/operations/pwa-share-target-smoke.md \
    docs/architecture/overview.md \
    docs/architecture/decisions.md \
    docs/roadmap/implementation-plan.md \
    docs/roadmap/work-log.md \
    docs/superpowers/specs/2026-07-29-attachment-ux-design.md
  git diff --check
  ```

  Expected: every automated command exits zero. Do not rerun Ops deployment
  tests because this program does not change deployment scripts.

- [ ] **Step 6: Verify exact final-tree ownership and clean-checkout build.**

  Inspect:

  ```bash
  git status --short
  git diff --stat main...HEAD
  git diff --check main...HEAD
  ```

  Verify every changed file belongs to Slice 3. Before merge, verify the exact
  branch commit in a clean checkout/worktree with:

  ```bash
  pnpm lint
  pnpm build
  pnpm exec playwright test \
    tests/e2e/chat-attachments.spec.ts \
    tests/e2e/pwa-runtime-smoke.spec.ts
  ```

- [ ] **Step 7: Commit stable closure and request merge authorization.**

  ```bash
  git add tests/e2e/chat-attachments.spec.ts \
    tests/e2e/pwa-runtime-smoke.spec.ts \
    docs/operations/pwa-share-target-smoke.md \
    docs/architecture/overview.md \
    docs/architecture/decisions.md \
    docs/roadmap/implementation-plan.md \
    docs/roadmap/work-log.md \
    docs/superpowers/specs/2026-07-29-attachment-ux-design.md
  git commit -m "docs(chat): close attachment UX program"
  ```

  Report automated results, installed-platform smoke results or the exact
  documented blocker, review outcome and branch status. Merge and push only
  after user authorization.

## Plan Self-Review

- **Spec coverage:** Tasks 1–5 cover ordered batch API, backend bounds,
  idempotency, Chatwoot repeated parts, local validation, previews, removal,
  count/size and multi-file picker. Tasks 6–9 cover paste, drop, mobile sources,
  progress, cancellation and retry. Tasks 10–14 cover tenant manifest,
  bounded share reception, identity/auth, destination, cleanup, platform smoke
  and durable docs.
- **Authority:** Every delivery still crosses the authenticated tenant-scoped
  portal backend; only the installed-PWA handoff stores short-lived local
  images.
- **Load:** One batch remains one DB rate-limit mutation, one ledger lifecycle
  and one Chatwoot call; memory remains bounded by five files, `40 MiB` and two
  active backend requests. Pending-share identity lookup is indexed and expiry
  cleanup visits at most 25 keys without loading every blob.
- **Type consistency:** `AttachmentDraftItem`, `SendAttachmentBatchInput`,
  `AttachmentTransferState`, `PortalAttachmentUpload[]` and
  `OfflinePendingShareDraftRecord` use the same names in all producing and
  consuming tasks. The UI send contract retains item ID/source; the HTTP
  contract contains only ordered `File[]`.
- **No automatic send:** Picker, paste, drop, camera and system share end at
  preview/destination state; only the existing explicit Send action invokes
  `sendChatAttachments`.
- **Documentation lifecycle:** `F-CHAT-005` closes only in Slice 1 after
  verification and a docs-preservation audit; its current closure source
  replaces the active finding while historical audit evidence remains.
  `D-022` changes only when the PWA exception is built; the work log changes
  once at full program closure.
- **Placeholder scan:** The plan contains exact files, interfaces, limits,
  commands, assertions, copy and conditional blocker handling; no undefined
  implementation step is delegated to the executor.
