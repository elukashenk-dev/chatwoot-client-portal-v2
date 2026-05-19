# Chat Media And Files Page

## Decision

Implement a dedicated full-screen `Медиа и файлы` page for the currently
selected chat thread.

This slice covers only read-only browsing of attachments already present in the
chat. `Поиск по чату`, notification settings, support center content, delete
actions, upload actions, and attachment management remain future slices.

## Scope

The page opens from the existing chat action menu item `Медиа и файлы` and
returns to the current chat without changing the selected thread.

The page is read-only:

- it does not create Chatwoot conversations;
- it does not upload, delete, rename, or re-share files;
- it does not change notification settings;
- it does not expose Chatwoot conversation IDs or contact IDs as browser
  authority.

The page works for both `private:me` and `group:<contactId>` threads. Backend
must validate the selected `threadId` through the same tenant/session/thread
authority boundary used by chat history and `Информация о чате`.

## Data Shown

The page shows attachments from client-visible chat messages in the selected
thread:

- images;
- videos;
- audio and voice messages;
- documents and other files accepted by the existing chat attachment pipeline.

Each media item includes:

- display name;
- file type;
- size when Chatwoot provides it;
- created date/time from the parent message;
- sender display name and direction, using the same author rules as the
  transcript;
- thumbnail when Chatwoot provides `thumb_url`, or a safe image preview when
  the item is an image and has a direct URL;
- direct open/download link using the same URL already used by transcript
  attachment cards.

Private Chatwoot messages and empty non-visible messages must stay hidden by
reusing the existing client-visible message rules.

## Non-Goals

- no full-text message search;
- no search within the media page;
- no message transcript rendering inside the media page;
- no file deletion or moderation;
- no upload entry point from the media page;
- no tenant admin or support-center content;
- no direct browser calls to Chatwoot;
- no new object storage layer for Chatwoot-owned attachments.

## Data Contract

Add a portal-owned endpoint:

```text
GET /api/chat/threads/:threadId/media
GET /api/chat/threads/:threadId/media?beforeMessageId=:messageId
```

Response shape:

```ts
type ChatThreadMediaResponse = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  items: ChatThreadMediaItem[]
  nextOlderCursor: number | null
  reason: ChatThreadReason
  result: 'ready' | 'not_ready' | 'unavailable'
}

type ChatThreadMediaItem = {
  attachmentId: number
  authorName: string
  authorRole: 'agent' | 'group_member' | 'current_user'
  createdAt: string
  direction: 'incoming' | 'outgoing'
  fileSize: number | null
  fileType: string
  id: `attachment:${number}:${number}`
  messageId: number
  name: string
  thumbUrl: string
  url: string
}
```

`id` is a portal presentation ID built from the parent message ID and attachment
ID. It is not authority for backend mutations.

`beforeMessageId` follows the existing chat history cursor semantics. Backend
must reject invalid cursors with the same controlled `invalid_history_cursor`
error used by chat history.

## Backend Rules

The endpoint must:

1. Resolve tenant from host.
2. Resolve the authenticated portal user from session.
3. Validate `threadId` through `chatThreadsService.getCurrentUserThreadContext`.
4. For group chats, re-check current group access through the existing group
   authority model.
5. Read Chatwoot messages through the backend Chatwoot client only.
6. Filter messages through the existing `isClientVisibleMessage` and
   `mapPortalMessage` rules.
7. Flatten mapped message attachments into media items.
8. Return controlled `not_ready` or `unavailable` states instead of leaking
   Chatwoot errors.

The media endpoint must not call writable thread-context methods and must not
create or recover a Chatwoot conversation. If no conversation exists yet, return
`ready` with an empty `items` array and `hasMoreOlder: false`.

To avoid an empty media page just because the newest message page contains no
attachments, each request may scan several older Chatwoot message pages. The
first implementation should scan up to four Chatwoot pages or until it finds at
least one media item, whichever comes first. It must then return the next
message cursor if older messages remain.

## UI

Use the existing `ChatFullScreenPanel` inside the protected chat shell.

Layout:

- safe-area aware top bar;
- back button;
- title `Медиа и файлы`;
- compact thread identity row;
- segmented filter: `Все`, `Фото`, `Видео`, `Аудио`, `Файлы`;
- scrollable item list;
- `Показать ещё` button when `hasMoreOlder` is true;
- quiet empty state when no media is found.

Item presentation:

- images: square thumbnail when possible, filename and metadata next to it;
- videos: video/file icon, filename, type, size, sender/date;
- audio: audio/voice icon, filename, type, size, sender/date;
- documents/files: file icon, filename, type, size, sender/date.

All items with a non-empty URL open in a new tab with `rel="noreferrer"`.
Items without a URL stay visible but disabled with a controlled label
`Файл недоступен`.

The page must fit mobile widths down to 320px:

- filenames and sender names truncate predictably;
- metadata wraps only when needed;
- touch targets remain at least 44px;
- no horizontal overflow;
- audio items must not inherit the transcript audio `min-w-[220px]` layout risk
  from `F-CHAT-UI-003`.

## Error And Empty States

- Loading: compact page-level loading state.
- Unauthorized: use existing session refresh behavior; if still unauthorized,
  route through existing auth/session handling.
- Invalid or inaccessible thread: show controlled unavailable/not-ready state
  and a back action.
- Chatwoot unavailable: show retry and back actions.
- No conversation yet: show empty state `В этом чате пока нет файлов`.
- Current loaded pages contain no attachments but older pages may exist: keep
  the empty state and show `Показать ещё`.
- Filter returns no items: show `Нет файлов этого типа` without clearing loaded
  data.

## Tests

Backend:

- media helpers flatten message attachments into stable media item IDs;
- messages with no attachments produce no media items;
- private/empty Chatwoot messages remain hidden through existing visible-message
  mapping;
- endpoint rejects malformed or forged thread IDs;
- private media returns attachments without creating a conversation;
- empty no-conversation thread returns `ready` with no items;
- group media rejects revoked group access;
- Chatwoot unavailable returns controlled `unavailable`;
- invalid cursor returns controlled `invalid_history_cursor`.

Frontend:

- API client builds the encoded media URL and optional cursor;
- menu item opens the full-screen `Медиа и файлы` page;
- back returns to the same selected thread and transcript;
- loading, empty, unavailable, retry, and load-more states render correctly;
- filters classify photo/video/audio/file items;
- stale media responses after back do not reopen the page;
- panel remains constrained to the `portal-shell` width.

Browser/runtime:

- Playwright coverage for opening media/files from a group chat and returning
  back;
- e2e verifies rendered media items and the width constraint;
- browser network must only call portal `/api/...` endpoints, never Chatwoot
  directly.

Required checks:

- backend targeted tests for chat media service/routes/helpers;
- frontend targeted tests for media page/hook/API/chat page wiring;
- frontend typecheck/build;
- root lint/code-health;
- Playwright e2e for the media page;
- `git diff --check`.
