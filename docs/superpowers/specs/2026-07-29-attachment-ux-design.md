# Attachment UX Design

## Status

Direction approved by the user on `2026-07-29`. This document is the written
design and implementation source of truth.

The feature is a confirmed chat follow-up, not a silent expansion of the
current operations roadmap.

## Implementation Status

Slices 1–3 are code-complete, reviewed and covered by automated checks as of
`2026-07-29`. They establish the ordered five-file/40 MiB batch boundary,
plural portal API, compact composer tray, early browser validation, paste and
file-only drop, mobile attachment sources, aggregate upload progress, bounded
cancellation, manual draft-preserving retry and a 15-minute identity-scoped
installed-PWA share handoff. One batch remains one canonical Chatwoot message;
system share still requires live auth, explicit destination and the normal
Send action. Slice 1 also closed `F-CHAT-005`.

The design is not marked fully platform-verified because real installed-PWA
registration smoke on Android Chromium and Windows Edge/Chrome, plus the
iPhone/iPad fallback check, is blocked by unavailable devices and tracked in
`F-PWA-006`. The `Current Baseline` section below preserves the
pre-implementation state that motivated this design.

## Goal

Make attachment sending in the customer portal feel natural on desktop and
mobile while preserving the portal's auth, tenant, load and Chatwoot authority
boundaries.

The target user can:

- select and send several files in one message;
- paste a screenshot or other supported file into the composer;
- drag files into the chat on desktop;
- choose photos, camera or files through clear mobile controls;
- inspect, remove and retry attachments before sending;
- see aggregate upload progress and stop an upload while its body is still
  being transferred;
- share a screenshot to the installed portal PWA from the operating-system
  share sheet where Web Share Target is supported.

No pasted, dropped, selected or system-shared file is sent automatically.

## User Problems

The accepted product problems are:

1. The composer accepts only one attachment.
2. The composer cannot turn files from the clipboard into attachments.
3. A screenshot cannot be shared directly to the installed portal from another
   application.
4. File constraints are discovered too late, after upload has already started.
5. The current single-file preview gives no batch count, aggregate size,
   individual removal, upload progress or cancellation.

No reliable platform distribution is available for the reported complaints.
The design therefore makes file picker, paste and drag-and-drop the universal
baseline and treats operating-system share integration as progressive
enhancement.

## Current Baseline

The current portal is single-file at every write boundary:

- `frontend/src/features/chat/components/MessageComposer.tsx` stores
  `File | null`;
- `frontend/src/features/chat/components/message-composer/ComposerInputRow.tsx`
  reads only `event.target.files?.[0]`;
- `frontend/src/features/chat/api/chatClient.ts` appends one `attachment` part;
- `backend/src/modules/chat-messages/routes.ts` allows and buffers one file;
- `backend/src/modules/chat-messages/service.ts` normalizes and hashes one file;
- `backend/src/integrations/chatwoot/client.ts` appends one
  `attachments[]` part.

The read model already supports several attachments on one Chatwoot message:

- Chatwoot payload mapping returns an attachment array;
- portal message types contain an attachment array;
- transcript and media views iterate message attachments.

The locally inspected Chatwoot `v4.15.1` source also supports an attachment
array and enforces an upstream limit of 15 attachments per message:

- `../chatwoot-ce-stable/app/builders/messages/message_builder.rb`;
- `../chatwoot-ce-stable/app/models/message.rb`.

The portal intentionally chooses a lower limit of five.

The existing security baseline must remain:

- admission happens before multipart body reads;
- a user receives five attachment-batch starts per minute across chats;
- one backend process holds at most two active attachment requests;
- a request has five minutes to finish arriving;
- one current request can materialize at most 40 MiB of attachment data;
- Chatwoot remains system of record for sent message binaries.

## Closed Finding

Attachment UX Slice 1 closed `F-CHAT-005`: the browser now validates empty
files, the 40 MiB limit, file-name length and unsupported types before upload,
including voice files. Backend validation remains authoritative.

These unrelated deferred findings remain out of scope:

- `F-CHAT-UI-003` audio attachment narrow-width rendering;
- `F-IOS-001` iOS keyboard viewport panning;
- `F-PWA-003` closed-app text Background Sync recovery.

## External Platform Baseline

- The Clipboard Events standard exposes non-text clipboard data through
  `ClipboardEvent.clipboardData.items` and `.files`. A user-initiated paste
  handler can therefore accept screenshots without requesting broad
  asynchronous clipboard permission:
  <https://www.w3.org/TR/clipboard-apis/>.
- Web Share Target is declared through the installed PWA manifest and uses a
  `POST multipart/form-data` action for files:
  <https://wicg.github.io/web-share-target/>.
- Installed Chrome/Chromium PWAs can register as system share targets on
  supported platforms:
  <https://developer.chrome.com/docs/capabilities/web-apis/web-share-target>.
- Windows also documents PWA share targets through the web app manifest:
  <https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/integrate-sharesheet-receive>.
- Web Share Target is not a universal browser baseline. The portal must never
  hide or weaken file picker, paste and drag-and-drop fallback paths when share
  target registration is unavailable.
- Fastify multipart `parts()` processes parts serially and permits per-request
  file, field and part limits. Every file stream must be consumed or terminated:
  <https://github.com/fastify/fastify-multipart>.

## Accepted Product Decisions

### One Batch Is One Message

Up to five selected files are sent to Chatwoot as attachments of one logical
message.

The message has:

- one `clientMessageKey`;
- one destination thread;
- one optional caption;
- one optional reply target;
- one ordered attachment list.

The portal does not create one Chatwoot message per file. That alternative
would create noisy transcripts, multiply external calls and rate-limit
consumption, and introduce partial-send behavior.

### Limits

The initial production limits are:

| Limit                            |                                           Value |
| -------------------------------- | ----------------------------------------------: |
| Files per message                |                                               5 |
| Aggregate file bytes per message |                                          40 MiB |
| Individual file bytes            | 40 MiB, also constrained by the aggregate limit |
| File-name length                 |                                  255 characters |
| Caption length                   |                                 4000 characters |
| Attachment batch starts          |                5 per minute per tenant and user |
| Active attachment requests       |                           2 per backend process |
| Complete request receipt timeout |                                       5 minutes |

The five-file portal limit stays below Chatwoot's locally verified 15-file
limit and leaves room for future Chatwoot configuration differences.

The 40 MiB limit applies to the sum of all files, not to every file
independently. Two active requests therefore keep the current raw buffered-file
ceiling near 80 MiB per backend process. Parser and multipart overhead remain
additional but bounded by the route body limit.

### Online-Only Delivery

Attachments and voice messages remain online-only:

- no attachment outbox;
- no background attachment upload;
- no automatic retry after closing the app;
- no promise that an attachment will send while the device sleeps.

The composer keeps an in-memory draft after a foreground error so the user can
retry without selecting files again. A normal page reload may discard that
draft.

The later PWA share-target slice introduces one narrow, short-lived local draft
exception only for receiving a system share. It does not introduce offline or
background send authority.

### Explicit Confirmation

Every source follows:

```text
select / paste / drop / system share
                 ↓
        validate and preview
                 ↓
       user selects destination
                 ↓
        user presses Send
                 ↓
       portal backend authority
                 ↓
              Chatwoot
```

For an already open chat, the current writable thread remains selected. A
system share launch must explicitly show or confirm the destination before
send, because the portal may contain private and group chats.

## Considered Approaches

### A. One Chatwoot Message With Several Attachments — Selected

Advantages:

- matches the user's mental model of one batch;
- uses one backend request and one Chatwoot message create;
- keeps one caption and reply target;
- avoids partial sequences of separately created messages;
- preserves the existing attachment-array read model.

Cost:

- requires a coordinated frontend, portal API, send-ledger and Chatwoot-client
  contract change.

### B. Send Each File As A Separate Message — Rejected

Advantages:

- smaller backend change;
- reuses the current single-file route.

Rejected because it:

- creates several transcript messages;
- repeats or loses caption/reply semantics;
- causes partial success when a later file fails;
- consumes several rate-limit operations and Chatwoot calls;
- makes retry and cancellation harder to explain.

### C. Upload To Portal Object Storage Before Chatwoot — Deferred

Advantages:

- could support resumable and background uploads.

Deferred because it:

- introduces portal-owned chat binary storage and cleanup;
- duplicates Chatwoot's system-of-record role;
- needs migrations, object lifecycle, reconciliation and more operator work;
- is unnecessary for a five-file, 40 MiB online-only batch.

## Visual UX Decision

Three presentation patterns were considered:

1. A vertical list is very clear but makes the composer excessively tall.
2. A separate modal has room for details but interrupts typing and reply flow.
3. A compact horizontal preview tray keeps the current composer context and is
   sufficient for at most five files.

The compact tray is selected.

### Composer Wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ [🖼 x] [📄 report.pdf x] [🖼 x]        3/5 · 18.4 МБ  Очистить │
│                                                              │
│ Подпись к файлам…                              [скрепка] [➤] │
└──────────────────────────────────────────────────────────────┘
```

Rules:

- image attachments show small object-URL thumbnails;
- other files show a type icon, truncated name and size;
- every tile has an accessible remove action;
- `Очистить` appears when at least two files are selected;
- `N/5 · total size` is always visible for a batch;
- the tray scrolls horizontally instead of increasing composer height;
- object URLs are revoked after removal, successful send and unmount;
- selection order is preserved; manual reordering is not part of this scope.

### Drag-And-Drop Wireframe

```text
┌──────────────────────── current chat ────────────────────────┐
│                                                              │
│          Перетащите файлы сюда                               │
│          До 5 файлов, общий размер до 40 МБ                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The overlay appears only while the pointer carries files over the active chat.
Dragging selected text or transcript content must not trigger it.

### Mobile Attachment Menu

```text
┌──────────── Прикрепить ────────────┐
│ Фото и видео                       │
│ Камера                             │
│ Файл                               │
└────────────────────────────────────┘
```

- `Фото и видео` uses a multiple media picker.
- `Камера` uses a capture-capable image input where supported and accepts one
  new capture at a time.
- `Файл` uses a multiple file picker with the portal's supported formats.
- Unsupported distinctions may fall back to the browser's native picker.

## Slice A — Attachment Batch Foundation

### Frontend Draft Model

Replace `selectedAttachment: File | null` with a bounded draft collection.

A draft item contains at least:

```text
id
file
source: picker | clipboard | drop | camera | share-target
```

Preview URLs and formatted labels are derived UI resources, not persisted
authority.

All sources call one attachment-draft admission function. It:

1. preserves incoming order;
2. removes exact duplicates already present in the current draft;
3. validates each file;
4. enforces five files after combining old and new selection;
5. enforces 40 MiB aggregate bytes;
6. returns accepted files and clear Russian rejection messages.

Duplicate detection is a UX safeguard based on file name, MIME type, size and
`lastModified`. Backend correctness and idempotency must not depend on this
heuristic.

### Frontend Validation

Before an upload starts, reject:

- empty files;
- an empty file name;
- file names longer than 255 characters;
- unsupported MIME/extension combinations when the browser supplies enough
  information;
- any individual file over 40 MiB;
- a combined batch over 40 MiB;
- a sixth file.

Backend repeats all validation and remains authoritative.

One invalid candidate does not discard valid files already in the draft.
When several new files are selected, valid files that fit are added and all
rejections are summarized without five separate toast storms.

Voice recorder output uses the same single-file validation function before
send. Voice remains its own immediate single-file attachment batch and cannot
be mixed with a selected document batch.

### Portal API Contract

Replace the single-file portal route with:

```text
POST /api/chat/messages/attachments
Content-Type: multipart/form-data
```

Form fields:

```text
clientMessageKey: string
threadId: string
content: optional string
replyToMessageId: optional positive integer
attachments: repeated file field, 1..5 values
```

The old singular route and single-file frontend/backend readers and writers are
removed in the same scope. The project does not preserve portal-owned API
backward compatibility.

The response remains the existing `ChatSendResult` containing one canonical
message whose `attachments` array contains the accepted files.

### Multipart Parsing

The route keeps admission ordering:

1. same-origin and tenant checks;
2. authenticated portal user resolution;
3. process-wide active upload admission;
4. tenant/user attachment-batch rate limit;
5. multipart parsing;
6. file validation and aggregate validation;
7. writable thread/reply authority checks;
8. one Chatwoot message create;
9. release active admission in `finally`.

Multipart limits:

```text
files: 5
fields: 5
parts: 10
fileSize: 40 MiB
bodyLimit: 40 MiB + bounded multipart overhead
```

Files are consumed serially from `request.parts()`. The parser may retain up to
five buffers, but their aggregate bytes cannot exceed the existing request
limit.

Controlled errors include:

- `attachment_required`;
- `attachment_count_exceeded`;
- `attachment_batch_too_large`;
- `attachment_too_large`;
- `attachment_empty`;
- `attachment_file_name_too_long`;
- `attachment_type_not_allowed`;
- existing `CHAT_ATTACHMENT_UPLOAD_BUSY`;
- existing `CHAT_SEND_RATE_LIMITED`.

### Service And Idempotency

`PortalAttachmentUpload` becomes an ordered attachment collection at the batch
send boundary.

One payload hash includes, in order:

- message kind;
- caption;
- reply target;
- for every file: name, normalized MIME type, size and bytes.

The same unchanged batch retries with the same `clientMessageKey`. Changing
file order, content, caption or reply target requires a new key and causes the
existing payload-mismatch protection if an old key is reused.

The send ledger stores no file bytes. Chatwoot remains the binary and message
system of record.

### Chatwoot Client

The Chatwoot client accepts an ordered attachment array and appends one
`attachments[]` multipart part for every file.

It still performs exactly one external message-create request per portal
batch.

The client validates:

- array length `1..5`;
- non-empty data;
- normalized file name;
- normalized MIME type.

The returned Chatwoot message must map to a canonical portal message with the
attachment array. A missing or malformed canonical response is a controlled
send failure; the client must not blindly create a second Chatwoot message.

## Slice B — Convenient Attachment Inputs

### Clipboard Paste

The composer handles a user-initiated `paste` event.

Rules:

- text-only paste keeps normal textarea behavior;
- when clipboard file items are present, supported files are added through the
  common draft admission function;
- the default paste action is prevented only for the consumed file payload;
- alternative HTML/text representations of the same copied image are not
  inserted into the caption;
- a generic screenshot name is normalized to a readable timestamped name such
  as `screenshot-20260729-143052.png`;
- paste never sends automatically.

The primary target is a screenshot copied through the operating-system
shortcut. No `navigator.clipboard.read()` permission flow is required.

### Drag And Drop

The active chat accepts desktop file drops.

Rules:

- react only to `DataTransfer` entries whose kind is `file`;
- do not intercept dragged text, links or transcript selections;
- show the bounded overlay while files are over the chat;
- pass dropped files through the same validation and duplicate protection;
- do not send automatically;
- keep keyboard and screen-reader attachment selection fully usable.

### Mobile Sources

The paperclip opens the accepted three-action attachment menu:

- photo/video library;
- camera;
- file picker.

The existing hidden input is split into focused input controls only where the
platform distinction is useful. Browser-native fallback remains acceptable.

### Upload Progress

The current `fetch` attachment path does not expose reliable request upload
progress. The attachment-specific frontend transport therefore uses an
`XMLHttpRequest` wrapper while the rest of the API client remains on `fetch`.

The wrapper preserves:

- same-origin URL;
- `withCredentials = true`;
- existing JSON success/error parsing;
- `Retry-After` parsing;
- request timeout;
- abort support;
- existing unauthorized and connection-unavailable handling.

User-visible stages:

```text
Подготовка
Загрузка 0..100%
Отправка
Ошибка
```

Percentage is aggregate batch upload progress, not one percentage per file.
After request upload reaches 100%, the label changes to `Отправка` while the
backend performs authority checks and the Chatwoot request.

### Cancellation

`Отменить загрузку` is available only while the browser is still uploading the
request body.

Cancellation:

- aborts the foreground XHR;
- retains the attachment draft and caption;
- returns the composer to a retryable state;
- does not claim to recall a message after the backend has already accepted the
  body or Chatwoot has created the message.

Backend request-abort handling must still release the process admission slot.
The existing `clientMessageKey` protects an unchanged retry from duplicate
Chatwoot messages when the client could not observe the final result.

### Retry

After a controlled error:

- keep files, caption and reply target;
- show the backend or normalized network error;
- allow retry with the same key while the payload is unchanged;
- create a new key when the user changes any batch payload component;
- never loop automatically for attachment or voice sends.

On successful canonical response:

- clear files;
- revoke preview URLs;
- clear caption and reply target;
- reset file inputs;
- update the current chat snapshot from the returned message.

## Slice C — Installed PWA Share Target

### Progressive Enhancement Boundary

System share is an additional source, not a replacement for:

- multiple file picker;
- clipboard paste;
- drag-and-drop;
- mobile photo/file picker.

The portal advertises this capability only through its installed tenant-aware
PWA manifest. Unsupported browsers continue to use the universal paths without
an error or a dead control.

### Accepted Share Scope

The first share-target version accepts screenshot-oriented image formats:

```text
image/png
image/jpeg
image/webp
.png
.jpg
.jpeg
.webp
```

It does not advertise every portal-supported file type to the operating system.
Broader file sharing can be added only after platform testing.

### Manifest Contract

The tenant-aware manifest adds one share target:

```json
{
  "share_target": {
    "action": "/pwa/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "files": [
        {
          "name": "attachments",
          "accept": [
            "image/png",
            "image/jpeg",
            "image/webp",
            ".png",
            ".jpg",
            ".jpeg",
            ".webp"
          ]
        }
      ]
    }
  }
}
```

The installed app identity, icon, name, `id`, scope and host remain
tenant-specific.

### Share Reception

The service worker intercepts only same-origin
`POST /pwa/share-target` navigation requests.

It:

1. reads the existing last-active tenant/user identity for the current host;
2. rejects storage if there is no identity or the device has an explicit local
   sign-out marker;
3. acquires a one-request service-worker share-reception admission;
4. reads the raw request stream through a hard
   `40 MiB + bounded multipart overhead` byte counter and cancels it on
   overflow before form decoding;
5. parses the already bounded multipart payload and validates at most five
   image files and 40 MiB aggregate file bytes;
6. writes one short-lived identity-scoped pending share draft to IndexedDB;
7. redirects to `/app/chat` with an opaque draft identifier;
8. lets the authenticated frontend import the draft only when tenant and user
   match;
9. deletes the draft after successful send, explicit cancel, sign-out or
   expiry.

If a browser does not expose a readable request body for the share navigation,
the worker fails with a controlled landing page instead of using an unbounded
`request.formData()` fallback.

The draft:

- expires after 15 minutes;
- stores no Chatwoot token or authority;
- is not an outbox record;
- is never sent by the service worker;
- is not readable by a different portal user on the same device;
- is removed by current-user offline-data cleanup;
- is limited to one pending system-share draft per tenant/user.

An expired draft is replaced. If an unexpired draft for the same identity
already exists, the new images are appended in share order only while the
combined draft remains within five files and 40 MiB. Excess images are rejected
without deleting the existing draft, and the foreground landing UI explains
which newly shared files did not fit.

This is a narrow revision to architecture decision `D-022`: short-lived local
binary staging is permitted only to hand an explicit operating-system share to
the authenticated foreground composer. Attachment delivery remains
online-only. The implementation slice must update
`docs/architecture/decisions.md` when this runtime behavior is actually built.

### Identity And Auth Rules

- A share draft is keyed by tenant slug and portal user ID from the existing
  host-scoped last-active identity.
- The frontend must verify the live authenticated session before showing file
  names or previews.
- A different authenticated user must not see the draft and triggers deletion.
- An expired session may route through login, but the draft is revealed only
  after the same identity authenticates before the 15-minute expiry.
- Unknown host and cross-origin share actions are rejected.
- Explicit logout deletes pending share drafts for that user.

### Destination Selection

After importing a share draft:

- if only one writable chat is available, show it as the explicit destination;
- if several writable chats are available, require the user to choose one;
- show the normal attachment preview and aggregate size;
- allow caption editing and file removal;
- require the normal Send button;
- use the same portal attachment-batch API as picker, paste and drop.

The share-target action never sends directly to Chatwoot.

### Unsupported Platforms

The product copy must not promise universal system-share support.

Where the installed PWA is not registered as a share target, users still have:

- screenshot paste where clipboard file events are supported;
- photo/file picker;
- camera capture;
- drag-and-drop on desktop.

A native iOS share extension or a native application is outside this web
portal scope.

## Load Model

### Universal Batch Send

Per accepted attachment batch:

- one rate-limit bucket mutation;
- one multipart request;
- one writable-thread resolution;
- zero or one reply lookup;
- one Chatwoot message-create request;
- one send-ledger lifecycle;
- one canonical response containing at most five attachment records.

Bounds:

- maximum two active batches per backend process;
- maximum 80 MiB raw file buffers across those two batches;
- maximum five batch starts per minute per tenant/user;
- maximum 25 file objects and 200 MiB aggregate user upload bytes per minute;
- no internal wait queue;
- busy requests fail before body reads and database rate-limit work;
- one Chatwoot call per batch, not per file.

At 10x or 100x user count, the process-wide cap provides backpressure and
additional backend replicas provide explicit horizontal capacity. The design
does not introduce polling, tenant-wide loops, N+1 queries or portal binary
storage in the send path.

### PWA Share Draft

Per tenant/user/device origin:

- at most one active share request parse per service-worker scope;
- at most one pending draft;
- at most five images;
- at most 40 MiB;
- at most `40 MiB + bounded multipart overhead` raw incoming request bytes;
- 15-minute expiry;
- no server call until the foreground user presses Send.

The bounded raw request may coexist briefly with decoded file objects during
multipart form decoding. This can transiently approach twice the raw
attachment limit in the browser process, but it is limited to one share parse
per service-worker scope and cannot grow with concurrent share requests.

Cleanup runs on expired-draft replacement, import/cancel/success, logout, app
startup and service-worker activation. Cleanup is bounded to the dedicated
draft store and current identity rather than scanning unrelated cached chat
records.

## Error And User Copy Model

Representative local errors:

- `Можно добавить не больше 5 файлов.`
- `Общий размер файлов не должен превышать 40 МБ.`
- `Файл «…» пустой.`
- `Имя файла слишком длинное.`
- `Файл «…» такого типа отправить нельзя.`
- `Этот файл уже добавлен.`
- `Для отправки файлов нужно подключение к интернету.`
- `Не удалось загрузить файлы. Они остались в сообщении — попробуйте ещё раз.`

Busy and rate-limited backend responses preserve `Retry-After`. The frontend
can add `Попробуйте через N сек.` when the value is available.

Do not show five identical notifications for one selection action. Show one
summary with the accepted count and concise rejection reasons.

## Accessibility

- Every preview remove action has a file-specific accessible name.
- Count, total size, validation and upload state are exposed through an
  `aria-live` status region without announcing every progress event.
- Progress announcements are throttled to meaningful changes.
- Drag-and-drop is never the only selection method.
- Clipboard paste is never the only screenshot method.
- Mobile menu actions are normal accessible buttons.
- Keyboard focus returns to the composer after removing or successfully
  sending files.
- A visible and keyboard-operable cancel action exists during upload.

## Automated Coverage

### Frontend Unit And Component Tests

Required coverage:

- combine existing and newly selected files in order;
- accept five and reject the sixth;
- enforce 40 MiB aggregate bytes;
- empty, overlong-name and unsupported file validation;
- duplicate suppression;
- image preview URL creation and cleanup;
- remove one and clear all;
- text-only paste remains text;
- screenshot paste adds a file without sending;
- file drop adds files and dragged text does not;
- mobile source controls use the correct accept/capture behavior;
- voice file uses common validation;
- caption and reply target apply to the whole batch;
- progress stage changes;
- cancellation retains the draft;
- failure retains the draft and retry key;
- success clears the draft;
- `Retry-After` copy remains bounded.

### Backend Unit And Integration Tests

Required coverage:

- one through five files produce one Chatwoot message request;
- a sixth file is rejected;
- aggregate bytes over 40 MiB are rejected;
- every individual file is normalized and validated;
- multipart field and part limits remain bounded;
- process admission still rejects a third active batch without reading its
  body;
- user-wide rate admission remains before body reads;
- aborted multipart requests release process admission;
- batch idempotency replay;
- same key with a changed file, order, caption or reply target is rejected;
- Chatwoot multipart includes repeated `attachments[]`;
- Chatwoot canonical response maps all attachments;
- no portal database row stores file bytes.

### Browser And Runtime Tests

Required coverage:

- multiple chooser and preview in a real browser;
- paste a screenshot into the focused composer;
- drag files into the active chat;
- upload progress and cancel;
- successful batch appears as one message;
- failed upload keeps the draft;
- narrow mobile composer remains usable with five previews;
- mobile picker/camera fallback behavior.

PWA share-target coverage:

- tenant manifest contains the bounded share target;
- service worker handles only the intended same-origin POST;
- unsupported type, sixth file and aggregate overflow are rejected;
- draft is tenant/user scoped and expires;
- local sign-out and different-user login cannot expose the draft;
- no automatic send;
- destination selection is required;
- Android Chromium installed-PWA smoke;
- Windows Edge/Chrome installed-PWA smoke;
- iPhone/iPad fallback smoke without promising share-target registration.

## Documentation Updates At Implementation

After actual runtime completion:

- update `docs/architecture/overview.md` for the plural attachment contract;
- update `docs/architecture/decisions.md` only when the PWA share-draft
  exception is implemented;
- update `docs/roadmap/work-log.md` once per stable completed attachment UX
  baseline, not for every test or intermediate slice;
- `F-CHAT-005` was deleted after its implementation, review and verification
  were complete;
- update the preservation status in
  `docs/superpowers/specs/2026-06-02-chat-message-reliability-design.md` when
  `F-CHAT-005` is removed, so it does not retain a stale finding link;
- update current API and PWA operational references;
- keep historical audit/spec evidence unless separately superseded.

## Implementation Slices

Implementation must use separate feature branches from the then-current
`main`.

### Slice 1 — Batch Foundation

- plural portal API;
- five-file/40 MiB backend parser and validation;
- ordered send-ledger payload;
- Chatwoot repeated attachments;
- frontend attachment collection;
- compact preview tray;
- early validation;
- multi-file picker;
- focused backend/frontend tests;
- security/load review.

### Slice 2 — Input And Transfer UX

- clipboard paste;
- drag-and-drop;
- mobile photo/camera/file menu;
- aggregate progress;
- cancellation;
- retry-preserving draft behavior;
- browser tests and mobile runtime checks.

### Slice 3 — PWA Share Target

- tenant-aware manifest entry;
- service-worker share POST;
- bounded identity-scoped short-lived draft;
- destination selection;
- auth/logout/expiry cleanup;
- architecture decision update;
- installed-PWA platform smoke;
- focused security and privacy review.

Each slice completes implementation, focused review, fixes, targeted tests and
its required browser/runtime validation before merge. Slice 3 starts only after
Slices 1 and 2 provide the common attachment draft and batch send path.

## Out Of Scope

- more than five files per message;
- more than 40 MiB aggregate bytes;
- per-file captions;
- manual attachment reordering;
- image editing, annotation, cropping or compression;
- resumable or chunked uploads;
- durable attachment/voice outbox;
- background attachment send;
- antivirus or content-scanning service;
- portal server/object-storage staging for normal chat files;
- changing Chatwoot core;
- native iOS/Android application or native share extension;
- fixing deferred audio-player, keyboard viewport or text Background Sync
  findings.

## Acceptance

The design is implemented when:

1. A user can select up to five supported files totaling at most 40 MiB and
   send them as one Chatwoot message.
2. A user can paste a screenshot, review it and explicitly send it.
3. A desktop user can drop files into the active chat, review them and
   explicitly send them.
4. A mobile user has clear photo/video, camera and file paths with native
   fallback.
5. Invalid files are rejected locally before upload and authoritatively on the
   backend.
6. Preview, count, total size, individual removal, progress, cancellation and
   retry behavior are clear and accessible.
7. The current two-batch/40 MiB-per-batch load and memory boundary remains
   enforced before multipart body reads.
8. Supported installed PWAs can receive a system-shared screenshot into a
   short-lived identity-scoped draft.
9. Unsupported platforms retain universal picker/paste/drop fallback.
10. No source sends automatically, no browser receives Chatwoot authority and
    Chatwoot remains system of record for sent files.
