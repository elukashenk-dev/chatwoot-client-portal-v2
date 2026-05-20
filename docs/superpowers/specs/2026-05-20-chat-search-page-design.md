# Chat Search Page

## Decision

Implement `Поиск по чату` as a dedicated full-screen chat-adjacent page using
the approved visual option `C. Search page + context preview`.

The first slice searches visible text messages in the currently selected chat
thread. It does not search filenames, file content, support-center articles, or
all tenant chats.

## Scope

The page opens from the existing chat action menu item `Поиск по чату` and
returns to the current transcript without changing the selected thread.

The search works for:

- `private:me`;
- `group:<contactId>` when the current portal user still has access to the
  group thread.

The page is read-only:

- it does not create Chatwoot conversations;
- it does not mutate portal state;
- it does not expose Chatwoot conversation IDs, contact IDs, or message URLs as
  browser authority;
- it does not call Chatwoot directly from the browser.

## Non-Goals

- no global search across all chats;
- no search by filename or attachment metadata in the first slice;
- no search inside file contents;
- no support-center search;
- no advanced query language;
- no server-side search index or persistence migration;
- no deep loading of the transcript around old messages in the first slice;
- no browser-direct Chatwoot search.

## Data Contract

Add a portal-owned endpoint:

```text
GET /api/chat/threads/:threadId/search?q=:query
GET /api/chat/threads/:threadId/search?q=:query&beforeMessageId=:messageId
```

Query rules:

- trim whitespace;
- require at least 2 non-whitespace characters;
- cap query length at 80 characters;
- case-insensitive substring matching;
- return a controlled validation error for invalid query or cursor values.

Response shape:

```ts
type ChatThreadSearchResponse = {
  activeThread: ChatThreadSummary | null
  hasMoreOlder: boolean
  items: ChatThreadSearchResult[]
  nextOlderCursor: number | null
  query: string
  reason: ChatThreadReason
  result: 'ready' | 'not_ready' | 'unavailable'
}

type ChatThreadSearchResult = {
  authorName: string
  authorRole: 'agent' | 'group_member' | 'current_user'
  beforeSnippet: string | null
  content: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  id: `message:${number}`
  matchRanges: Array<{ end: number; start: number }>
  messageId: number
  afterSnippet: string | null
}
```

`messageId` is a presentation anchor, not a mutation authority.

## Backend Rules

The endpoint must:

1. Resolve tenant from host.
2. Resolve the authenticated portal user from session.
3. Validate `threadId` through `chatThreadsService.getCurrentUserThreadContext`.
4. For group chats, re-check current group access through the existing group
   authority model.
5. Read Chatwoot messages through the backend Chatwoot client only.
6. Filter messages through the same client-visible message rules used by the
   transcript.
7. Search only `PortalChatMessage.content` text after mapping, so private
   Chatwoot messages and hidden system content stay hidden.
8. Return controlled `not_ready` or `unavailable` states instead of leaking
   Chatwoot errors.

The search endpoint must not call writable thread-context methods and must not
create or recover a Chatwoot conversation. If no conversation exists yet, return
`ready` with an empty `items` array and `hasMoreOlder: false`.

To keep the first implementation predictable, each request scans up to 8
Chatwoot history pages or until 20 results are found. If older messages remain,
return `hasMoreOlder: true` and `nextOlderCursor` for the next search page.

## Filters

The first slice supports three author filters:

- `Все`: all client-visible text messages in the current thread;
- `Мои`: messages where `authorRole === 'current_user'`;
- `Поддержка`: incoming support messages, including `agent` and
  `group_member` roles.

Filters are frontend state only in the first slice. They filter the currently
loaded search results and current-snapshot matches without changing the backend
query. If this becomes too expensive later, the filter can move into the
backend contract as a follow-up.

## Context Preview

Each result shows:

- author;
- date/time;
- message text with highlighted match ranges;
- one short previous visible message snippet when available;
- one short next visible message snippet when available;
- an `Открыть место в чате` action.

Context snippets are generated only from messages already scanned in the same
backend request. Missing context is allowed and must not trigger extra
unbounded history loading.

## Jump Behavior

First slice behavior:

- tapping a result closes the search page and returns to the selected thread;
- if the matched message is already present in the current transcript snapshot,
  the frontend scrolls to it and briefly highlights it;
- if the matched message is older than the currently loaded transcript, the
  frontend returns to the chat without attempting deep history reconstruction.

Deep jump to unloaded older messages is a follow-up slice. It would require
loading transcript pages around the selected anchor without breaking ordering,
reply previews, realtime merge, and current thread state.

## Fresh Snapshot Merge

The search page includes results from the current in-memory transcript
snapshot when they match the query and are not already returned by the backend
search response. This avoids the same recency gap found in `Медиа и файлы`,
where a just-sent message can be visible in the transcript before Chatwoot
history search catches up.

This merge is presentation-only and must deduplicate by `messageId`.

## UI

Use the existing `ChatFullScreenPanel` inside the protected chat shell.

Layout:

- safe-area aware top bar;
- back button;
- title `Поиск по чату`;
- large search input directly below the header;
- compact filter row: `Все`, `Мои`, `Поддержка`;
- result count line;
- list of result cards with context preview;
- `Показать ещё` button when `hasMoreOlder` is true;
- quiet empty state.

Result card:

- avatar/monogram;
- author name;
- timestamp;
- message snippet with highlighted matches;
- optional previous/next context block;
- `Открыть место в чате` action text.

Empty states:

- before query: `Введите запрос, чтобы найти сообщение`;
- query too short: `Введите минимум 2 символа`;
- no results: `По этому запросу ничего не найдено`;
- unavailable: page-level retry state through `ChatFullScreenPanel`.

The page must fit mobile widths down to 320px:

- search input stays one line;
- result text wraps naturally;
- author and timestamps truncate predictably;
- touch targets remain at least 44px;
- no horizontal overflow.

## Frontend State

Add a `useChatSearchPanel` hook parallel to `useChatInfoPanel` and
`useChatMediaPanel`.

The hook owns:

- open/closed state;
- current query;
- loading state;
- loaded search response;
- loading older search pages;
- stale-response protection when selected thread changes;
- unauthorized/session refresh handling;
- connection-unavailable handling;
- merge of current snapshot matches.

`ChatPage` wires the menu item to open the search page for the selected thread.
If no thread is selected, keep the menu item disabled.

## Error Handling

- `401`: reuse existing session refresh behavior.
- Network failure: mark browser offline and show retry state.
- Invalid query/cursor: controlled user-facing state, no crash.
- Chatwoot unavailable: return `unavailable` and show retry state.
- Thread not ready: show empty/controlled state, not a generic crash.
- Stale response after close/back/thread switch: ignore it.

## Tests

Backend tests:

- route validates query and cursor;
- unauthenticated requests are rejected;
- private and group thread authority is enforced;
- group access removal fails closed;
- hidden/private Chatwoot messages are not searchable;
- no conversation creation happens during search;
- bounded scanning stops after results or scan limit;
- unavailable Chatwoot returns controlled response.

Frontend tests:

- menu opens `Поиск по чату`;
- typing a valid query loads results;
- match highlight renders;
- context preview renders;
- empty and too-short states render;
- `Показать ещё` appends older results;
- back closes without changing selected thread;
- stale response after close is ignored;
- current snapshot match appears even when backend returns empty results.

Runtime validation:

- Playwright e2e opens search from the menu, searches a known term, sees a
  highlighted result with context, and returns to the transcript.
- Validate both private and group chats when local runtime data is available.

## Open Follow-Ups

- Deep jump to older unloaded transcript anchors.
- Search filenames and attachment metadata.
- Search across all user-visible chats.
- Persisted search index if Chatwoot history scanning becomes too slow.
