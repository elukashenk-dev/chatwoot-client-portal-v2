# Task 05: Admin Layout And Playwright Coverage

## Цель

Встроить real preview в правую часть admin branding page так, чтобы phone-frame
был читаемым, не ломал editor layout и был покрыт browser tests.

## Scope

Prerequisites:

- Tasks 01-04 completed.

Modify:

- `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
- `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`
- `tests/e2e/admin-branding-settings.spec.ts`
- `tests/e2e/admin-branding-assets.spec.ts`

Create:

- `tests/e2e/admin-branding-real-preview.spec.ts`

## Implementation Steps

- [x] В `AdminBrandingPage.tsx` заменить grid:

```tsx
<section className="hidden min-h-full grid-cols-[15rem_minmax(0,1fr)_22rem] lg:grid">
```

на:

```tsx
<section className="hidden min-h-full grid-cols-[15rem_minmax(0,1fr)_minmax(25rem,28rem)] 2xl:grid-cols-[15rem_minmax(36rem,1fr)_30rem] lg:grid">
```

- [x] Сделать preview aside scrollable:

```tsx
<aside className="max-h-screen overflow-y-auto border-l border-slate-200 bg-white px-3 py-6 xl:px-5">
```

- [x] Обновить `AdminBrandingPage.test.tsx`:
  - старую проверку heading/card заменить на `Копия портала`;
  - проверить tab `Вход` selected;
  - проверить login heading from saved branding;
  - проверить, что edit portal name обновляет login preview.
- [x] Обновить `tests/e2e/admin-branding-settings.spec.ts`:
  - add deterministic mock for exact public `GET /api/branding`, because
    admin routes are wrapped by the app-level `BrandingProvider`;
  - убрать assertion старой кнопки `Продолжить`;
  - проверять real disabled login button `Войти`;
  - оставить immediate draft checks for portal name, support label, auth title,
    auth subtitle;
  - перейти на tab `Чат` и проверить `Личный чат`;
  - перейти на tab `Инфо` и проверить updated support label.
- [x] Обновить `tests/e2e/admin-branding-assets.spec.ts`:
  - add the same deterministic mock for exact public `GET /api/branding`;
  - keep existing admin asset route mocks unchanged.
- [x] Создать `admin-branding-real-preview.spec.ts`:
  - mock `/api/tenant`, `/api/admin/auth/me`, `/api/admin/branding`;
  - allow/mock initial exact public `GET /api/branding`;
  - mock `/api/branding/assets/**`;
  - fail any `/api/auth/**`, `/api/chat/**`, `/api/notifications/**`,
    `/api/settings/**`, `/api/profile/**`;
  - count public branding only by exact
    `new URL(request.url()).pathname === '/api/branding'`, so
    `/api/branding/assets/**` does not pollute the count;
  - wait for the initial exact `GET /api/branding` response/baseline before
    switching tabs;
  - переключить `Вход -> Чат -> Инфо`;
  - проверить, что URL остается `/admin/branding`;
  - проверить, что switching не увеличил public `/api/branding` count.
- [x] Добавить viewport e2e in the same spec:
  - widths `1024`, `1280`, `1440`;
  - preview heading visible;
  - tablist visible;
  - phone region visible;
  - `documentElement.scrollWidth <= documentElement.clientWidth`.

## Test Requirements

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 pnpm test:e2e -- tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-assets.spec.ts tests/e2e/admin-branding-real-preview.spec.ts
```

Expected:

- admin unit tests pass;
- selected Playwright tests pass;
- no horizontal overflow at checked desktop widths.

## Review Checklist

- Layout does not overflow at `lg`.
- Existing save/upload e2e flows still cover old behavior.
- New e2e does not fail on legitimate app-level `/api/branding` initial load.
- Preview switching does not call customer APIs.
- Tabs are only `Вход`, `Чат`, `Инфо`.
