# Frontend Performance And Bundle Work Log - 2026-06-22

Этот файл фиксирует работу, выполненную в рамках frontend performance,
bundle-size and build hygiene цикла. Цель цикла: понять, является ли видимая
загрузка множества файлов нормальным поведением Vite dev server или реальной
production bundle/runtime проблемой, а затем сделать только узкие безопасные
оптимизации.

## Scope And Boundaries

- Backend не изменялся.
- Chat runtime internals не оптимизировались.
- Realtime, offline cache, outbox, read receipts, voice recorder, service
  worker runtime and message merge logic не менялись.
- Dead code не удалялся.
- UI behavior целенаправленно не менялся.
- Все runtime changes были узкими frontend code-splitting changes.

## Audit Verdict

- Много отдельных файлов в браузере в dev mode является нормальным поведением
  Vite dev server: dev server отдает ES modules по отдельности.
- Production bundle до оптимизаций уже был существенно компактнее dev-loaded
  graph.
- Реальная production-проблема была не в количестве dev files, а в том, что
  `ChatPage` статически импортировался из route entry и попадал в initial
  bundle для login/admin/legal-first сценариев.
- Отдельно была найдена build hygiene проблема: production build мог
  наследовать `NODE_ENV=development` из shell и тихо давать более тяжелый
  bundle.

## Commits Created

### `89189e6 frontend: lazy-load chat route`

Что сделано:

- `ChatPage` переведен на lazy route import в `frontend/src/app/AppRoutes.tsx`.
- Добавлен route-level test `frontend/src/app/AppRoutes.chat.test.tsx`.
- `frontend/scripts/stamp-service-worker.mjs` обновлен так, чтобы service
  worker asset stamping ожидал lazy chat route asset.

Проверенный эффект:

- `ChatPage` перестал быть статическим import основного route entry.
- `/app/chat` продолжил рендериться корректно.
- Protected redirect behavior сохранился.

### `749c269 frontend: force production env for build`

Что сделано:

- `frontend/package.json` build script теперь явно запускает `tsc`,
  `vite build` and post-build scripts с `NODE_ENV=production`.

Зачем:

- До фикса build с унаследованным `NODE_ENV=development` мог давать гораздо
  более тяжелый production output.
- Зафиксирован безопасный behavior для `pnpm --dir frontend build`.

Проверенный эффект:

- Clean production build: около `415 KB / 117.5 KB gzip` по JS.
- Build with inherited `NODE_ENV=development` больше не дает
  development-influenced bundle, потому что script переопределяет env.

### `eaf7038 frontend: guard production bundle regressions`

Что сделано:

- Добавлен `frontend/scripts/check-production-build.mjs`.
- Build script теперь запускает production bundle guard после service worker
  stamping.

Guard проверяет:

- `ChatPage` является Vite dynamic entry.
- Startup entry lazy-loads `ChatPage`.
- Startup entry не статически импортирует `ChatPage`.
- Startup entry укладывается в budgets:
  - raw: `300 * 1024`;
  - gzip: `90 * 1024`.
- Built JS не содержит development React markers:
  - `jsxDEV`;
  - `react.development`;
  - `useEffect must not return anything besides`;
  - `You are using the in-browser Babel transformer`.
- `dist` не пустой.

### `7ecdae7 frontend: lazy-load chat auxiliary panels`

Что сделано:

- В `frontend/src/features/chat/pages/ChatAuxiliaryPages.tsx` статические
  imports заменены на `React.lazy` for:
  - `ChatInfoPage`;
  - `ChatMediaPage`;
  - `ChatNotificationsPage`;
  - `ChatSearchPage`.
- Conditional panel rendering сохранен.
- `Suspense fallback={null}` использован для сохранения существующего loading
  UX.

Проверенный bundle impact:

- `ChatPage`: `119,664 B / 31,165 gzip` -> `104,193 B / 27,696 gzip`.
- Выигрыш для chat route chunk: `15,471 B raw` and `3,469 B gzip`.
- Новые lazy chunks:
  - `ChatInfoPage`: `6,051 B / 2,139 gzip`;
  - `ChatMediaPage`: `5,796 B / 2,114 gzip`;
  - `ChatNotificationsPage`: `2,966 B / 1,354 gzip`;
  - `ChatSearchPage`: `7,293 B / 2,644 gzip`.

### `c68d2bc frontend: guard chat auxiliary panel chunks`

Что сделано:

- `frontend/scripts/check-production-build.mjs` дополнен guard'ом для
  auxiliary chat panels.

Guard проверяет:

- `ChatPage` lazy-loads:
  - `ChatInfoPage`;
  - `ChatMediaPage`;
  - `ChatNotificationsPage`;
  - `ChatSearchPage`.
- `ChatPage` не возвращает эти panels в static imports.

## Verification Commands Used

Targeted tests:

```bash
pnpm --dir frontend exec vitest run \
  src/app/AppRoutes.chat.test.tsx \
  src/features/chat/pages/ChatPage.test.tsx \
  src/features/chat/pages/ChatPage.search.test.tsx \
  src/features/chat/pages/ChatPage.media.test.tsx \
  src/features/chat/components/ChatInfoPage.test.tsx \
  src/features/chat/components/ChatMediaPage.test.tsx \
  src/features/chat/components/ChatNotificationsPage.test.tsx \
  src/features/chat/components/ChatSearchPage.test.tsx \
  --reporter=verbose \
  --testTimeout=20000 \
  --fileParallelism=false
```

Result:

- `8` test files passed.
- `49` tests passed.

Lint/syntax/build checks:

```bash
pnpm --dir frontend exec eslint src/features/chat/pages/ChatAuxiliaryPages.tsx
node --check frontend/scripts/check-production-build.mjs
NODE_ENV=production node frontend/scripts/check-production-build.mjs
pnpm --dir frontend build
NODE_ENV=development pnpm --dir frontend build
```

Observed notes:

- Parallel Vitest runs showed timing-sensitive failures in existing chat tests.
- The same targeted set passed in sequential file mode with
  `--fileParallelism=false`.
- No runtime code was changed to work around the parallel timing issue.

## Current Production Bundle Shape

After the committed changes, notable production JS chunks:

- Startup entry: `assets/index-5-578jqB.js`
  - `248,261 B / 75,288 gzip`.
- `ChatPage`: `assets/ChatPage-CFowLwD6.js`
  - `104,193 B / 27,696 gzip`.
- `lamejs` voice recorder encoder chunk:
  - `163,279 B / 56,334 gzip`;
  - remains dynamic.
- `routePaths` named chunk:
  - `41,938 B / 14,724 gzip`;
  - mostly React Router/runtime, not just local `routePaths`.
- `ChatHeaderIdentity` shared header chunk:
  - `27,046 B / 8,271 gzip`.
- `icons` chunk:
  - `11,689 B / 2,092 gzip`.

## What Occupies The Startup Index

A temporary sourcemap build was used only for analysis. It was removed after
the spike.

Inside `index-*.js`, the largest contributor is React DOM:

- `react-dom-client.production.js`: about `174.5 KB` generated chars.
- `react-dom.production.js`: about `3.3 KB` generated chars.
- `scheduler.production.js`: about `3.5 KB` generated chars.
- Combined React DOM/scheduler cost: about `181 KB` out of about `247 KB`
  generated `index` JS.

Largest project sources inside `index`:

- `frontend/src/features/branding/lib/brandingCss.ts`: about `6.5 KB`.
- `frontend/src/app/AppRoutes.tsx`: about `4.6 KB`.
- `frontend/src/pwa/serviceWorkerRuntime.ts`: about `4.2 KB`.
- `frontend/src/features/auth/lib/AuthSessionProvider.tsx`: about `3.9 KB`.
- `frontend/src/features/tenant/lib/TenantProvider.tsx`: about `3.5 KB`.
- `frontend/src/features/offline/startupCache.ts`: about `3.4 KB`.
- `frontend/src/features/offline/offlineStore.ts`: about `3.2 KB`.
- `frontend/src/pwa/PwaUpdateBanner.tsx`: about `1.3 KB`.

Interpretation:

- Startup `index` is mostly the fixed cost of React DOM plus app boot layer.
- There is no obvious single project file in `index` that can be removed for a
  large easy win.

## Read-Only Spikes And Rejected Follow-Ups

### Top-level lazy `AppRoutes`

Temporary experiment only.

Result:

- `index`: `248.3 KB / 75.3 gzip` -> `250.7 KB / 79.2 gzip`.
- New `AppRoutes` chunk: about `20.0 KB / 5.6 gzip`.
- Existing build guard failed because `ChatPage` was no longer a direct lazy
  dependency of startup entry.

Decision:

- Do not implement. It worsened startup gzip and would require guard/service
  worker architecture changes.

### Admin route split

Read-only analysis only.

Finding:

- `/admin` still uses `TenantAuthShell`.
- `TenantAuthShell` consumes tenant and branding contexts.

Decision:

- Do not split admin out of tenant/branding boot without a product-level
  decision and broader tests.

### Lazy chat header dropdown menus

Temporary experiment only.

Result:

- `ChatPage`: `104.2 KB / 27.7 gzip` -> `100.0 KB / 26.7 gzip`.
- New chunks:
  - `ChatHeaderActionsMenu`: about `2.7 KB / 1.2 gzip`;
  - `ChatHeaderNavigationMenu`: about `2.1 KB / 1.0 gzip`.

Risk:

- Lazy dropdown bodies can affect focus behavior after menu open.
- Would need explicit focus repair and menu accessibility tests.

Decision:

- Possible, but not recommended as the next automatic low-risk step because
  the win is small and focus behavior is user-visible.

## Recommended Next Step

The remaining high-value work is likely runtime performance, not more bundle
micro-splitting.

Recommended next investigation:

- Profile chat page renders and effects.
- Check for unnecessary re-renders around `ChatPage`, `ChatTranscript`,
  composer, typing indicator and auxiliary panel state.
- Inspect SSE update frequency and snapshot/message merge cost.
- Review repeated fetch triggers and state object churn.
- Add targeted render-count or integration tests before changing chat runtime.

Bundle-only follow-up, if still desired:

- Implement lazy `ChatHeaderActionsMenu` and `ChatHeaderNavigationMenu` only
  with explicit focus restoration tests and route/chat menu tests.

## Current Local Branch State At Documentation Time

- Branch: `main`.
- Remote: `origin`.
- Local branch was ahead of `origin/main` by 5 commits before this documentation
  commit.
- Last remote baseline before this cycle: `c4b2e99 docs: add new laptop
  continuation guide`.
