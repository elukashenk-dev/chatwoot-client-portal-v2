# Дизайн Легкой Серверной Unread-Системы

## Цель

Сделать точное и простое поведение непрочитанных сообщений для portal chat:

- каждый чат учитывается отдельно: личный `private:me` и все доступные
  групповые `group:<contactId>`;
- меню чатов показывает unread по каждому чату;
- иконка установленной PWA показывает общий unread count;
- успешное открытие чата сбрасывает unread только для этого `threadId`;
- старая локальная эвристика unread-точек удаляется.

Под "открытием чата" понимается только успешный backend snapshot:

```text
GET /api/chat/messages?threadId=<threadId> -> 200 и snapshot для этого threadId
```

Cached/offline snapshot не считается прочтением. Отдельной кнопки "прочитано",
отслеживания scroll-to-bottom и "прочитал глазами" не будет.

## Текущее Состояние

Сейчас unread не является серверным состоянием.

PWA app badge считает push-события в service worker:

- `frontend/public/sw.js` получает `push`;
- если открытая вкладка не подавила push для активного чата, worker показывает
  browser notification и увеличивает `navigator.setAppBadge(count)`;
- count хранится в отдельном IndexedDB `provgroup-portal-app-badge`;
- `ChatPage` очищает badge при открытии страницы и при возврате вкладки в
  visible state.

Меню чатов использует локальное React-состояние:

- `useChatUnreadThreadMarkers` хранит `Set<threadId>`;
- `useChatPageNotifications` добавляет thread в Set при push для другого чата;
- `ChatHeader` рисует красную точку рядом с thread в навигационном меню;
- точка очищается после успешного перехода в этот чат;
- состояние живет только в текущей вкладке и не является серверной правдой.

Эта реализация должна быть удалена в рамках implementation:

- удалить `useChatUnreadThreadMarkers`;
- убрать `markUnreadThread`/`unreadThreadIds` wiring из `ChatPage`;
- убрать локальный unread-dot API из `ChatHeader`;
- заменить тесты локальных push-dot markers на серверные unread tests;
- заменить app badge increment-by-push на set/clear по server total unread;
- убрать безусловное `clearAppIconBadge` при mount/visibility в `ChatPage`,
  заменив его установкой точного server total.

## Продуктовый Контракт

### Отметка Непрочитанных

Unread появляется только для сообщений, которые backend считает входящими для
конкретного portal user.

Правила получателей повторяют текущую push-логику:

- автор сообщения не получает unread;
- private thread получает mapped portal user, кроме автора;
- group thread получает текущих участников группы, кроме автора;
- недоступный или неизвестный thread не создает unread.

Один пользователь может иметь несколько независимых unread счетчиков:

```text
private:me -> 2
group:154  -> 5
group:155  -> 1
```

Общий count для app badge:

```text
2 + 5 + 1 = 8
```

Все пользовательские totals считаются только по чатам, которые текущий user
сейчас видит и может открыть. Канонический total:

```text
sum(GET /api/chat/threads.threads[].unreadCount)
```

`GET /api/chat/threads` является source of truth для видимого unread state.
`GET /api/chat/messages.unread.totalUnreadCount` и push
`totalUnreadCount` должны использовать то же правило. Если в DB есть unread
rows для чата, который user больше не видит, эти rows не участвуют ни в
меню, ни в app badge, ни в push total.

### Сброс Непрочитанных

При успешной загрузке snapshot для `group:154` backend удаляет unread только
этого чата:

```text
private:me -> 2
group:154  -> 0
group:155  -> 1
total      -> 3
```

Если snapshot не загрузился, пришел error, пользователь offline или открыт
cached snapshot, unread не сбрасывается.

### UI

На самой кнопке меню чатов показываем маленькую красную точку, если есть
unread хотя бы в одном чате, кроме текущего открытого. Точка не показывает
число; ее задача - подсказать пользователю "открой меню, там есть
непрочитанные сообщения".

```text
selectedThreadId = private:me

private:me -> 0
group:154  -> 1
group:155  -> 0

menu button -> red dot
```

Если unread есть только в текущем открытом чате, точку на кнопке меню не
показываем. В нормальном online flow такого состояния почти не должно быть,
потому что успешное открытие текущего чата сбрасывает его unread.

В меню чатов показываем компактный unread badge рядом с названием чата:

- `1`-`99` как число;
- `99+` для больших значений;
- если count равен `0`, badge не показывается.

Красная точка на кнопке меню не заменяет числовые badges внутри меню. Data
model всегда отдает числа, а точка вычисляется на frontend из server counts.

На иконке установленной PWA показываем общий unread count. Если count `0`,
badge очищается.

## Архитектура

### Backend Source Of Truth

Добавить portal-owned таблицу:

```text
portal_chat_unread_messages
```

Поля:

- `id`;
- `tenant_id`;
- `portal_user_id`;
- `portal_chat_thread_id` nullable для resilience;
- `thread_id`;
- `chatwoot_message_id`;
- `created_at`.

Индексы:

- unique `(tenant_id, portal_user_id, thread_id, chatwoot_message_id)`;
- index `(tenant_id, portal_user_id, thread_id)`;
- index `(tenant_id, portal_user_id, created_at)`.

Почему message rows, а не aggregate counter:

- повторный webhook не увеличит count из-за unique key;
- count всегда можно пересчитать обычным `count(*)`;
- delete-on-open прост и idempotent;
- не нужна тяжелая синхронизация всех Chatwoot messages.

### Write Path

На accepted `message_created` webhook:

1. Существующая webhook-service проверяет tenant, signature, account/inbox,
   delivery id и conversation mapping.
2. Новый unread service получает `threadMapping` и `chatwootMessageId`.
3. Service использует тот же recipient resolver, что push delivery.
4. Для каждого recipient делает idempotent insert unread row.
5. Потом push delivery использует уже актуальные counts в payload.

`message_updated` не создает unread. Private Chatwoot messages не создают
unread, как и сейчас не считаются обычным входящим событием.

### Read/Clear Path

`GET /api/chat/messages?threadId=<threadId>` после успешного построения
authoritative snapshot:

1. Проверяет доступ к thread через текущий chat thread runtime.
2. Получает Chatwoot-backed snapshot.
3. Если snapshot успешный и относится к запрошенному `threadId`, получает
   current visible thread list для user и запоминает visible `threadId` values.
4. Затем одной backend DB-операцией удаляет unread rows
   `(tenant_id, portal_user_id, thread_id)` и пересчитывает remaining total
   только по заранее полученным visible `threadId` values.
5. Возвращает snapshot вместе с unread summary.

Clear выполняется только после успешного snapshot и должен быть fail-closed.
Если clear временно упал, endpoint не должен отдавать ложный статус
"прочитано"; для MVP предпочтительно вернуть ошибку либо выполнить clear в той
же успешной backend операции до ответа. Implementation plan должен выбрать
поведение, при котором UI не очищает count без server authority.

После clear backend не должен зависеть от Chatwoot или повторного
`listCurrentUserThreads` для вычисления ответа. Все внешние/current-thread-list
зависимости выполняются до clear. После clear остается только внутренняя
DB-операция: delete opened thread unread + count remaining visible unread.

### Thread List API

`GET /api/chat/threads` должен вернуть unread metadata:

```json
{
  "activeThreadId": "private:me",
  "totalUnreadCount": 8,
  "threads": [
    {
      "id": "private:me",
      "title": "Личный чат",
      "unreadCount": 2
    },
    {
      "id": "group:154",
      "title": "ООО Ромашка",
      "unreadCount": 5
    }
  ]
}
```

Unread counts возвращаются только для threads, которые доступны текущему user в
этом ответе. `totalUnreadCount` всегда равен сумме `unreadCount` по threads из
этого же ответа. Если в DB остались unread rows для больше недоступной group,
они могут быть удалены отдельным cleanup, но correctness не зависит от
cleanup: такие rows не попадают в пользовательские totals.

### Chat Messages API

`GET /api/chat/messages` может вернуть updated unread summary после clear:

```json
{
  "activeThread": { "id": "group:154" },
  "unread": {
    "clearedThreadId": "group:154",
    "totalUnreadCount": 3
  }
}
```

`unread.totalUnreadCount` после clear возвращается той же DB-операцией, которая
очистила открытый thread, используя visible thread ids, полученные до clear. Не
считать здесь все unread rows user из DB, иначе app badge может показать unread
для чатов, которых нет в меню.

### Push Payload

Push payload должен содержать server counts:

```json
{
  "type": "chat_message",
  "threadId": "group:154",
  "threadUnreadCount": 6,
  "totalUnreadCount": 9
}
```

`totalUnreadCount` в push payload - это visible-thread total для recipient, то
есть тот же total, который recipient получил бы из `GET /api/chat/threads`.
Push delivery не должен отправлять app badge total, посчитанный по всем unread
rows user без проверки текущей доступности threads.

Push delivery policy:

- `TTL`: `86400` seconds / 24 hours.
- `Urgency`: `high`.
- Web Push `Topic`: omitted for chat message delivery. A stable per-thread
  Topic can collapse pending push messages while the device is sleeping; chat
  message pushes must be delivered independently.
- Notification `tag`: per-message. Example:
  `portal-chat-message-default-9001`. This lets the browser/OS keep separate
  system notifications for separate messages when the portal is backgrounded.
- Notification `renotify`: omitted for per-message chat notifications. Duplicate
  delivery of the same message may replace the same notification tag, but it
  must not ask the OS to play an extra alert sound.

Service worker не должен увеличивать badge на `+1` локально. Он должен:

- если `totalUnreadCount` есть, вызвать `setAppBadge(totalUnreadCount)`;
- если count `0`, очистить badge;
- если count отсутствует, не делать локальный increment. Новый product contract
  требует server total; legacy migration fallback не нужен.

Накопившиеся system/browser push notifications не являются unread state.
Количество висящих notifications, их закрытие, клик по ним или отсутствие
закрытия сами по себе не должны увеличивать, уменьшать или очищать unread
counts. Notification click может только открыть portal; unread очищается только
если после этого backend успешно отдал snapshot открытого thread.

### Push Disabled And Foreground Refresh

Push settings управляют только фоновыми browser notifications и background
service worker delivery. Они не управляют server unread state и не управляют
метками внутри уже открытого портала.

Открытый portal должен обновлять unread через `/api/chat/threads` независимо от
push permission, active subscription и `pushEnabled`:

- при initial chat load;
- при возврате вкладки в `visible`;
- легким foreground interval, пока chat открыт и backend доступен.

Этот foreground refresh обновляет `threads[].unreadCount`, menu red dot,
numeric badges и exact app badge total. Он не очищает unread; clear остается
только за успешным `GET /api/chat/messages?threadId=...`.

Если foreground refresh вернул thread list, где больше нет текущего выбранного
thread, frontend не должен продолжать показывать устаревший snapshot как
активный чат. Нужно перейти через обычный thread selection/snapshot path к
вернувшемуся `activeThreadId`.

### Frontend State

Frontend хранит unread как часть thread list state:

```ts
type ChatThreadSummary = {
  id: string
  unreadCount: number
  ...
}
```

При загрузке `/api/chat/threads`:

- заполняет unread counts;
- обновляет app badge total через browser runtime helper.

При push:

- если payload содержит `threadUnreadCount`, обновляет count этого thread;
- если payload содержит `totalUnreadCount`, обновляет app badge total;
- если pushed thread неизвестен текущему списку, frontend не показывает его в
  меню до следующей загрузки `/api/chat/threads`, но app badge можно обновить
  из payload, потому что payload total уже visible-authoritative.

При успешном open thread:

- selected thread count локально ставится в `0`;
- total пересчитывается из server summary или из локального списка;
- app badge обновляется.

## Модули И Границы

Backend:

- `backend/src/db/notificationSchema.ts` или отдельный unread schema рядом с
  notification schema;
- новая migration;
- repository methods для insert/list/count/delete;
- unread service в `chat-notifications` или отдельном `chat-unread` module;
- webhook integration после accepted message mapping;
- chat threads/messages routes response mapping.

Frontend:

- `ChatThreadSummary.unreadCount`;
- `ChatHeader` numeric per-thread badge rendering;
- `ChatHeader` red dot on the menu button when another thread has unread;
- `ChatPage` thread state updates on push/open;
- foreground `/api/chat/threads` refresh that does not depend on push settings;
- `serviceWorkerRuntime` helper для set/clear app badge by exact count;
- `sw.js` exact badge handling;
- удаление `useChatUnreadThreadMarkers`.

## Reliability Rules

- Inserts idempotent by unique key.
- Clear idempotent by `(tenant, user, thread)`.
- Unread write не зависит от наличия active push subscription.
- Push disabled не отключает unread: пользователь все равно увидит счетчики
  после открытия портала.
- Если push disabled или browser не получил push, background app badge может не
  обновиться мгновенно, но server counts остаются точными и подтянутся при
  следующем foreground load.
- Foreground unread refresh не зависит от push permission, active push
  subscription или `pushEnabled`.
- Browser badge является presentation layer, не source of truth.
- Накопившиеся system notifications являются presentation layer, не source of
  truth; service worker не выводит unread из количества показанных,
  несмахнутых, закрытых или clicked notifications. Click может привести к clear
  только через обычный backend snapshot flow.
- Offline/cached open не очищает server unread.
- Backend не доверяет browser-sent unread values.

## Не В Scope Первого Slice

- Read receipts в Chatwoot.
- Per-message "прочитано".
- Scroll-based read state.
- Multi-device realtime sync of unread clear beyond existing page refresh/push.
- Admin analytics по unread.
- Исторический backfill unread по старым Chatwoot messages.

## Тестирование

Backend:

- webhook `message_created` создает unread для private recipient, но не для
  author;
- group message создает unread для нескольких group participants отдельно;
- duplicate webhook/message id не увеличивает count;
- `GET /api/chat/threads` возвращает per-thread и total counts только для
  доступных threads;
- успешный `GET /api/chat/messages?threadId=...` очищает только этот thread;
- failed/denied/offline-equivalent request не очищает unread.

Frontend:

- chat menu button показывает красную точку, если unread есть в другом чате;
- thread menu показывает numeric unread badge;
- opening thread removes its count and preserves other thread counts;
- old local push marker hook removed;
- opened portal refreshes `/api/chat/threads` for unread counts even when push
  is disabled;
- push payload updates thread count and app badge exact total;
- active opened thread suppresses browser notification without creating a false
  local unread marker.

Service worker:

- `totalUnreadCount=3` sets app badge to `3`;
- `totalUnreadCount=0` clears badge;
- two shown notifications with the same `totalUnreadCount=5` keep setting badge
  to `5`, not `10`;
- repeated pushes for the same thread use the same notification `tag`, so the
  notification center can replace the prior shown notification for that thread;
- active client suppression does not increment badge locally;
- legacy increment behavior is removed.

## Acceptance Criteria

- Server DB stores unread rows per user/thread/message.
- User with private and multiple group chats sees independent counts.
- App icon badge shows server total unread count, not number of push events.
- Pending/shown browser notifications do not change unread counts by being left
  open, dismissed, clicked, or accumulated; click may clear only through the
  normal backend snapshot flow after portal opens.
- Push delivery keeps `TTL=86400`, `Urgency=high`, no Web Push `Topic`, a
  per-message notification `tag`, and no notification `renotify`.
- Opened portal shows menu unread indicators from `/api/chat/threads` even when
  push is disabled.
- Chat menu button shows a red dot when another thread has unread.
- Opening one chat clears only that chat after backend snapshot success.
- Other chat counts remain.
- Local React `Set<threadId>` unread marker implementation is gone.
- Existing push notification delivery behavior still works.
- Offline cached open does not mark messages as read.
