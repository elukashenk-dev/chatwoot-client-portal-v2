# Уведомления

## Решение

Реализуем уведомления в двух уровнях:

1. `Настройки -> Уведомления` - глобальные настройки пользователя в текущем
   tenant.
2. `Чат -> Уведомления` - настройки конкретного chat thread по выбранному
   визуальному варианту `C. Menu + Page`.

Глобальная страница задает default-поведение для всех чатов пользователя:

- `Новые сообщения`;
- `Звук`;
- `Push-уведомления`;
- push на текущем устройстве.

В меню чата остается один понятный вход:

```text
Уведомления
Push включены · звук включен
```

На странице выбранного чата показываем настройки этого thread:

- `Новые сообщения`;
- `Звук`;
- `Push-уведомления`.

По умолчанию чат наследует глобальные настройки. Пользователь может
переопределить конкретный чат и отдельно сбросить его к общим настройкам.

Email-уведомления, рассылки, digest-письма, marketing/CRM notifications и
offline email delivery не входят в текущий scope.

## Почему Так

Для messenger-like интерфейса уведомления должны быть полезными, управляемыми и
не навязчивыми:

- пользователь должен иметь глобальное место, где можно выключить все
  interruptive notifications;
- пользователь должен понимать, когда он меняет общие настройки, а когда только
  конкретный чат;
- browser permission для push нельзя запрашивать при открытии страницы;
- push должен включаться только после явного действия пользователя;
- у пользователя всегда должен быть понятный способ отключить уведомления;
- настройки должны поддерживать глобальные defaults и thread overrides, потому
  что личка и группы могут иметь разную важность;
- системные push payloads в первом slice не должны раскрывать текст сообщения,
  автора, имя файла, Chatwoot IDs или текущий `threadId`.

Этот slice осознанно открывает ранее deferred блок Push Notifications по
продуктовому решению от `2026-05-23`, но делает это в минимальной безопасной
модели: generic push payload, tenant/user global preferences, thread-scoped
overrides, browser feature detection и без email-канала.

## Scope

Глобальные настройки относятся к текущему tenant/user:

```text
tenant + portal user
```

Thread settings относятся к текущему chat thread:

- `private:me`;
- `group:<contactId>`, если текущий portal user все еще имеет доступ к группе.

Thread override persistence scope:

```text
tenant + portal user + threadId
```

Один portal user может иметь общие настройки для tenant и разные override для
личного чата и каждой группы. Одинаковый email в другом tenant получает
отдельные независимые настройки.

## Пользовательская Модель

`Новые сообщения` в глобальных настройках - master switch для interruptive
notifications во всем tenant для текущего пользователя.

Если глобально выключено:

- звук и push не работают ни в одном чате;
- thread-level override не может включить уведомления поверх глобального hard
  off;
- transcript, realtime updates и future in-app unread state продолжают
  работать.

`Новые сообщения` на странице чата - thread-level override.

Если включено:

- портал может использовать разрешенные каналы для этого чата, если глобальный
  master switch тоже включен;
- `Звук` и `Push-уведомления` работают согласно effective settings.

Если выключено:

- звук и push для этого чата фактически muted;
- значения thread overrides для `soundEnabled` и `pushEnabled` сохраняются,
  чтобы при повторном включении `Новые сообщения` вернуть прежние
  поднастройки;
- transcript, realtime updates и future in-app unread state продолжают
  работать.

Важно: `Новые сообщения` не означает "не загружать новые сообщения" и не должен
ломать unread/badge foundation. Это только управление interruptive channels.

`Звук` в глобальных настройках - default для всех чатов. `Звук` на странице
чата - override для конкретного thread.

Effective `Звук` - короткий in-portal звук, когда портал открыт в браузере и
приходит новое client-visible сообщение.

Звук не проигрывается:

- для сообщений текущего пользователя;
- если выключены `Новые сообщения`;
- если выключен `Звук`;
- если сообщение не относится к текущему tenant/user/thread authority;
- если браузер заблокировал playback autoplay policy.

Если браузер заблокировал звук, портал не меняет настройку и не показывает
ошибку как failure сохранения. Это runtime limitation, а не ошибка preference.

`Push-уведомления` в глобальных настройках - default-разрешение использовать Web
Push для чатов пользователя. `Push-уведомления` на странице чата - override для
конкретного thread.

Effective `Push-уведомления` - разрешение отправлять системные уведомления
браузера/PWA через Web Push для этого чата.

Effective settings считаются так:

```text
effective.newMessagesEnabled =
  global.newMessagesEnabled && (thread.newMessagesEnabledOverride ?? true)

effective.soundEnabled =
  effective.newMessagesEnabled &&
  (thread.soundEnabledOverride ?? global.soundEnabled)

effective.pushEnabled =
  effective.newMessagesEnabled &&
  (thread.pushEnabledOverride ?? global.pushEnabled)
```

Push не заменяет realtime transcript. Это дополнительный канал для случаев,
когда портал свернут, открыт в другой вкладке или пользователь не смотрит на
чат.

Важно разделять две сущности:

- global `pushEnabled` отвечает за default для пользователя в tenant;
- thread `pushEnabled` отвечает только за override конкретного thread;
- browser/device push subscription отвечает за возможность этого браузера
  получать push для текущего tenant/user.

Выключение `Push-уведомления` на странице чата не удаляет browser subscription,
потому что эта subscription может использоваться другими чатами. Device-level
отписка остается отдельным действием `Отключить push на этом устройстве`.

## UI

### Меню `Настройки`

Добавляем верхнеуровневый вход `Настройки`, если в текущем UI его еще нет.
Внутри первого slice нужна страница:

```text
Настройки
Уведомления
```

Страница `Настройки -> Уведомления`:

- top bar: back button + title `Уведомления`;
- settings card:
  - `Новые сообщения`;
  - `Звук`;
  - `Push-уведомления`;
- device card:
  - browser permission state;
  - current browser subscription state;
  - action `Отключить push на этом устройстве`, если subscription есть.

Эта страница не показывает список чатов и не становится notification center.
Она управляет defaults и текущим browser/device push capability.

### Меню Чата

Пункт меню:

```text
Уведомления
<status line>
```

Status line:

- `Push включены · звук включен`;
- `Push выключены · звук включен`;
- `Без звука`;
- `Уведомления отключены`;
- `Проверяем настройки`;
- `Недоступно`.

Меню не показывает отдельные переключатели. Оно дает контекст и открывает
страницу настроек.

### Страница `Уведомления`

Используем существующий `ChatFullScreenPanel` и те же width/layout boundaries,
что у `Информация о чате`, `Медиа и файлы` и `Поиск по чату`.

Структура:

- top bar: back button + title `Уведомления`;
- thread header: название чата и `Личный чат` / `Групповой чат`;
- inheritance status:
  - `Используются общие настройки`;
  - `Есть настройки для этого чата`;
  - `Общие уведомления отключены`;
- settings card:
  - `Новые сообщения`;
  - `Звук`;
  - `Push-уведомления`;
- action `Сбросить к общим настройкам`, если у thread есть override;
- browser permission block for push;
- compact unavailable/retry state, если настройки не загрузились.

### Push Permission States

Страница не вызывает browser permission prompt при открытии.

Состояния:

- `unsupported`: browser/PWA runtime не поддерживает нужные API;
- `default`: пользователь еще не давал разрешение, включение push показывает
  наш pre-prompt/объяснение и затем системный prompt;
- `granted`: можно создать или обновить push subscription;
- `denied`: системный prompt больше не показываем, даем краткую инструкцию
  открыть настройки браузера/устройства.

Permission request запускается только после явного действия пользователя на
нашей странице, например включения `Push-уведомления`.

Когда permission уже `granted`, включение `Push-уведомления`:

1. на глобальной странице включает global `pushEnabled`;
2. на странице чата включает thread-level override `pushEnabled`;
3. создает или обновляет browser subscription, если ее еще нет или она устарела.

Когда пользователь выключает `Push-уведомления` на глобальной странице, меняется
global default. Browser subscription не удаляется.

Когда пользователь выключает `Push-уведомления` на странице чата, меняется
только thread-level override `pushEnabled`. Browser subscription не удаляется.

Отдельное действие `Отключить push на этом устройстве` удаляет browser
subscription текущего устройства и делает push недоступным для всех чатов на
этом браузере, пока пользователь не включит push заново.

## Browser/PWA Best Practices

Реализация должна следовать текущим browser/PWA ограничениям:

1. Не спрашивать разрешение на push при page load.
2. Использовать settings panel/pre-prompt: сначала объяснить пользу, потом
   запускать browser prompt.
3. Делать feature detection, а не browser detection:
   - `window.isSecureContext`;
   - `navigator.serviceWorker`;
   - `window.PushManager`;
   - `window.Notification`;
   - `ServiceWorkerRegistration.pushManager`.
4. Подписывать push только после `navigator.serviceWorker.ready`.
5. Вызывать `pushManager.subscribe()` только в ответ на user gesture.
6. Всегда использовать `userVisibleOnly: true`.
7. Передавать VAPID public key в `applicationServerKey`; VAPID private key
   остается только на backend.
8. Каждый real push должен давать user-visible effect: если portal window уже
   открыт и focused, service worker может передать событие в страницу через
   `postMessage`; если focused окна нет - показать system notification.
   Полностью silent push в этом slice не используем.
9. На `notificationclick` закрывать notification, фокусировать уже открытую
   вкладку portal origin, а если такой вкладки нет - открывать safe same-origin
   URL.
10. Не полагаться только на `pushsubscriptionchange`: событие полезно, но не
    одинаково надежно во всех браузерах. Дополнительно обновлять subscription
    при открытии страницы уведомлений и при старте PWA runtime.
11. При `410 Gone`, `404 Not Found` или аналогичных push-service ответах
    выключать/удалять устаревшую subscription.
12. Не использовать notification `sound` option как нашу настройку звука:
    системный звук push контролируется OS/browser. Наш `Звук` - только
    in-portal audio для открытого портала.

### iOS/iPadOS

Для iOS/iPadOS Web Push поддерживается только для web apps, добавленных на Home
Screen, начиная с iOS/iPadOS 16.4. Поэтому:

- UI должен уметь показывать `unsupported` в обычном Safari/browser context;
- нельзя обещать push на iPhone, если портал не установлен как Home Screen app;
- используем feature detection, а не проверку `iOS`;
- permission request все равно должен быть результатом прямого действия
  пользователя;
- системные Focus/notification settings остаются под контролем iOS.

## Backend Contract

Все endpoints same-origin `/api`, authenticated и tenant-scoped по
request host/session.

```text
GET /api/notifications/settings
PATCH /api/notifications/settings
GET /api/chat/threads/:threadId/notification-settings
PATCH /api/chat/threads/:threadId/notification-settings
GET /api/notifications/push/public-key
POST /api/notifications/push/subscriptions
DELETE /api/notifications/push/subscriptions
```

Global settings response:

```ts
type UserNotificationSettingsResponse = {
  result: 'ready' | 'not_ready' | 'unavailable'
  reason:
    | 'none'
    | 'settings_unavailable'
    | 'push_not_configured'
    | 'push_unsupported'
  settings: UserNotificationSettings | null
}

type UserNotificationSettings = {
  newMessagesEnabled: boolean
  soundEnabled: boolean
  pushEnabled: boolean
}
```

Thread settings response:

```ts
type ChatNotificationSettingsResponse = {
  result: 'ready' | 'not_ready' | 'unavailable'
  reason:
    | 'none'
    | 'thread_not_found'
    | 'access_denied'
    | 'push_not_configured'
    | 'settings_unavailable'
  settings: ChatNotificationSettings | null
}

type ChatNotificationSettings = {
  threadId: string
  global: UserNotificationSettings
  overrides: {
    newMessagesEnabled: boolean | null
    soundEnabled: boolean | null
    pushEnabled: boolean | null
  }
  effective: UserNotificationSettings
}
```

`PATCH /api/notifications/settings` принимает partial global settings и
возвращает полное нормализованное состояние.

`PATCH /api/chat/threads/:threadId/notification-settings` принимает partial
thread overrides. Значение `null` сбрасывает конкретное поле к наследованию
global setting. Отдельное действие `Сбросить к общим настройкам` отправляет все
три override как `null`.

Если effective `newMessagesEnabled` становится `false`, delivery logic считает
`soundEnabled` и `pushEnabled` muted, даже если stored global/thread channel
settings остаются `true`.

`GET /api/notifications/push/public-key` возвращает public VAPID key, если Web
Push настроен. Если push не настроен, endpoint возвращает controlled
`not_ready`/`unavailable` state без раскрытия backend configuration details.

`POST /api/notifications/push/subscriptions` создает или обновляет subscription
для текущего tenant/user/browser endpoint.

`DELETE /api/notifications/push/subscriptions` удаляет subscription текущего
tenant/user по endpoint. Это device-level unsubscribe, а не thread-level
настройка. Пользователь должен иметь понятный способ отключить push на текущем
устройстве из UI, но обычное выключение `Push-уведомления` для одного чата не
должно вызывать этот endpoint.

## Persistence

Добавляем portal-owned таблицы:

```text
portal_user_notification_preferences
portal_chat_notification_preferences
portal_push_subscriptions
portal_push_deliveries
```

### `portal_user_notification_preferences`

Поля:

- `tenant_id`;
- `portal_user_id`;
- `new_messages_enabled`;
- `sound_enabled`;
- `push_enabled`;
- timestamps.

Unique key:

```text
tenant_id + portal_user_id
```

Defaults:

- `new_messages_enabled = true`;
- `sound_enabled = true`;
- `push_enabled = false`.

Эта таблица задает defaults для всех чатов пользователя в tenant.

### `portal_chat_notification_preferences`

Поля:

- `tenant_id`;
- `portal_user_id`;
- `thread_id`;
- `new_messages_enabled_override`;
- `sound_enabled_override`;
- `push_enabled_override`;
- timestamps.

Unique key:

```text
tenant_id + portal_user_id + thread_id
```

Override fields nullable:

- `null` означает inherit global setting;
- `true` означает включить для thread, если global master switch не выключен;
- `false` означает выключить для thread.

### `portal_push_subscriptions`

Поля:

- `tenant_id`;
- `portal_user_id`;
- `endpoint`;
- `p256dh`;
- `auth`;
- `vapid_key_id`;
- `vapid_public_key_fingerprint`;
- `user_agent`;
- `status`;
- `last_error`;
- `last_error_at`;
- timestamps.

Endpoint уникален в рамках tenant/user enough, чтобы не отправлять один push
несколько раз в один browser subscription.

Expired/rejected subscriptions выключаются или удаляются при send attempts.

### `portal_push_deliveries`

Минимальная таблица для duplicate suppression:

- `tenant_id`;
- `portal_user_id`;
- `thread_id`;
- `chatwoot_message_id`;
- `status`;
- timestamps.

Unique key:

```text
tenant_id + portal_user_id + thread_id + chatwoot_message_id
```

Эта таблица не дает повторно отправить push при повторной webhook delivery.

## Delivery Rules

### In-App Sound

Frontend проигрывает звук, когда в active runtime stream появляется новое
сообщение и все условия выполняются:

1. сообщение client-visible;
2. сообщение принадлежит выбранному thread;
3. сообщение не отправлено текущим portal user;
4. effective `newMessagesEnabled === true`;
5. effective `soundEnabled === true`;
6. портал уже получил user interaction, достаточный для audio playback.

Sound asset должен быть коротким, локальным, без внешних requests и без
зависимости от Chatwoot URLs.

### Push

Backend рассматривает push только для Chatwoot webhook event `message_created`.
`message_updated` обновляет realtime transcript как раньше, но не отправляет
push в первом slice.

Push delivery requires non-null `chatwoot_message_id`. Если webhook payload не
содержит корректный message id, push не отправляется и запись в
`portal_push_deliveries` не создается.

Backend отправляет push после Chatwoot webhook processing, только через portal
authority:

1. resolve tenant из webhook host/signature;
2. проверить Chatwoot account/inbox invariants;
3. смэппить message через те же client-visible rules, что transcript;
4. resolve portal thread;
5. найти portal users текущего tenant, которые все еще имеют доступ к thread;
6. пропустить автора сообщения, если он определяется как текущий portal user;
7. вычислить effective settings из global settings и thread overrides;
8. проверить effective `newMessagesEnabled` и effective `pushEnabled`;
9. проверить active push subscriptions для tenant/user;
10. применить duplicate suppression по `portal_push_deliveries`;
11. отправить generic push payload.

### Push Recipient Resolver

Recipient resolver должен быть bounded и fail-closed.

Private thread:

- recipient candidate - только `portal_chat_threads.portal_user_id` mapped
  private thread;
- если mapped user отсутствует или inactive, push не отправляется;
- если автор сообщения определяется как этот portal user, push не отправляется.

Group thread:

1. candidate users берутся из tenant-scoped active `portal_user_contact_links`;
2. для каждого candidate backend загружает person contact из Chatwoot;
3. contact должен проходить текущую portal person attribute validation;
4. `groupContactIds` должен содержать group contact id текущего thread;
5. candidate с missing/invalid/stale Chatwoot contact пропускается fail-closed;
6. candidate-автор сообщения пропускается, если автор определяется через send
   ledger;
7. Chatwoot membership checks выполняются с явным concurrency limit и timeout,
   чтобы webhook processing не зависал на большом tenant.

Если Chatwoot membership check недоступен для конкретного candidate, этому
candidate push не отправляется. Если проверка недоступна глобально, push для
этого webhook пропускается, но realtime delivery остается прежним.

Если такой resolver станет слишком дорогим на production tenants, следующий
slice должен добавить tenant-scoped membership snapshot/cache. В первом slice
нельзя заменять fail-closed check на stale portal-only rows.

Первый push payload:

```json
{
  "type": "chat_message",
  "tenantSlug": "provgroup",
  "url": "/"
}
```

Service worker показывает generic notification:

```text
Новое сообщение
Откройте портал, чтобы посмотреть чат
```

Payload не содержит:

- текст сообщения;
- имя автора;
- имя файла;
- Chatwoot conversation/message/contact IDs;
- `threadId`.

`threadId` тоже исключен из первого slice, потому что публичный group thread id
сейчас содержит Chatwoot group contact id.

Если позже потребуется открывать точный чат из push, делать это нужно через
portal-owned opaque open token с коротким TTL, а не через raw `threadId`.

## Service Worker

Существующий `frontend/public/sw.js` остается PWA runtime entrypoint.

Добавляем:

- `push` handler;
- `notificationclick` handler;
- optional `notificationclose` handler только для diagnostics/analytics, если
  это понадобится;
- safe same-origin navigation.

`push` handler:

- парсит payload defensively;
- для неизвестного payload показывает generic fallback;
- проверяет открытые focused окна текущего origin;
- если focused controlled окно есть и page-side push message listener уже
  зарегистрирован - отправляет `postMessage` в страницу и не показывает system
  notification;
- если focused окна нет - вызывает `registration.showNotification()`;
- если focused окно есть, но delivery в page listener не может быть гарантирован
  текущим runtime contract - вызывает `registration.showNotification()`;
- использует generic `tag`, чтобы не заспамить notification tray повторными
  webhook deliveries;
- не делает browser-direct Chatwoot requests.

Page runtime должен регистрировать `navigator.serviceWorker` message listener
при старте PWA runtime. Этот listener обрабатывает только известные generic push
messages и не доверяет payload как authority. Если listener не активен,
service worker обязан fallback-нуть к system notification, чтобы push не
потерялся молча.

`notificationclick` handler:

- закрывает notification;
- ищет открытую вкладку текущего origin через `clients.matchAll`;
- если вкладка есть - фокусирует ее;
- если вкладки нет - открывает `/`;
- не открывает внешние URLs из payload.

Service worker не должен cache-ить API responses, push payloads или tenant
dynamic metadata. Существующие `no-store` и tenant metadata cache rules остаются.

## Multi-Tenant And Security Requirements

- Browser не получает Chatwoot tokens.
- Browser не вызывает Chatwoot для notifications или push.
- Preferences tenant-scoped и user-scoped.
- Push subscriptions tenant-scoped и user-scoped.
- Push delivery tenant-scoped, user-scoped и thread-access-scoped.
- Group access rechecked before push delivery.
- Unknown/deleted thread mappings fail closed.
- Push payload не содержит sensitive content.
- VAPID private key backend-only.
- Subscription tenant A не может получить notifications tenant B.
- Logs не должны печатать `p256dh`, `auth`, VAPID private key или full push
  endpoint в plaintext.

## Deployment And Runtime Notes

- В первом slice используется один VAPID key pair на portal deployment/environment,
  не отдельный ключ на tenant.
- `GET /api/notifications/push/public-key` остается authenticated и
  tenant-scoped, но возвращает deployment-level public key plus `vapidKeyId`.
- VAPID private key хранится только в backend env/secrets и не является
  tenant-owned runtime secret.
- `portal_push_subscriptions` хранит `vapid_key_id` и public key fingerprint,
  чтобы frontend/backend могли понять, что subscription создана старым ключом.
- При смене VAPID public key frontend должен resubscribe; backend сохраняет
  старые subscriptions только на grace period и затем retired/disabled.
- Production должен иметь VAPID public/private key configuration до включения
  push UI как `available`.
- Если outbound firewall ограничен, нужно разрешить push-service endpoints,
  включая browser-specific endpoints. Для Apple Web Push может понадобиться
  доступ к `*.push.apple.com`.
- Если VAPID не настроен, страница показывает `Push недоступны`, но `Новые
сообщения` и `Звук` продолжают работать.
- Local/dev HTTPS может быть нужен для полного push smoke; обычный Playwright
  flow может покрыть UI/settings без реального system push prompt.

## Non-Goals

- email notifications;
- mailing lists, campaigns, digests или scheduled summaries;
- tenant-admin notification policy screen;
- notification inbox/center со списком всех событий и уведомлений;
- rich push payload с текстом/автором/файлами;
- browser-direct Chatwoot integration;
- Chatwoot core changes;
- marketing или CRM notifications.

## Testing

Backend:

- repository/service tests для global defaults и thread override inheritance;
- repository/service tests для tenant/user/thread uniqueness;
- route tests для auth, tenant scope, thread access и partial updates;
- push public-key/subscription route tests;
- push delivery service tests:
  - safe payload;
  - access filtering;
  - skip current user's own message;
  - duplicate suppression;
  - expired subscription cleanup;
  - push not configured;
- webhook integration tests, которые подтверждают push trigger без ослабления
  существующих tenant checks.

Frontend:

- notification settings API client tests;
- global settings page tests;
- page tests для loading, unavailable, switches и permission states;
- push runtime tests для feature detection и denied/default/granted states;
- sound runtime tests:
  - не играть для текущего пользователя;
  - не играть при muted;
  - не считать autoplay block ошибкой сохранения настройки;
- service worker tests там, где practical:
  - generic notification on push;
  - same-origin focus/open on notification click.

E2E/runtime:

- Playwright: открыть `Настройки -> Уведомления`;
- Playwright: открыть `Уведомления` из chat menu;
- Playwright: переключить `Новые сообщения` и `Звук`;
- Playwright: проверить, что chat page наследует global settings и может
  сбрасывать overrides;
- Playwright: проверить UI states для unsupported/default/denied push через
  mocks;
- documented blocker или manual smoke для настоящего system push prompt, если
  local runner не может надежно автоматизировать browser/OS permission UI.

## Follow-Ups

- portal-owned opaque open token для открытия конкретного чата из push;
- foreground/background duplicate suppression между in-app sound и system push;
- app badge/unread count для PWA, когда появится unread foundation;
- notification inbox/center со списком событий;
- per-tenant admin defaults;
- rich push payload после отдельного privacy decision;
- email/offline notifications, если этот канал явно откроем позже.

## Сверка С Источниками

- MDN Web Push best practices:
  https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices
- MDN Notifications API:
  https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API
- MDN PushManager.subscribe:
  https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- MDN ServiceWorker push event:
  https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event
- web.dev Permission UX:
  https://web.dev/articles/push-notifications-permissions-ux
- web.dev Notification behavior:
  https://web.dev/articles/push-notifications-notification-behaviour
- web.dev Common notification patterns:
  https://web.dev/articles/push-notifications-common-notification-patterns
- WebKit Web Push for iOS/iPadOS:
  https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
