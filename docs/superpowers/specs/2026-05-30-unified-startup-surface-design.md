# Единая Startup Surface

## Статус

- `status`: draft for review
- `date`: `2026-05-30`
- `branch`: `docs/startup-surface-spec`
- `scope`: frontend UX follow-up slice для PWA startup continuity

## Проблема

Сейчас во frontend есть несколько независимых владельцев startup/loading
состояний:

- `TenantProvider` закрывает загрузку tenant context.
- `PublicAuthRoute` и `ProtectedRoute` закрывают проверку auth session.
- `LazyRoute` закрывает загрузку route chunk.
- `ChatLoadingState` закрывает startup chat runtime.

Каждый владелец использует похожий `AppStartupScreen` и свой delayed
`StartupScreenGate`. В итоге пользователь может ощущать не один запуск
приложения, а несколько запусков подряд: native PWA splash, короткий пустой
кадр, `Открываем кабинет`, еще один `Открываем кабинет`, затем loading чата.

Проблема не в том, что какой-то один loading state неправильный. Проблема в
том, что startup experience не скоординирован между фазами boot.

## UX-цель

Startup должен ощущаться как один непрерывный переход от browser/native PWA
launch к правильному финальному экрану.

Пользователь должен видеть:

1. Native browser/PWA splash или initial document paint.
2. Максимум одну portal-owned full-screen startup surface.
3. Финальный auth screen, protected app screen или явное recovery/error state.

Full-screen surface может менять небольшой status label по мере прохождения
этапов, но не должна визуально перезапускаться, исчезать в пустой экран или
возвращаться как еще один такой же splash.

## Выбранное направление

Выбран вариант `B. Единая startup surface`.

Это значит, что один persistent startup surface владеет app-level boot
experience. Provider, route и chat phases сообщают прогресс в эту surface,
вместо того чтобы каждый слой рендерил собственный full-screen startup gate.

Финальный UI все еще может использовать локальные skeletons или inline loading
states после того, как protected shell уже видим. Но эти состояния не должны
переиспользовать full-screen `Открываем кабинет` как независимые splash
экраны.

## UX Contract

### First Paint

- Document background должен быть согласован с PWA manifest background, чтобы
  избежать white flash после native splash.
- На очень быстрых стартах portal-owned full-screen startup surface можно не
  показывать.
- Если startup длится дольше anti-flicker delay, показываем одну стабильную
  startup surface.

### Startup Surface

- Одна full-screen startup surface остается смонтированной при handoff между
  tenant, session, route и initial protected app loading.
- Brand mark начинается с fallback portal identity и обновляется на месте,
  когда tenant identity становится доступна.
- Headline по умолчанию остается стабильным: `Открываем кабинет`.
- Status label меняется по фазам:
  - tenant: `Загружаем настройки`
  - slow tenant/network: `Проверяем сохраненные данные`
  - session: `Проверяем сессию`
  - route chunk: `Загружаем экран`
  - chat startup: `Готовим чат`
- Description может меняться, но должен оставаться коротким и не вызывать
  заметный layout shift.
- У surface есть один minimum visible duration после появления, а не отдельный
  minimum duration на каждый вложенный gate.

### Release Rules

- Full-screen startup surface отпускается только когда следующий экран готов
  отрендериться цельно.
- Для `/auth/*` release идет в auth layout после того, как tenant и public
  session routing разрешены.
- Для `/app/*` release идет в protected shell после того, как tenant, session и
  route component готовы.
- Для `/app/chat` возможны два допустимых поведения:
  - держать unified startup surface до первого решения по chat read model;
  - или release в стабильный chat shell с inline transcript skeleton.
- Нельзя release-иться в blank root или пустой protected shell.

### Error И Recovery States

- Tenant `online_required`, tenant authoritative failure, session check
  required и protected session error остаются явными product states, а не
  startup spinners.
- Если открываются cached offline data, startup surface может показать
  `Открываем сохраненные данные` перед release в cached app.
- Recoverable errors нельзя прятать за бесконечным loading screen.

## Архитектурный Дизайн

### Новый Startup Coordinator

Добавляем небольшой frontend startup coordinator со стабильным владельцем рядом
с корнем приложения.

Предлагаемая форма:

```text
App
  BrowserRouter
    StartupSurfaceProvider
      TenantProvider
        AuthSessionProvider
          PwaUpdateBanner
          AppRoutes
      StartupSurfaceOverlay
```

Имена компонентов можно уточнить на implementation этапе, но важна сама
граница:

- `StartupSurfaceProvider` владеет startup visibility, delay, minimum visible
  duration и handoff grace.
- `StartupSurfaceOverlay` рендерит единственный full-screen
  `AppStartupScreen`.
- Существующие providers и routes сообщают phase state координатору.
- Feature components не должны создавать собственные full-screen startup gates.

### Phase Reporting

Используем небольшой typed API вместо scattered booleans:

```ts
type StartupPhase =
  | 'tenant'
  | 'tenant_slow'
  | 'session'
  | 'route'
  | 'chat'
  | 'offline_cached'
```

Каждый reporter передает:

- `phase`
- `active`
- `title`
- `description`
- `statusLabel`
- optional `tenantDisplayName`
- optional `userName`
- optional `showChatPreview`

Coordinator выбирает видимую фазу по priority. Initial boot phases важнее
route-level phases, а явные recovery/error screens убирают startup surface.

Предлагаемый priority:

```text
tenant_slow > tenant > session > route > chat > offline_cached
```

Priority можно уточнить при implementation, если тесты покажут более понятную
последовательность. Но порядок должен быть deterministic.

### Handoff Grace

Сейчас есть реальный React mount gap: `TenantProvider` перестает рендерить свой
startup gate, затем монтируется `AuthSessionProvider` и начинает проверку
сессии. Unified surface нужен короткий handoff grace, чтобы она не исчезала на
один frame или один timer tick между фазами.

Поведение coordinator:

- если phase становится inactive, visible surface остается на короткое handoff
  window;
- если другая phase становится active в это окно, status label обновляется на
  месте;
- если новая phase не появилась и minimum visible time уже прошел, surface
  отпускается к children.

Handoff grace должен быть достаточно коротким, чтобы не задерживать быстрые
ready screens заметно для пользователя.

### Component Changes

`StartupScreenGate` перестает быть default primitive для nested fullscreen
startup. После миграции нужно выполнить `rg
"StartupScreenGate|DeferredStartupScreen" frontend/src`. Если production usage
не осталось, старый `StartupScreenGate` и его тест удаляются в рамках этого же
slice. В кодовой базе не должно остаться двух параллельных fullscreen startup
реализаций.

Ожидаемые affected areas:

- `frontend/src/features/tenant/components/AppStartupScreen.tsx`
- `frontend/src/features/tenant/components/StartupScreenGate.tsx`
- `frontend/src/features/tenant/lib/TenantProvider.tsx`
- `frontend/src/features/auth/lib/AuthSessionProvider.tsx`
- `frontend/src/app/layouts/PublicAuthRoute.tsx`
- `frontend/src/app/layouts/ProtectedRoute.tsx`
- `frontend/src/app/AppRoutes.tsx`
- `frontend/src/features/chat/components/ChatLoadingState.tsx`
- `frontend/src/features/chat/pages/ChatPage.tsx`

`ChatLoadingState` не должен принудительно передавать
`title="Открываем кабинет"`, если он хочет использовать personalized welcome
copy. Если unified surface сохраняет chat startup как full-screen phase, chat
phase может передавать `userName` и позволить `AppStartupScreen` самому
разрешить title. Если финальный дизайн release-ится в chat shell skeleton,
`ChatLoadingState` может стать inline skeleton.

## Non-Goals

- Не редизайним auth forms.
- Не меняем backend auth, session, tenant или chat contracts.
- Не меняем service worker caching rules.
- Не добавляем tenant branding settings или asset storage; это остается в
  `MT-9`.
- Не добавляем marketing copy или landing-page style startup screen.
- Не ослабляем protected route guards и не показываем protected content до
  session authority.

## Accessibility

- Startup surface остается `aria-busy="true"` и `aria-live="polite"`.
- Status label changes должны быть polite и concise.
- Избегаем частой смены текста, из-за которой screen readers будут повторять
  одно и то же состояние.
- Явные error/recovery states должны использовать существующие alert/button
  semantics, а не оставаться внутри loading surface.

## Testing Plan

### Unit / Component Tests

- Coordinator не показывает surface до anti-flicker delay на fast startup.
- Coordinator держит одну visible surface на tenant-to-session handoff.
- Coordinator обновляет status label без unmount surface.
- Coordinator release-ится только после minimum visible duration.
- Recovery states bypass/dismiss startup surface.
- `ChatLoadingState` больше не игнорирует `userName` через forced title или
  заменен на inline chat skeleton.

### Route Tests

- `/auth/login` со slow public session check показывает одну startup surface,
  затем auth form.
- `/app/chat` со slow tenant, slow session и lazy route показывает одну startup
  surface, а не повторяющиеся headings с blank frames между ними.
- Authenticated public route redirects to app без второго full-screen startup
  после release первой surface.
- Unauthenticated protected route redirects to login без раскрытия protected
  shell.

### Browser / PWA Validation

- Production-like startup smoke подтверждает отсутствие blank white frame между
  native splash и portal surface на slow startup.
- Installed PWA offline/cached startup по-прежнему открывает сохраненные
  tenant/auth/chat data.
- Slow network startup показывает cached-data message на ожидаемом deadline.
- Mobile viewport остается стабильным; нет регресса к iOS empty-screen
  behavior.

## Acceptance Criteria

- Во время app boot может быть видима только одна portal-owned full-screen
  startup surface.
- Startup phase changes обновляют content in place, вместо remount нового
  идентичного splash.
- Fast startups могут пропускать portal-owned surface.
- Slow startups не показывают blank frame перед surface.
- `/auth/*` и `/app/chat` startup flows покрыты targeted frontend tests.
- Existing PWA offline-first behavior остается intact.
- Frontend typecheck, targeted tests, build, lint/code-health и
  `git diff --check` проходят или записан конкретный blocker.

## Recommended Implementation Scope

Реализовать как один focused frontend UX slice:

```text
feature/phase-pwa-unified-startup-surface
```

Этот slice меняет только startup orchestration. Он не должен включать MT-9
branding/admin work, route redesigns или unrelated chat UI polish.
