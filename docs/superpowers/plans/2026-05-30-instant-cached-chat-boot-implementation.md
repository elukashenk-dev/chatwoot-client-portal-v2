# План Реализации Telegram-like Мгновенного Cached Chat Boot

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ SUB-SKILL: используйте `superpowers:subagent-driven-development` (recommended) или `superpowers:executing-plans`, чтобы выполнять этот план пошагово. Шаги используют checkbox (`- [ ]`) syntax для tracking.

**Goal / Цель:** возвращающийся пользователь после предыдущего успешного входа открывает установленную PWA сразу в сохраненный чат: без web splash, без `Открываем кабинет`, без `Добро пожаловать`, без route/chat loading surface; tenant/auth/chat проверяются и обновляются в фоне, VPN blackhole не блокирует первый paint, а ранее загруженные older message pages доступны offline.

**Architecture / Архитектура:** service worker navigation остается cache-first. React startup меняется с online-first fallback на local read model first: `TenantProvider`, `AuthSessionProvider` и `ChatPage` открывают допустимый IndexedDB cache сразу, online requests запускают background reconciliation. Chat UI получает отдельные `chatReachability` и `dataFreshness`, чтобы cached data не означала permanent offline. Для истории добавляется IndexedDB store `chat_message_pages`, при этом backend и Chatwoot authority boundaries не меняются.

**Tech Stack / Стек:** TypeScript, React 19, React Router, Vite, IndexedDB через `idb`, Service Worker, Vitest, Testing Library, Playwright.

---

## Исходные Документы

- Spec: `docs/superpowers/specs/2026-05-30-instant-cached-chat-boot-design.md`
- Repo rules: `AGENTS.md`
- Архитектура: `docs/architecture/overview.md`
- Decisions: `docs/architecture/decisions.md`
- Roadmap baseline: `docs/roadmap/work-log.md`

## Правила Выполнения

- Работать на текущей ветке `feature/phase-instant-cached-chat-boot`.
- Не менять Chatwoot core и backend authority boundary.
- Не расширять offline auth lifetime в этой реализации.
- Удалить старый portal-owned startup surface как runtime-слой целиком:
  pre-root web splash, root overlay, route/session/tenant/chat reports и
  связанные full-screen startup components.
- First/no-cache/session-required/online-required states оставить только как
  конкретные product states: login/auth pages, `TenantOnlineRequiredState`,
  `ProtectedSessionCheckRequired`, `ProtectedSessionError`, `ChatNotReadyState`.
- Делать TDD: сначала добавить/изменить targeted tests, увидеть failing behavior, затем править код.
- После каждого слоя прогонять targeted tests, потому что regressions здесь проявляются как race conditions.
- `docs/roadmap/work-log.md` обновлять только после реализации, review и зеленых проверок, если этот slice принимается как новый baseline.

## Задача 0: Проверка Baseline

**Файлы:**

- Читать: `AGENTS.md`
- Читать: `docs/roadmap/work-log.md`
- Читать: `docs/architecture/overview.md`
- Читать: `docs/architecture/decisions.md`
- Читать: `docs/superpowers/specs/2026-05-30-instant-cached-chat-boot-design.md`

- [ ] **Шаг 1: Проверить ветку и ownership изменений**

Выполнить:

```bash
git status --short --branch
```

Ожидаемо:

```text
## feature/phase-instant-cached-chat-boot
```

Если появятся unrelated dirty files, сначала понять ownership. Не откатывать пользовательские изменения.

- [ ] **Шаг 2: Подтвердить текущие startup code paths**

Прочитать:

```text
frontend/src/features/tenant/lib/TenantProvider.tsx
frontend/src/features/auth/lib/AuthSessionProvider.tsx
frontend/src/features/chat/pages/useChatThreadSelection.ts
frontend/src/features/chat/pages/ChatPage.tsx
frontend/src/features/tenant/startup/StartupSurfaceProvider.tsx
frontend/index.html
frontend/public/sw.js
```

Ожидаемый вывод анализа:

```text
Service worker navigation is already cache-first.
Tenant/auth/chat React startup still uses online-first + delayed cache fallback.
```

- [ ] **Шаг 3: Снять no-legacy inventory перед реализацией**

Выполнить:

```bash
rg "StartupSurface|useStartupSurfaceReport|AppStartupScreen|ChatLoadingState|RouteChunkStartupFallback|portal-pre-root-startup|BOOT_CACHE_FALLBACK_MS|BOOT_SLOW_NOTICE_MS|slow_connection|Открываем кабинет|Добро пожаловать|Готовим чат|Загружаем экран" frontend/src frontend/index.html frontend/public/sw.js tests/e2e
```

Зафиксировать список production entrypoints, которые должны исчезнуть в этом
slice. Минимальный ожидаемый список:

```text
frontend/index.html
frontend/src/app/App.tsx
frontend/src/app/AppRoutes.tsx
frontend/src/app/layouts/ProtectedRoute.tsx
frontend/src/app/layouts/PublicAuthRoute.tsx
frontend/src/test/renderWithRouter.tsx
frontend/src/features/tenant/lib/TenantProvider.tsx
frontend/src/features/tenant/lib/tenantIdentityContext.ts
frontend/src/features/tenant/startup/*
frontend/src/features/tenant/components/AppStartupScreen.tsx
frontend/src/features/chat/components/ChatLoadingState.tsx
frontend/src/features/chat/pages/ChatPage.tsx
frontend/src/features/chat/pages/useChatThreadSelection.ts
frontend/src/features/offline/bootCoordinator.ts
```

## Задача 1: Написать Падающие Regression Tests Для Instant Cached Boot

**Файлы:**

- Изменить: `frontend/src/features/tenant/lib/TenantProvider.test.tsx`
- Изменить: `frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx`
- Изменить: `frontend/src/features/chat/pages/ChatPage.offline-cache.test.tsx`
- Изменить: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Изменить: `frontend/src/features/chat/components/ChatHeader.test.tsx`
- Изменить: `frontend/src/features/chat/components/ChatRuntimeAlerts.test.tsx`
- Изменить: `frontend/src/indexHtml.test.ts`

- [ ] **Шаг 1: Добавить тест TenantProvider immediate-cache**

Добавить тест, который сохраняет `cachedTenantRecord()`, заставляет
`/api/tenant` hang, рендерит `TenantProvider` и ожидает `ready_cached` без
продвижения startup/fallback timers.

Assertion не должен вызывать:

```ts
await advanceBootTimers(...)
```

Использовать короткое async ожидание:

```ts
expect(await screen.findByText('ready_cached')).toBeInTheDocument()
expect(screen.queryByRole('heading', { name: 'Открываем кабинет' })).not.toBeInTheDocument()
```

- [ ] **Шаг 2: Добавить тест AuthSessionProvider immediate-cache**

Добавить тест, который сохраняет cached auth, заставляет `/api/auth/me` hang,
рендерит protected route и ожидает protected content/cached source без ожидания
fallback/deadline timers.

Сохранить существующие тесты для expired auth, clock rollback и local signout.

- [ ] **Шаг 3: Добавить unit test ChatPage для VPN blackhole**

In `ChatPage.offline-cache.test.tsx`, change the current hanging request test so
the saved message must appear before any network timeout or fallback timer.

Ожидаемые assertions:

```ts
expect(await screen.findByText('Здравствуйте, вижу ваше обращение.')).toBeInTheDocument()
expect(screen.queryByRole('heading', { name: 'Открываем кабинет' })).not.toBeInTheDocument()
expect(screen.getByRole('status', { name: 'Соединение...' })).toBeInTheDocument()
```

Затем продвинуть request timeout и ожидать `Нет связи`.

- [ ] **Шаг 4: Добавить тест отсутствия visible pre-root splash**

Обновить `frontend/src/indexHtml.test.ts`, чтобы он больше не ожидал
`Открываем кабинет` in static HTML. The test should assert that static HTML does
не содержать branded startup copy:

```ts
expect(source).not.toContain('Открываем кабинет')
```

- [ ] **Шаг 5: Добавить connection tests для header/alerts**

Обновить `ChatHeader.test.tsx`, чтобы покрыть:

```text
connectionStatus=connecting -> role=status "Соединение..."
connectionStatus=offline    -> role=status "Нет связи"
connectionStatus=online     -> support availability presentation
```

Обновить `ChatRuntimeAlerts.test.tsx`, чтобы `connecting` cached boot не рендерил
offline saved-chat banner до перехода reachability в `offline`.

- [ ] **Шаг 6: Запустить targeted failing tests**

Выполнить:

```bash
pnpm --dir frontend test -- src/features/tenant/lib/TenantProvider.test.tsx src/features/auth/lib/AuthSessionProvider.offline.test.tsx src/features/chat/pages/ChatPage.offline-cache.test.tsx src/features/chat/components/ChatHeader.test.tsx src/features/chat/components/ChatRuntimeAlerts.test.tsx src/indexHtml.test.ts
```

Ожидаемо: новые тесты падают на текущей реализации из-за delayed cache fallback
и static pre-root copy.

## Задача 2: Удалить Старый Startup Surface Из Runtime

**Файлы:**

- Изменить: `frontend/index.html`
- Изменить: `frontend/src/indexHtml.test.ts`
- Изменить: `frontend/src/app/App.tsx`
- Изменить: `frontend/src/app/AppRoutes.tsx`
- Изменить: `frontend/src/app/layouts/ProtectedRoute.tsx`
- Изменить: `frontend/src/app/layouts/PublicAuthRoute.tsx`
- Изменить: `frontend/src/test/renderWithRouter.tsx`
- Изменить: `frontend/src/features/tenant/lib/TenantProvider.tsx`
- Изменить: `frontend/src/features/tenant/lib/TenantProvider.test.tsx`
- Изменить: `frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx`
- Изменить: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Изменить: `frontend/src/features/chat/pages/ChatPage.tsx`
- Удалить: `frontend/src/features/tenant/startup/StartupSurfaceProvider.tsx`
- Удалить: `frontend/src/features/tenant/startup/StartupSurfaceProvider.test.tsx`
- Удалить: `frontend/src/features/tenant/startup/startupSurfaceContext.ts`
- Удалить: `frontend/src/features/tenant/startup/startupSurfaceBrand.ts`
- Удалить: `frontend/src/features/tenant/components/AppStartupScreen.tsx`
- Удалить: `frontend/src/features/tenant/components/AppStartupScreen.test.tsx`
- Удалить: `frontend/src/features/chat/components/ChatLoadingState.tsx`
- Удалить: `frontend/src/features/chat/components/ChatLoadingState.test.tsx`

- [ ] **Шаг 1: Удалить branded static startup markup**

Удалить `#portal-pre-root-startup` и его CSS из `frontend/index.html`.

Сохранить base document background согласованным с app shell:

```css
html,
body {
  background: #f3f7fc;
}
```

- [ ] **Шаг 2: Удалить pre-root handoff logic**

Удалить весь runtime layer startup surface:

- убрать `StartupSurfaceProvider` / `StartupSurfaceOverlay` из `App.tsx`;
- убрать wrapper из `frontend/src/test/renderWithRouter.tsx`;
- удалить файлы `features/tenant/startup/*`;
- удалить `AppStartupScreen` и его tests.

- [ ] **Шаг 3: Удалить startup reports из route/session/tenant/chat**

Удалить imports и вызовы:

```text
createStartupSurfaceBrand
useStartupSurfaceReport
```

из:

```text
frontend/src/app/AppRoutes.tsx
frontend/src/app/layouts/ProtectedRoute.tsx
frontend/src/app/layouts/PublicAuthRoute.tsx
frontend/src/features/tenant/lib/TenantProvider.tsx
```

В `ChatPage.tsx` удалить import/use `ChatLoadingState`. Для
`pageState.status === 'loading'` оставить не full-screen startup surface, а
реальный chat shell без отдельного промежуточного экрана. Если нужен feedback
для no-cache first load, добавить компактный inline state внутри transcript
area без `Открываем кабинет` / `Готовим чат`.

- [ ] **Шаг 4: Убрать route startup fallback**

В `AppRoutes.tsx` удалить `RouteChunkStartupFallback`.

Для primary chat route предпочтительно сделать eager import:

```ts
import { ChatPage } from '../features/chat/pages/ChatPage'
```

Settings/auth pages могут остаться lazy, но их `Suspense fallback` должен быть
`null` или нейтральным non-startup fallback без текста `Открываем кабинет` /
`Загружаем экран`.

- [ ] **Шаг 5: Обновить tests после удаления startup surface**

Удалить тесты, которые проверяют:

```text
StartupSurfaceProvider
AppStartupScreen
ChatLoadingState
startup heading while checking session
route startup surface
```

Переписать affected tests так, чтобы они проверяли реальные product states:

```text
login page
protected route redirects/session required
tenant online-required
chat cached/open/error states
```

- [ ] **Шаг 6: Запустить startup cleanup checks**

Выполнить:

```bash
pnpm --dir frontend test -- src/indexHtml.test.ts src/features/tenant/lib/TenantProvider.test.tsx src/features/auth/lib/AuthSessionProvider.offline.test.tsx src/features/auth/pages/LoginPage.test.tsx src/features/chat/pages/ChatPage.test.tsx
rg "StartupSurface|useStartupSurfaceReport|AppStartupScreen|ChatLoadingState|portal-pre-root-startup|Готовим чат|Загружаем экран|Открываем кабинет|Добро пожаловать" frontend/src frontend/index.html
```

Ожидаемо: tests проходят, а `rg` не находит production usage старого startup
surface/copy. Если строка остается только в test expectation или docs, это не
считается runtime usage; в `frontend/src` production code ее быть не должно.

## Задача 3: Сделать TenantProvider Cache-first

**Файлы:**

- Изменить: `frontend/src/features/offline/bootCoordinator.ts`
- Изменить: `frontend/src/features/offline/bootCoordinator.test.ts`
- Изменить: `frontend/src/features/tenant/lib/TenantProvider.tsx`
- Изменить: `frontend/src/features/tenant/lib/TenantProvider.test.tsx`
- Изменить: `frontend/src/features/tenant/lib/tenantIdentityContext.ts`

- [ ] **Шаг 1: Добавить local cache read deadline**

Добавить небольшой local-read deadline constant:

```ts
export const BOOT_LOCAL_CACHE_READ_DEADLINE_MS = 1000
```

Удалить `BOOT_CACHE_FALLBACK_MS` как startup UX gate. Если после cleanup он
больше не нужен в production code, удалить сам constant и связанные tests.
Оставить только:

```ts
BOOT_LOCAL_CACHE_READ_DEADLINE_MS
BOOT_ONLINE_REQUIRED_MS
BOOT_REQUEST_TIMEOUT_MS
```

`BOOT_LOCAL_CACHE_READ_DEADLINE_MS` нужен только чтобы local IndexedDB read не
мог бесконечно держать boot.

- [ ] **Шаг 2: Открывать cached tenant сразу**

В `startTenantLoad()`:

1. Стартовать `cachedTenantPromise` сразу с
   `BOOT_LOCAL_CACHE_READ_DEADLINE_MS`.
2. Подписать `cachedTenantPromise.then(openCachedTenant)` сразу, не внутри
   `BOOT_CACHE_FALLBACK_MS` timer.
3. Стартовать `onlineTenantPromise` параллельно.
4. Не выставлять `slow_connection`: старый промежуточный экран больше не нужен.

Форма реализации:

```ts
void cachedTenantPromise.then((cachedTenant) => {
  if (openCachedTenant(cachedTenant)) {
    return
  }

  // Missing cache is not an error while online request may still succeed.
})
```

Если `BOOT_CACHE_FALLBACK_MS` удален, комментарий выше можно оставить на
английском только если файл уже в таком стиле; иначе написать коротко по-русски
не нужно, комментарий можно не добавлять.

- [ ] **Шаг 3: Сохранить authoritative tenant behavior**

Сохранить текущее поведение:

```text
TENANT_NOT_FOUND / disabled / forbidden -> delete tenant cache -> online_required
network or timeout after cached open -> keep ready_cached
```

- [ ] **Шаг 4: Удалить slow/startup tenant state**

В `tenantIdentityContext.ts` удалить `slow_connection`, если после removal
startup surface он больше не нужен.

В `TenantProvider.tsx` удалить:

```text
BOOT_SLOW_NOTICE_MS
setTenantStatus('slow_connection')
useStartupSurfaceReport(...)
phase tenant / tenant_slow
```

В `bootCoordinator.ts` удалить `BootRuntimeState` и
`getBootStatusForElapsedMs()`, если они больше нигде не используются.

- [ ] **Шаг 5: Запустить tenant tests**

Выполнить:

```bash
pnpm --dir frontend test -- src/features/tenant/lib/TenantProvider.test.tsx src/features/offline/bootCoordinator.test.ts
```

Ожидаемо: cached tenant test проходит без fallback timer; no-cache и
authoritative rejection tests проходят без startup surface/slow screen.

## Задача 4: Сделать AuthSessionProvider Cache-first Без Расширения Auth Lifetime

**Файлы:**

- Изменить: `frontend/src/features/auth/lib/AuthSessionProvider.tsx`
- Изменить: `frontend/src/features/auth/lib/AuthSessionProvider.offline.test.tsx`
- Читать: `frontend/src/features/auth/lib/offlineAuthSession.ts`

- [ ] **Шаг 1: Разделить cached-auth open modes**

Обновить `openCachedSession()`, чтобы поддержать два режима:

```ts
type CachedSessionOpenMode = 'authenticated_only' | 'allow_session_check_required'
```

Поведение:

- `authenticated_only`: opens only `status: 'authenticated'`; if cache is
  missing/expired/disallowed, returns false and lets online `/api/auth/me`
  continue.
- `allow_session_check_required`: current behavior for network failure/deadline;
  can show `session_check_required`.

- [ ] **Шаг 2: Пробовать cached auth сразу**

После создания `cachedSessionPromise` и `currentSessionPromise` вызвать:

```ts
void openCachedSession({
  cachedSessionPromise,
  isCurrentAttempt,
  mode: 'authenticated_only',
})
```

Не ждать старый fallback timer, чтобы открыть valid cached auth.

- [ ] **Шаг 3: Сохранить session-check fallback для no usable cache**

Оставить `session_check_required` только для network failure или
`BOOT_ONLINE_REQUIRED_MS` deadline, но использовать:

```ts
mode: 'allow_session_check_required'
```

for network failure and online-required deadline.

Это не даст заблокировать first-login-with-cookie или expired-cache-with-online-success
до того, как `/api/auth/me` успеет успешно ответить.

- [ ] **Шаг 4: Сохранить online authority**

Если online `/api/auth/me` успешно отвечает после открытия cached auth:

```text
saveOnlineAuthSnapshot()
setSessionSource('online')
setAuthStatus('authenticated')
```

Если online возвращает no session/401, сохранить текущий rejected-scope cleanup.

- [ ] **Шаг 5: Запустить auth tests**

Выполнить:

```bash
pnpm --dir frontend test -- src/features/auth/lib/AuthSessionProvider.offline.test.tsx
```

Ожидаемо: valid cached auth открывается сразу; expired auth/local signout/clock
rollback still block cached protected shell when online cannot validate.

## Задача 5: Сделать Chat Initial Load И Thread Selection Cache-first

**Файлы:**

- Изменить: `frontend/src/features/chat/pages/chatPageState.ts`
- Изменить: `frontend/src/features/chat/pages/useChatThreadSelection.ts`
- Изменить: `frontend/src/features/chat/pages/ChatPage.tsx`
- Изменить: `frontend/src/features/chat/pages/offlineChatCache.ts`
- Изменить: `frontend/src/features/chat/pages/ChatPage.offline-cache.test.tsx`
- Изменить: `frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx`

- [ ] **Шаг 1: Ввести chat reachability type**

Добавить local type рядом с chat page state или в маленький helper file:

```ts
export type ChatReachability = 'connecting' | 'offline' | 'online'
```

Оставить `isUsingCachedData` как data freshness; не использовать его как network
availability.

- [ ] **Шаг 2: Передать reachability setters в thread selection**

Extend `useChatThreadSelection()` input:

```ts
setChatReachability: Dispatch<SetStateAction<ChatReachability>>
```

Use it in network success/failure paths:

```text
online success -> online
statusCode 0 / timeout / offline event -> offline
cached open while navigator may be online -> connecting
```

- [ ] **Шаг 3: Открывать cached initial chat до online requests**

In `loadInitialChat()`:

1. Increment `requestId`.
2. Clear errors.
3. Start `readOfflineChatFallback()` immediately.
4. Если fallback есть, выставить `pageState.status = 'ready'`,
   `isUsingCachedData = true`, `chatReachability = connecting/offline` based on
   browser hint.
5. Start online `getChatThreads()` + `getChatMessages()` in background.
6. Если online успешен, заменить на `ONLINE_CHAT_PAGE_CACHE_STATE` и
   `chatReachability = online`.
7. Если online падает, а cache уже открыт, оставить cached state и выставить
   `chatReachability = offline`.
8. Если online падает и cache не открыт, выставить controlled `status = 'error'`.

Удалить `BOOT_CACHE_FALLBACK_MS` timer из cached boot path.

- [ ] **Шаг 4: Оставить loading state только для no-cache boot**

Не выставлять `status: 'loading'` после открытия valid cached snapshot.

Допустимо:

```text
no cache yet -> loading
cache exists -> ready cached
```

- [ ] **Шаг 5: Сделать thread selection cache-first**

In `handleSelectThread(threadId)`:

1. Try `readOfflineChatFallback({ preferredThreadId: threadId })`.
2. Если matching cached snapshot есть, рендерить его сразу.
3. Start online `getChatMessages({ threadId })` in background.
4. On success, replace with fresh snapshot.
5. On network failure with cache opened, keep cached snapshot.
6. On network failure without cache, show controlled inline error.

- [ ] **Шаг 6: Запустить chat cache/thread tests**

Выполнить:

```bash
pnpm --dir frontend test -- src/features/chat/pages/ChatPage.offline-cache.test.tsx src/features/chat/pages/ChatPage.thread-selection.test.tsx
```

Ожидаемо: VPN hanging startup открывает saved chat сразу; selected cached thread
opens immediately.

## Задача 6: Перевести Header И Runtime Alerts На Reachability

**Файлы:**

- Изменить: `frontend/src/features/chat/components/ChatHeader.tsx`
- Изменить: `frontend/src/features/chat/components/ChatHeaderPresence.tsx`
- Изменить: `frontend/src/features/chat/components/ChatRuntimeAlerts.tsx`
- Изменить: `frontend/src/features/chat/pages/ChatPage.tsx`
- Изменить: `frontend/src/features/chat/components/ChatHeader.test.tsx`
- Изменить: `frontend/src/features/chat/components/ChatRuntimeAlerts.test.tsx`

- [ ] **Шаг 1: Заменить header boolean на connection status**

Изменить `ChatHeaderProps`:

```ts
connectionStatus: 'connecting' | 'offline' | 'online'
```

Использовать mapping:

```text
connecting -> label "Соединение...", tone "checking"
offline    -> label "Нет связи", tone "offline"
online     -> getSupportAvailabilityPresentation(...)
```

- [ ] **Шаг 2: Сохранить accessibility в ChatHeaderPresence**

Не добавлять новый visible instruction text. Убедиться, что `role="status"` сохраняет точный
label:

```text
Соединение...
Нет связи
На связи
```

- [ ] **Шаг 3: Отрефакторить ChatRuntimeAlerts**

Изменить props:

```ts
connectionStatus: 'connecting' | 'offline' | 'online'
```

Поведение:

- `connecting`: no offline saved-chat banner;
- `offline + queuedSendCount > 0`: queue warning;
- `offline + isChatAvailable`: saved chat warning;
- `online + resyncing/error`: current behavior.

- [ ] **Шаг 4: Обновить derived booleans в ChatPage**

Использовать:

```ts
const canUseBackend = chatReachability === 'online'
const canAttemptBackgroundResync =
  chatReachability === 'online' || navigatorHintIsOnline
```

Pass `canUseBackend` to APIs that require backend availability. Preserve offline
text queue behavior by passing backend availability to `useOptimisticTextSend`
as the old `isBrowserOnline` semantic.

- [ ] **Шаг 5: Запустить header/runtime tests**

Выполнить:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatHeader.test.tsx src/features/chat/components/ChatRuntimeAlerts.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx
```

Ожидаемо: connection copy находится в header; большого offline banner нет во время initial
`connecting` cached boot.

## Задача 7: Добавить Offline Cached Older Message Pages

**Файлы:**

- Изменить: `frontend/src/features/offline/types.ts`
- Изменить: `frontend/src/features/offline/offlineDatabase.ts`
- Изменить: `frontend/src/features/offline/offlineStore.ts`
- Изменить: `frontend/src/features/offline/offlineStore.test.ts`
- Изменить: `frontend/src/features/chat/pages/offlineChatCache.ts`
- Изменить: `frontend/src/features/chat/pages/offlineChatCache.test.ts`
- Изменить: `frontend/src/features/chat/pages/useOfflineChatCachePersistence.ts`
- Изменить: `frontend/src/features/chat/pages/useChatOlderMessages.ts`
- Изменить: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Изменить: `frontend/public/sw.js`
- Изменить: `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts`
- Изменить: `tests/e2e/offline-first-pwa.spec.ts`

- [ ] **Шаг 1: Добавить IndexedDB store и type**

Увеличить:

```ts
export const OFFLINE_DATABASE_VERSION = 2
```

Добавить store:

```ts
'chat_message_pages'
```

Добавить type:

```ts
export type OfflineChatMessagePageRecord = {
  pageCursor: 'latest' | `before:${number}`
  savedAt: string
  snapshot: ChatMessagesSnapshot
  tenantSlug: string
  threadId: string
  userId: number
}
```

- [ ] **Шаг 2: Добавить offlineStore methods**

Добавить helpers:

```ts
saveMessagePage(record: OfflineChatMessagePageRecord)
readMessagePage(tenantSlug: string, userId: number, threadId: string, pageCursor: string)
```

Ключ:

```ts
`${tenantSlug}:${userId}:${threadId}:${pageCursor}`
```

Обновить `clearCurrentUserOfflineData()` и `pruneOfflineData()`, чтобы включить
`chat_message_pages`.

- [ ] **Шаг 3: Сохранять latest и older pages**

In `offlineChatCache.ts`, add:

```ts
saveOfflineLatestMessagePage(...)
saveOfflineOlderMessagePage(...)
readOfflineOlderMessagePage(...)
```

При сохранении online latest snapshot сохранять оба:

```text
chat_message_snapshots -> fast boot bounded snapshot
chat_message_pages/latest -> latest page
```

При online загрузке older messages сохранять:

```text
chat_message_pages/before:<cursor>
```

- [ ] **Шаг 4: Загружать cached older page offline**

In `useChatOlderMessages.ts`:

```text
if backend unavailable and nextOlderCursor exists:
  read cached page before:<nextOlderCursor>
  if found: mergeOlderMessages(...)
  if missing: setHistoryErrorMessage('Более ранние сообщения не сохранены на этом устройстве.')
```

Не вызывать `getChatMessages()`, когда `chatReachability === 'offline'`.

- [ ] **Шаг 5: Синхронизировать database constants в service worker**

Обновить `frontend/public/sw.js`:

```js
const PORTAL_OFFLINE_DATABASE_VERSION = 2
const PORTAL_OFFLINE_STORES = [
  ...
  'chat_message_pages',
]
```

The background sync path can keep updating `chat_message_snapshots`; it only
needs the worker DB open helper to know the new store exists.

- [ ] **Шаг 6: Добавить older page tests**

In `offlineChatCache.test.ts`, cover:

```text
save latest page
save older page by before cursor
read older page returns only same tenant/user/thread/cursor
invalid snapshot is ignored
```

In `ChatPage.test.tsx`, cover:

```text
online load older saves page
offline load older uses cached page
offline missing cached page shows compact error
```

- [ ] **Шаг 7: Запустить offline storage и chat history tests**

Выполнить:

```bash
pnpm --dir frontend test -- src/features/offline/offlineStore.test.ts src/features/chat/pages/offlineChatCache.test.ts src/features/chat/pages/ChatPage.test.tsx src/pwa/serviceWorkerBackgroundSync.test.ts
```

Ожидаемо: DB version 2, cleanup/prune, older cached pages и SW background sync
tests pass.

## Задача 8: Добавить Playwright Runtime Coverage

**Файлы:**

- Изменить: `tests/e2e/offline-first-pwa.spec.ts`

- [ ] **Шаг 1: Обновить существующий slow startup test**

Переименовать существующий test:

```text
opens saved chat during slow startup and queues offline text
```

на:

```text
opens saved chat instantly during slow or hanging startup and queues offline text
```

Удалить expectations для:

```text
Связь отвечает медленно. Проверяем сохраненные данные.
Открываем кабинет
```

Assert saved chat appears directly.

- [ ] **Шаг 2: Добавить явный VPN blackhole case**

Use existing `apiRoutes.hang()` helpers:

```ts
apiRoutes.hang('/api/tenant')
apiRoutes.hang('/api/auth/me')
apiRoutes.hang('/api/chat/threads')
await page.reload()
```

Не переводить browser context в offline. Ожидаемо:

```ts
await expect(page.getByText('Личный чат')).toBeVisible()
await expect(page.getByText('Cached online message')).toBeVisible()
await expect(page.getByText('Открываем кабинет')).toHaveCount(0)
await expect(page.getByRole('status', { name: 'Соединение...' })).toBeVisible()
```

После request timeout ожидать `Нет связи`.

- [ ] **Шаг 3: Добавить cached older-page e2e**

Extend mock API so first online session can return latest page with
`nextOlderCursor` and then an older page for `beforeMessageId`.

Сценарий:

```text
login online
load older messages online
set API offline / context offline
reload
load older messages again from cache
assert older message visible
```

- [ ] **Шаг 4: Запустить focused e2e**

Выполнить:

```bash
pnpm test:e2e -- tests/e2e/offline-first-pwa.spec.ts
```

Ожидаемо: offline-first PWA spec проходит.

Если local services unavailable, зафиксировать точный blocker и запустить frontend unit
coverage instead; do not claim e2e passed.

## Задача 9: Полная Frontend Verification

**Файлы:**

- All modified frontend files.

- [ ] **Шаг 1: Запустить frontend typecheck**

Выполнить:

```bash
pnpm --dir frontend typecheck
```

Ожидаемо: нет TypeScript errors.

- [ ] **Шаг 2: Запустить frontend unit tests**

Выполнить:

```bash
pnpm --dir frontend test
```

Ожидаемо: все frontend tests проходят.

- [ ] **Шаг 3: Запустить frontend build**

Выполнить:

```bash
pnpm --dir frontend build
```

Ожидаемо: Vite build проходит и service worker stamped.

- [ ] **Шаг 4: Запустить lint после стабилизации targeted changes**

Выполнить:

```bash
pnpm --dir frontend lint
```

Ожидаемо: нет lint errors.

## Задача 10: Ревью Кода И Cleanup

**Файлы:**

- Review modified files from `git diff --name-only`
- Optional update after closure: `docs/roadmap/work-log.md`

- [ ] **Шаг 1: Провести review измененных startup/auth/chat paths**

Выполнить:

```bash
git diff -- frontend/src/features/tenant/lib/TenantProvider.tsx frontend/src/features/auth/lib/AuthSessionProvider.tsx frontend/src/features/chat/pages/ChatPage.tsx frontend/src/features/chat/pages/useChatThreadSelection.ts frontend/src/features/chat/pages/useChatOlderMessages.ts frontend/src/features/chat/pages/offlineChatCache.ts
```

Проверить:

```text
no online request can block cached first paint
no network failure clears cache
authoritative rejection still clears scope
requestId guards prevent stale async overwrite
unmounted component paths are guarded
```

- [ ] **Шаг 2: Провести review IndexedDB version/store sync**

Выполнить:

```bash
git diff -- frontend/src/features/offline/types.ts frontend/src/features/offline/offlineDatabase.ts frontend/src/features/offline/offlineStore.ts frontend/public/sw.js
```

Проверить:

```text
same DB version in app and service worker
same store list in app and service worker
clear/prune includes chat_message_pages
guards reject wrong tenant/user/thread/pageCursor records
```

- [ ] **Шаг 3: Провести no-legacy runtime gate**

Поиск:

```bash
rg "StartupSurface|useStartupSurfaceReport|AppStartupScreen|ChatLoadingState|RouteChunkStartupFallback|portal-pre-root-startup|BOOT_CACHE_FALLBACK_MS|BOOT_SLOW_NOTICE_MS|slow_connection|offline_cached" frontend/src frontend/index.html
```

Ожидаемо:

```text
No matches in production frontend runtime.
```

Если `ready_cached` или `session_check_required` остаются, это допустимо: это
реальные state names для cached tenant/auth и controlled session-check, а не
старый startup surface.

- [ ] **Шаг 4: Провести review UI copy**

Поиск:

```bash
rg "Открываем кабинет|Добро пожаловать|Готовим чат|Загружаем экран" frontend/src frontend/index.html
```

Ожидаемо:

```text
No matches in production frontend runtime.
If a string remains only in docs or deleted-test history, it is outside runtime scope.
```

- [ ] **Шаг 5: Решить, нужен ли work-log update**

Если implementation complete и accepted as baseline, обновить
`docs/roadmap/work-log.md` with one short completed baseline item and replace
финальный блок `Recommended Next Step`.

Не добавлять test counts, command logs или transient finding details в work-log.

- [ ] **Шаг 6: Проверить финальный status**

Выполнить:

```bash
git status --short --branch
git diff --check
```

Ожидаемо:

```text
No whitespace errors.
Only scoped files changed.
```

## Критерии Закрытия

- Spec exists and has self-review:
  `docs/superpowers/specs/2026-05-30-instant-cached-chat-boot-design.md`
- This plan exists:
  `docs/superpowers/plans/2026-05-30-instant-cached-chat-boot-implementation.md`
- Старый startup runtime удален: нет production imports/usages
  `StartupSurfaceProvider`, `StartupSurfaceOverlay`, `useStartupSurfaceReport`,
  `RouteChunkStartupFallback`, `ChatLoadingState`, `AppStartupScreen` и
  `portal-pre-root-startup`.
- В `frontend/src` и `frontend/index.html` нет startup copy `Открываем кабинет`,
  `Добро пожаловать`, `Готовим чат`, `Загружаем экран`.
- Returning cached user opens chat without visible startup screens.
- VPN blackhole opens cached chat and later degrades to `Нет связи`.
- Network refresh after cached boot updates to fresh online state.
- Offline text outbox still works.
- Offline older pages work for pages previously loaded on device.
- First/no-cache/session-required/storage-loss states remain controlled.
- Targeted tests, frontend test suite, typecheck/build and focused Playwright
  are run or blockers are explicitly recorded.
- Code review findings are fixed before commit unless user explicitly defers.
