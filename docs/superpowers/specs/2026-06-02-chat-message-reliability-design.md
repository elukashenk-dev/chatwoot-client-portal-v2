# Chat Message Reliability UX Design

## Scope

Эта спека фиксирует, как сделать отправку и получение сообщений в клиентском
портале надежнее и понятнее без перегруза системы.

Речь идет о текущем `chatwoot-client-portal-v2`:

- Chatwoot остается system of record для сообщений и вложений.
- Portal backend остается единственной authority-зоной для auth, session, send,
  realtime, unread и доступа к thread.
- Browser не получает Chatwoot authority.
- PWA runtime может помогать offline-сценариям, но не может гарантировать
  мгновенную работу во сне телефона на всех платформах.

## Architect Decision

Выбираем точечный reliability hardening поверх текущей архитектуры.

Что оставляем:

- durable text outbox в IndexedDB;
- `clientMessageKey` и backend send ledger как защиту от дублей;
- foreground drain как основной путь доставки queued text;
- Background Sync как progressive enhancement, а не как гарантию;
- backend snapshot и `/api/chat/threads` как источник истины для получения,
  unread и доступных чатов;
- attachments и voice online-only.

Что исправляем:

- финальные ошибки больше не должны бесконечно висеть в очереди;
- frontend должен ловить лимиты текста, подписи и файла до отправки;
- выбранный файл не должен превращать отправку текста в тупик при потере связи;
- статус отправленного сообщения должен честно означать `Отправлено`, а не
  обещать `Доставлено/прочитано`;
- при проблемах realtime получение сообщений должно догоняться snapshot-refresh.

Что убираем совсем:

- обещание `Доставлено` для простого successful send state. В будущем read
  receipts должны добавляться отдельной моделью, а не подменять `Отправлено`;
- implicit endless retry для `400`/validation/permanent ошибок;
- идею offline-очереди файлов и голосовых в текущем slice;
- любые UX-решения, где push/app badge считаются source of truth для сообщений.

Что добавляем:

- явную классификацию send errors: temporary vs permanent;
- frontend send constraints для text/media;
- media-selected/offline UX;
- realtime health/fallback refresh для открытого thread;
- расширенную сценарную таблицу отправки и получения.

## Relationship To Read Receipts

Read receipts are a separate feature scope documented in:

```text
docs/superpowers/specs/2026-06-02-chat-read-receipts-design.md
```

This reliability slice must prepare the status model for read receipts, but
must not implement them.

Required compatibility rule:

- `Отправлено` means only "portal backend accepted the message and Chatwoot
  returned the canonical message";
- `Прочитано поддержкой` and customer/group read markers must be separate
  receipt data, not a reinterpretation of the send state;
- local states `В очереди`, `Отправляется`, `Не отправлено` must never show read
  receipts;
- push, app badge and unread counters are not receipt sources.

Implementation order recommendation:

- close at least the honest sent-status part of this reliability slice before
  implementing read receipts;
- ideally close the full reliability slice first, because read receipts depend
  on stable snapshot refresh and correct offline/permanent-failure behavior.

## External Baseline

Использованные источники:

- MDN `Navigator.onLine`: network status is inherently unreliable and should be
  treated as a hint, not as authoritative state.
  https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- web.dev Offline UX: user should be informed what is happening and what can
  still be done; unstable networks should not block the rest of the app.
  https://web.dev/articles/offline-ux-design-guidelines
- MDN Background Synchronization API: limited availability; defers tasks to a
  service worker when a stable network connection exists.
  https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- Workbox Background Sync: retries failed requests later; by default network
  exceptions are retried, not every `4xx/5xx`; fallback retries when service
  worker starts in browsers without Background Sync.
  https://developer.chrome.com/docs/workbox/modules/workbox-background-sync
- MDN Server-Sent Events: EventSource reconnects by default, but an app still
  needs error handling and a recovery path.
  https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Signal message states: sending, sent to service, delivered, read are different
  guarantees.
  https://support.signal.org/hc/en-us/articles/360007320751-How-do-I-know-if-my-message-was-delivered-or-read
- Telegram FAQ: one check means delivered to Telegram cloud; two checks means
  read. Telegram explicitly avoids a device-delivered state because multiple
  devices make it ambiguous.
  https://telegram.org/faq
- MDN/web.dev storage persistence: IndexedDB data is best-effort unless
  persistent storage is granted; quota and eviction must be handled.
  https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
  https://web.dev/articles/persistent-storage

## Current Baseline

Текущее поведение по коду:

- Text send:
  - composer сохраняет сообщение в durable outbox;
  - optimistic bubble показывается сразу;
  - online send имеет 20s timeout;
  - drain идет foreground, visibility/online/reconnect probe и Background Sync;
  - backend idempotency обеспечивается через `clientMessageKey`.
- Attachment/voice send:
  - online-only;
  - offline queue нет;
  - optimistic bubble нет;
  - backend валидирует размер, mime type, filename, caption, thread access и
    reply target.
- Receive:
  - selected thread получает SSE EventSource;
  - unread refresh идет через `/api/chat/threads`;
  - snapshot refresh идет при reconnect/visibility/open;
  - push не является source of truth.

## Reliability Principles

1. User action must not be lost silently.
   Если текст принят в outbox, пользователь должен видеть queued/sending/failed
   до успешного backend ack.

2. Only temporary failures are retried.
   Network errors, rate limit, server unavailable and Chatwoot unavailable can
   retry. Invalid text, missing reply target, forbidden thread and payload
   conflict cannot fix themselves.

3. Final failure must be explicit.
   Если сообщение не может быть отправлено в таком виде, UI должен показать
   `Не отправлено` and a useful error message.

4. `navigator.onLine` is only a hint.
   It may be wrong under VPN/router/firewall/LAN. Actual fetch/SSE outcomes
   decide whether the portal marks chat offline.

5. Realtime is fast path, snapshot is truth.
   SSE delivers new messages quickly, but after reconnect/error/visibility the
   portal must refresh from backend snapshot.

6. Push and app badge are not message state.
   Push can wake or notify, but message list, unread and counters must come from
   backend-visible threads/snapshots.

7. Media is online-only unless we explicitly build a separate media outbox.
   Current slice must not fake media reliability. It should instead explain
   online-only behavior and validate before upload.

## Target Send Model

### Text Send States

Draft text goes through this pipeline:

1. Local validation.
2. Durable outbox write.
3. Optimistic bubble appears.
4. Drain tries backend send with the same `clientMessageKey`.
5. Backend returns canonical sent message.
6. Outbox record is deleted.
7. Optimistic bubble is replaced by canonical message.

UI labels:

- `Отправляется` - request/drain attempt is active.
- `В очереди` - text is saved locally and will retry later.
- `Не отправлено` - permanent failure or explicit failed record.
- `Отправлено` - backend accepted the message and returned canonical message.

Do not use `Доставлено` because it sounds like recipient-device delivery or read
receipt. This reliability slice does not implement that guarantee. Future read
receipts must show a separate state such as `Прочитано поддержкой`.

### Text Validation

Frontend must block these before outbox write:

- empty trimmed text;
- text longer than 4000 characters;
- invalid reply target state if frontend already knows the target was removed
  from current snapshot.

Backend remains authority and keeps its own validation.

### Temporary Text Failures

These stay queued and retry:

- `statusCode === 0`;
- `statusCode === 408`;
- `statusCode === 429`, respecting `Retry-After`;
- `statusCode >= 500`;
- `code === 'chat_send_in_progress'`;
- successful HTTP response where send result is not `ready` because Chatwoot or
  thread is temporarily unavailable;
- `code === 'chat_send_unavailable'`;
- `code === 'chat_send_ledger_unavailable'`.

### Auth Failure

`401` is not a normal retry loop:

- keep record queued;
- clear rejected auth snapshot;
- refresh session / route user through auth;
- retry only after authenticated state is valid again.

### Permanent Text Failures

These become failed and stop automatic retry:

- `statusCode === 403`;
- `code === 'thread_access_denied'`;
- `code === 'chat_thread_unsupported'`;
- `code === 'client_message_key_conflict'`;
- `code === 'reply_target_invalid'`;
- `code === 'reply_target_unavailable'`;
- `code === 'message_content_required'`;
- `code === 'message_content_too_long'`;
- `code === 'client_message_key_required'`;
- `code === 'client_message_key_too_long'`;
- `code === 'INVALID_REQUEST'` on text send;
- other `400` on text send unless explicitly listed as temporary.

Reason: these failures are caused by payload, access, or context. Waiting does
not make them valid.

### Retry Button Semantics

Retry remains available for failed text messages only.

Retry must:

- keep the same `clientMessageKey`;
- not change content or reply target;
- move the record back to queued;
- retry only when current browser/backend state is online-capable.

If the failure was caused by stale reply target or overlong content, the retry
button alone may not help. In that case the message should show the backend
error text. A future edit-and-resend flow is out of scope.

## Target Media And Voice Model

Attachments and voice remain online-only in this slice.

Frontend must validate before upload:

- file exists;
- file size is `> 0`;
- file size is `<= 40 MB`;
- filename is present and `<= 255` characters;
- caption is `<= 4000` characters.

Backend remains authority for mime type and multipart validation.

When a file is selected and the connection becomes unavailable:

- keep file preview visible;
- show inline warning: `Файл можно отправить только при связи. Текст можно отправить сейчас.`;
- if the draft has text and media send is disabled, pressing send should send
  the text to text outbox and keep the selected file;
- if there is no text, send button is disabled until online or file removed.

When online and a file is selected:

- selected file wins;
- draft text is treated as attachment caption;
- successful send clears file, caption and reply target.

Voice uses the same attachment send path after recording/conversion.

Voice-specific errors that must stay explicit:

- microphone permission denied;
- no microphone;
- unsupported recording API;
- empty recording;
- conversion/preparation failure;
- generated voice file exceeds attachment size limit.

## Target Receive Model

Receive has three paths:

1. SSE EventSource for selected thread.
2. Backend snapshot refresh for selected thread.
3. `/api/chat/threads` refresh for unread and thread menu.

Rules:

- SSE is fast path only.
- Snapshot refresh is source of truth after reconnect, visibility, startup,
  selected thread open and realtime failure.
- If EventSource is unsupported, the UI already says auto-update is unavailable;
  the app should still periodically refresh the selected snapshot while visible
  and online.
- If EventSource is supported but reports errors or never opens, fallback
  snapshot refresh should run on a bounded interval while visible and online.
- Do not poll aggressively when the app is hidden.
- Do not use push payload as message content authority.

Recommended fallback interval:

- selected-thread snapshot fallback: 30 seconds while visible and online only
  when realtime is unhealthy/unavailable;
- unread/thread refresh: keep existing 30 seconds foreground refresh.

## Target Scenario Table Updates

`docs/product/chat-message-send-ui-scenarios.md` should be expanded to include:

- overlong text before send;
- overlong text already in outbox from older/bad local state;
- reply target unavailable;
- file too large;
- empty file;
- unsupported attachment type;
- attachment caption too long;
- selected file plus lost connection plus text draft;
- voice conversion failure;
- voice generated file too large;
- session expired while outbox has queued text;
- group membership removed while outbox has queued text;
- realtime unsupported;
- realtime broken but backend reachable;
- app closed/screen sleeping on Android vs iOS;
- storage eviction / unavailable IndexedDB.

## Out Of Scope

- Offline queue for files and voice.
- Upload progress bars for attachments.
- Read receipts implementation. It is covered by
  `docs/superpowers/specs/2026-06-02-chat-read-receipts-design.md`.
- Delivered-to-agent/device receipts as a send-state replacement.
- Message editing.
- Manual `mark read` button.
- Cross-device local outbox sync.
- New reachability state-machine library.

These can be future slices, but adding them now would increase complexity faster
than it increases reliability.

## Testing Requirements

Frontend unit tests:

- text validation blocks `>4000`;
- attachment validation blocks `0 bytes`, `>40 MB`, long filename and long
  caption;
- selected attachment + offline + text sends text and keeps file preview;
- selected attachment + offline + no text blocks send with warning;
- `MessageBubble` sent aria-label is `Отправлено`;
- realtime fallback refresh runs when EventSource is unhealthy and visible.

Offline/outbox unit tests:

- `reply_target_unavailable` marks failed;
- `message_content_too_long` marks failed;
- `INVALID_REQUEST` on text marks failed;
- `chat_thread_unsupported` marks failed;
- `500`, `0`, `429`, `chat_send_in_progress` remain queued;
- same behavior in service worker background drain.

Backend tests:

- current validation already exists in behavior, but add/adjust route tests if
  frontend depends on exact error codes/messages;
- ensure text over 4000 returns a stable permanent error code.

Manual production smoke after deploy:

- normal online text;
- router/VPN cut while text send hangs;
- queued text after reconnect;
- overlong text;
- reply to message then stale target;
- file too large;
- file selected then offline, text still sends;
- EventSource unavailable simulation or browser without EventSource fallback;
- Android/iOS app hidden and reopened.

## Acceptance Criteria

- No valid text action is lost silently.
- Text that can be retried stays queued.
- Text that cannot ever be sent becomes failed with a clear reason.
- User never sees `Доставлено` for simple backend-accepted send state.
- Files/voice do not pretend to have offline delivery.
- Realtime failure does not permanently hide incoming messages while backend is
  reachable.
- Push disabled or broken does not break in-app unread or receive refresh.

## Spec Self-Review

Placeholder scan:

- No `TBD`, `TODO`, or undefined future-only requirements remain in scope.

Consistency check:

- The spec keeps Chatwoot as system of record and portal backend as authority.
- The spec does not introduce browser-direct Chatwoot access.
- The spec keeps media online-only and does not contradict existing outbox
  architecture.

Scope check:

- This is one implementation slice: chat send/receive reliability UX.
- It touches frontend validation/composer/outbox/SW/realtime/docs, but all
  changes serve one behavior surface and can be tested together.

Ambiguity check:

- `Отправлено` is explicitly defined as backend-accepted canonical message.
- Read receipts are explicitly deferred to a separate spec and must not be
  represented by the same send-state field.
- `В очереди` is explicitly retryable.
- `Не отправлено` is explicitly permanent or user-retry state.
- Background Sync is explicitly progressive enhancement, not a guarantee.
