# Дизайн Telegram-like Мгновенного Cached Chat Boot

## Цель

Сделать старт установленной PWA похожим на ожидаемое поведение Telegram:
после предыдущего успешного входа пользователь видит сразу сохраненный чат, а
проверка сети, сессии, tenant metadata, списка тредов и свежих сообщений идет в
фоне.

Для возвращающегося пользователя с валидными локальными данными больше не должно быть
последовательности:

```text
native PWA splash -> web splash/white screen -> Открываем кабинет
-> Добро пожаловать/готовим чат -> чат
```

Целевой путь:

```text
native PWA splash -> сохраненный чат
```

Дальше чат сам показывает состояние соединения в рабочей поверхности:
`Соединение...`, `Нет связи`, обычный online presence или очередь сообщений.

## Текущее Состояние По Коду

Service worker уже реализует правильную основу для app shell:

- `frontend/public/sw.js` для `request.mode === 'navigate'` сначала отдает
  cached response через `handleNavigationRequest()`.
- `/api/*` не перехватываются service worker, что правильно: backend остается
  authority для свежих tenant/auth/chat данных.
- Значит проблема VPN/offline-hang не в navigation cache, а в React-level boot.

React startup сейчас устроен online-first с cache fallback:

- `frontend/src/features/tenant/lib/TenantProvider.tsx` открывает cached tenant
  только после `BOOT_CACHE_FALLBACK_MS = 2500`, если online tenant request
  медленный или недоступен.
- `frontend/src/features/auth/lib/AuthSessionProvider.tsx` так же открывает
  cached auth только после fallback timer или online deadline.
- `frontend/src/features/chat/pages/useChatThreadSelection.ts` сначала ждет
  `/api/chat/threads` и `/api/chat/messages`, а cached chat открывает только
  fallback-веткой.
- `frontend/src/app/layouts/ProtectedRoute.tsx` во время `status === 'checking'`
  возвращает `null`, поэтому protected route не может показать чат до auth gate.
- `frontend/src/features/chat/components/ChatLoadingState.tsx` не рисует inline
  UI, но репортит `phase: 'chat'` в root startup overlay.
- `frontend/src/app/AppRoutes.tsx` lazy route fallback репортит
  `phase: 'route'`.
- `frontend/src/features/tenant/startup/StartupSurfaceProvider.tsx` собирает
  tenant/session/route/chat reports и превращает их в full-screen overlay.
- `frontend/index.html` дополнительно содержит pre-root web splash с текстом
  `Открываем кабинет`, который пользователь видит после native splash, если
  React еще не отрисовал чат.

Итог: даже при готовом service worker app shell пользователь ждет несколько
React-gates и видит фазовые экраны. При VPN blackhole `navigator.onLine` может
оставаться `true`, fetch не падает быстро, и приложение висит на startup
surface до fallback/deadline.

## UX Контракт

### Быстрая Связь

Возвращающийся пользователь с сохраненными tenant/auth/chat данными:

- native PWA splash закрывается;
- сразу открывается сохраненный чат из IndexedDB;
- в header коротко отображается `Соединение...`, пока фоновые запросы
  проверяют tenant/auth/chat;
- если фоновые запросы быстро успешны, chat state бесшовно обновляется свежими
  thread/messages/support availability;
- full-screen `Открываем кабинет`, `Добро пожаловать`, chat skeleton и route
  loading screen не показываются.

Первый вход или пользователь без валидного local auth/chat cache:

- текущие auth/online-required/session-check экраны остаются допустимыми;
- это не Telegram-like returning boot, потому что локальной сессии и чата нет.

### Медленная Связь

Возвращающийся пользователь:

- открывается сохраненный чат, без ожидания online requests;
- header показывает `Соединение...`;
- если сеть отвечает позже, чат обновляется в фоне;
- если сеть не отвечает до request timeout, пользователь остается в сохраненном
  чате, header переходит в `Нет связи`, текстовые сообщения можно поставить в
  durable outbox, если storage позволяет.

### Нет Связи

Возвращающийся пользователь:

- открывается сохраненный чат;
- header показывает `Нет связи`;
- показываются только те сообщения и треды, которые были сохранены на этом
  устройстве;
- текст можно поставить в очередь, если offline outbox доступен;
- attachments, voice и действия, требующие backend, остаются disabled;
- приложение не удаляет локальный chat cache из-за network error.

### VPN Blackhole

VPN blackhole трактуется как отдельный обязательный сценарий:

- `navigator.onLine === true` не считается доказательством доступной сети;
- первый paint не зависит от fetch к `/api/tenant`, `/api/auth/me`,
  `/api/chat/threads` или `/api/chat/messages`;
- висящие fetch-запросы не держат startup surface;
- переход `Соединение... -> Нет связи` происходит только внутри chat UI.

### Нет Local Cache Или Cache Нельзя Читать

Если нет tenant/auth/chat cache, есть local signout marker, auth scope не
совпадает с tenant, storage недоступен или cached auth не проходит policy:

- чат не открывается;
- показывается контролируемый экран `Нужно подключение` или
  `Нужно проверить сессию`;
- пользователь может удалить локальные данные, если scope известен;
- приложение не должно висеть на splash бесконечно.

## Продуктовые И Security-границы

- Browser по-прежнему не получает Chatwoot authority.
- Backend остается единственной authority-зоной для auth, session, send,
  realtime и fresh Chatwoot read model.
- Local cached chat - это display/read model, а не доказательство актуальной
  серверной сессии.
- Network failure, timeout и VPN blackhole не инвалидируют local cache.
- Authoritative backend rejection инвалидирует соответствующий local scope:
  tenant rejection удаляет tenant cache, auth 401 очищает rejected auth snapshot,
  local signout marker блокирует cached open.
- В этой спеки не расширяем lifetime auth beyond текущей policy. Сохраненный
  protected chat открывается мгновенно только если `readCachedAuthSession()` по
  локальным правилам считает snapshot допустимым. Если нужен Telegram-style
  multi-day/multi-week offline protected display, это отдельное security
  решение, потому что оно меняет баланс privacy/access на устройстве.
- Offline text outbox остается best-effort queue. Успешная отправка все равно
  требует backend session при drain.

## Архитектурное Решение

### 1. App Shell Оставляем Cache-first

`frontend/public/sw.js` уже делает нужное для navigation:

```text
cached navigation response first
network refresh only in background
```

Это поведение сохраняем. В этой задаче нельзя возвращать online-first
navigation.

### 2. Portal-owned Startup Surface Удаляем Из Runtime

Глубокий review текущего кода показал, что старый подход живет не только в
`frontend/index.html`. Его поддерживают:

- `portal-pre-root-startup` в `frontend/index.html`;
- `StartupSurfaceProvider` и `StartupSurfaceOverlay` в root app;
- `RouteChunkStartupFallback` в `AppRoutes`;
- `ProtectedRoute` и `PublicAuthRoute`, которые репортят `phase: 'session'`;
- `TenantProvider`, который репортит `tenant` / `tenant_slow`;
- `ChatLoadingState`, который репортит `phase: 'chat'` и `Готовим чат`;
- `AppStartupScreen` как общий full-screen экран `Открываем кабинет`.

Для Telegram-like boot этот слой нужно не обходить, а удалить из runtime:

- удалить static pre-root splash;
- убрать `StartupSurfaceProvider` / `StartupSurfaceOverlay` из `App.tsx`;
- удалить `useStartupSurfaceReport` из tenant/auth/route/chat paths;
- удалить `ChatLoadingState` как startup reporter;
- удалить `AppStartupScreen` и startup surface tests, если после cleanup нет
  production usage.

Контролируемые product states остаются, но это не startup surface:

- `TenantOnlineRequiredState`;
- `ProtectedSessionCheckRequired`;
- `ProtectedSessionError`;
- auth pages;
- `ChatNotReadyState`.

Эти states показывают конкретную проблему или форму входа, а не промежуточный
экран загрузки.

### 3. TenantProvider Становится Cache-first

`TenantProvider` должен читать `offlineStore.readTenantContext(host)` сразу и,
если cache валиден, открыть children как `ready_cached` без ожидания
`BOOT_CACHE_FALLBACK_MS`.

Online tenant request запускается параллельно в фоне:

- success: применить fresh tenant metadata, сохранить cache, перевести status в
  `ready`;
- authoritative rejection: удалить tenant cache и показать online-required;
- network/timeout: оставить `ready_cached`, не показывать startup overlay.

Если cached tenant отсутствует, текущая online-first ветка для первого входа
остается, но без `slow_connection` full-screen surface. Если online tenant не
отвечает и usable cache нет, пользователь получает controlled
`TenantOnlineRequiredState`, а не `Открываем кабинет`.

### 4. AuthSessionProvider Становится Cache-first

`AuthSessionProvider` должен читать `readCachedAuthSession()` сразу после tenant
context и, если snapshot допустим, открыть protected tree как
`authenticated/cached` без ожидания online `/api/auth/me`.

`getCurrentSession()` запускается параллельно в фоне:

- success с session: сохранить fresh auth snapshot, перевести source в `online`;
- success без session или 401: очистить rejected auth scope и перевести в
  unauthenticated/session-required по текущим правилам;
- network/timeout: оставить cached authenticated state.

`ProtectedRoute` при cached authenticated state не должен участвовать в startup
surface.

### 5. ChatPage Открывает Local Read Model Первым

`useChatThreadSelection.loadInitialChat()` должен поменять порядок:

```text
readOfflineChatFallback() -> если есть cache, сразу setPageState(ready cached)
background getChatThreads()/getChatMessages()
```

Без cache:

```text
online getChatThreads()/getChatMessages()
network failure -> controlled ChatNotReadyState
```

Для cached boot больше не нужен `BOOT_CACHE_FALLBACK_MS` как UX gate. Timer
может остаться только как deadline для local IndexedDB read, чтобы не зависнуть
при corrupted/blocked storage. Такой local deadline должен вести в controlled
state, а не в startup surface.

### 6. Connection State Разделяем С Freshness

Сейчас `ChatPage.tsx` вычисляет:

```ts
const isConnectionAvailable = isBrowserOnline && !isUsingCachedChatData
```

Это смешивает две разные вещи:

- есть ли сеть/backend reachability;
- является ли текущий snapshot cached.

Нужно разделить:

```text
chatReachability: connecting | online | offline
dataFreshness: cached | fresh
```

Поведение:

- cached boot starts as `chatReachability: connecting`, `dataFreshness: cached`;
- фоновые запросы успешны: `online/fresh`;
- фоновые запросы network/timeout: `offline/cached`;
- `navigator.onLine === false`: сразу `offline`;
- request-detected status 0: `offline`, даже если navigator says online.

`isUsingCachedData` не должен навсегда выключать realtime/support/outbox drain
после successful background refresh.

### 7. Header И Alerts

Header становится главным местом connection feedback:

- `Соединение...` - идет background refresh или reachability unknown;
- `Нет связи` - backend недоступен или browser offline;
- обычный support availability - fresh online state.

`ChatRuntimeAlerts` не должен показывать большой startup-like баннер на каждом
cached boot. Он нужен для:

- queued send count;
- явной offline warning после failed/background refresh;
- resync error;
- unsupported realtime.

Для cached boot с `Соединение...` достаточно header presence.

### 8. Thread Selection Тоже Cache-first

При выборе другого треда:

- если snapshot треда есть в local cache, сразу открыть его;
- затем refresh selected thread в фоне;
- если cache нет, а сеть недоступна, показать controlled inline error для
  выбранного треда, не закрывая всю chat surface;
- network error не должен сбрасывать список тредов.

### 9. Offline Older History

Текущий cache хранит только один bounded snapshot на тред:

- store: `chat_message_snapshots`;
- limit: `OFFLINE_MESSAGE_SNAPSHOT_LIMIT = 50`;
- `toBoundedOfflineMessageSnapshot()` обрезает историю до последних сообщений.

Это не даст Telegram-like прокрутку на месяцы, даже если пользователь раньше
загружал старые страницы онлайн.

Нужно добавить persisted message page cache:

```text
chat_message_pages
key: tenantSlug:userId:threadId:pageCursor
```

Где:

- `pageCursor = latest` для первой свежей страницы;
- `pageCursor = before:<messageId>` для ответа на
  `/api/chat/messages?beforeMessageId=<messageId>`;
- record хранит `snapshot`, `savedAt`, `tenantSlug`, `userId`, `threadId`,
  `pageCursor`, `nextOlderCursor`.

Online загрузка latest и older pages сохраняет соответствующие pages.

Offline `Загрузить более ранние сообщения`:

- если есть cached page для текущего `nextOlderCursor`, мержит ее локально;
- если cached page отсутствует, показывает компактное сообщение
  `Более ранние сообщения не сохранены на этом устройстве.`;
- не делает network request при `chatReachability: offline`.

Старый `chat_message_snapshots` можно оставить как fast boot snapshot. Новый
`chat_message_pages` дополняет его для ранее просмотренной истории.

### 10. Outbox И Background Sync Не Ломаем

Существующая durable text queue сохраняется:

- `useOptimisticTextSend.ts`;
- `offlineTextOutboxQueue.ts`;
- `useChatOutboxDrainIntegration.ts`;
- service worker background sync в `frontend/public/sw.js`.

При добавлении нового IndexedDB store нужно обновить:

- `frontend/src/features/offline/types.ts`;
- `frontend/src/features/offline/offlineDatabase.ts`;
- `frontend/src/features/offline/offlineStore.ts`;
- `frontend/public/sw.js`;
- SW tests, потому что worker вручную дублирует database name/version/store list.

## Машина Состояний

Возвращающийся cached user:

```text
app shell from SW
  -> tenant cached? yes -> render providers
  -> auth cached? yes -> protected route
  -> chat cached? yes -> ChatPage ready/cached
  -> background tenant/auth/chat refresh
      -> success: fresh/online
      -> network timeout: cached/offline
      -> authoritative rejection: controlled logout/session/tenant state
```

First/no-cache user:

```text
app shell from SW
  -> tenant cache missing
  -> online tenant/auth required
      -> success: normal app
      -> network missing: online-required/session-check
```

VPN blackhole:

```text
app shell from SW
  -> local cached tenant/auth/chat opens
  -> background fetch hangs until timeout
  -> chat stays visible
  -> header switches Соединение... -> Нет связи
```

## Критерии Приемки

- Возвращающийся пользователь с cached tenant/auth/chat открывает `/app/chat` без visible
  `Открываем кабинет`, `Добро пожаловать`, route loader, chat skeleton or
  startup overlay.
- В production frontend runtime не остается `StartupSurfaceProvider`,
  `StartupSurfaceOverlay`, `useStartupSurfaceReport`, `ChatLoadingState`,
  `RouteChunkStartupFallback`, `portal-pre-root-startup` и `AppStartupScreen`,
  если у них нет нового конкретного non-startup назначения.
- В `frontend/src` и `frontend/index.html` не остается пользовательских
  loading-copy строк `Открываем кабинет`, `Готовим чат`, `Загружаем экран`,
  `Добро пожаловать` для startup flow.
- Cached chat appears before `BOOT_CACHE_FALLBACK_MS`; tests should not need to
  advance 2500ms to see saved messages.
- With VPN-like hanging `/api/tenant`, `/api/auth/me`, `/api/chat/threads` and
  `/api/chat/messages`, saved chat still opens and stays interactive.
- `navigator.onLine === true` with hanging API is treated as `Соединение...`
  then `Нет связи`, not as a reason to block cached boot.
- Online success after cached boot replaces cached state with fresh state and
  re-enables realtime/support/outbox drain behavior.
- Network failure does not delete tenant/auth/chat cache.
- Auth 401 and authoritative tenant rejection still invalidate the correct local
  scope and do not leave protected data open after rejection is known.
- Offline text queue behavior remains: text can be queued when storage policy
  allows; attachments/voice stay disabled offline.
- Previously loaded older message pages can be loaded offline from local cache.
- Missing older cached page shows a compact inline message, not a full-screen
  loader and not a failed network retry.
- First login, missing cache, expired/disallowed cached auth, storage loss and
  local signout marker still show controlled auth/online-required states.
- Service worker navigation remains cache-first.

## Тестовая Стратегия

Frontend unit/runtime:

- `TenantProvider.test.tsx`: cached tenant opens immediately, not after
  `BOOT_CACHE_FALLBACK_MS`; hanging online request does not show startup overlay
  when cache exists.
- `AuthSessionProvider.offline.test.tsx`: cached auth opens immediately; delayed
  online success still wins later; local signout and expired/disallowed policy
  remain blocked.
- `ChatPage.offline-cache.test.tsx`: hanging chat bootstrap opens cached
  messages immediately; no startup surface text appears; reconnect refreshes to
  online/fresh.
- `offlineChatCache.test.ts`: latest page and older page persistence/read/merge
  behavior.
- `ChatHeader.test.tsx` and `ChatRuntimeAlerts.test.tsx`: `Соединение...`,
  `Нет связи`, queued count and resync states.
- `indexHtml.test.ts`: no branded pre-root `Открываем кабинет` screen.
- Static startup cleanup check: no production import/use of
  `StartupSurfaceProvider`, `useStartupSurfaceReport`, `ChatLoadingState` or
  `AppStartupScreen`.
- `serviceWorkerBackgroundSync.test.ts`: database version/store list stays in
  sync after adding message pages.

Playwright:

- Extend `tests/e2e/offline-first-pwa.spec.ts` with VPN blackhole case:
  login online, ensure SW controls page, hang tenant/auth/chat API while
  navigator remains online, reload, assert saved chat visible quickly and no
  startup text appears.
- Extend same spec for full offline reload after previous online use.
- Добавить offline older-page case: загрузить older page online, перезагрузить
  offline, затем загрузить ту же older page из cache.

## Риски И Ограничения

- IndexedDB is async. The app cannot render real cached messages before local
  read resolves. The target is no intentional online wait and no portal-owned
  startup screen, not zero-millisecond DOM paint.
- Lazy route chunks must be present in the service worker static cache. If a
  chunk was never cached or a new deployment invalidates it, returning boot can
  still need network for that code path. Production build stamping must keep
  route chunks in `APP_SHELL_URLS`.
- Existing auth policy remains. A user whose cached auth is locally rejected by
  policy will not get Telegram-like chat display until a separate security
  decision changes that policy.
- Offline history is only as deep as pages previously saved on this device.
  This matches offline-first cache semantics; it is not server history without
  network.
- Browser storage eviction can remove cache. Then the app must show controlled
  storage/online-required state.

## Саморевью Спеки

- Спека не меняет source of truth: service worker и IndexedDB дают только local
  read model, а backend остается authority для session, send, realtime и fresh
  chat.
- После review старого кода спека требует удалить startup surface как runtime
  слой, а не только скрыть его на счастливом cached path.
- Самый важный UX defect покрыт прямо: cached tenant/auth/chat больше не должны
  ждать online request или `BOOT_CACHE_FALLBACK_MS`.
- VPN blackhole выделен отдельно, потому что `navigator.onLine === true` не
  должен блокировать cached boot.
- Auth lifetime намеренно не расширен. Это снижает риск случайно открыть
  protected cache за пределами текущей local auth policy.
- Offline older history добавлен как отдельная часть дизайна, потому что без
  page cache текущий `chat_message_snapshots` с лимитом 50 сообщений не может
  дать Telegram-like прокрутку ранее просмотренной истории.
- Реализацию лучше вести по слоям: сначала убрать startup blockers и
  flicker, затем привести connection UI, затем добавить page cache для older
  history. План должен сохранить этот порядок.

## Вне Scope

- Changing Chatwoot authority boundaries.
- Direct browser access to Chatwoot.
- Replacing backend session validation.
- Infinite offline auth lifetime.
- Full offline search across all historical messages.
- Offline attachment/media download cache.
- Push notification redesign.
