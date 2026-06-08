# Task 01: Preview Model And Sample Data

## Цель

Создать безопасную preview-модель, которая позволяет render-ить portal-like
экраны в админке без customer session и без customer API.

## Scope

Create:

- `frontend/src/features/admin-branding/lib/previewBranding.ts`
- `frontend/src/features/admin-branding/components/portal-preview/previewData.ts`
- `frontend/src/features/admin-branding/lib/previewBranding.test.ts`

Do not modify:

- backend routes;
- customer route pages;
- Chatwoot clients.

## Implementation Steps

- [x] Написать unit tests для `createPreviewPublicBranding` и
      `createPreviewTenantIdentity` в `previewBranding.test.ts`.
- [x] Проверить в тестах, что `createPreviewPublicBranding(draft)` переносит
      `portalName`, `supportLabel`, `colors`, `copy`, `assets` and sets
      deterministic preview `version`.
- [x] Проверить в тестах, что `createPreviewTenantIdentity(draft)` возвращает
      safe deterministic tenant values:
  - `displayName: draft.portalName`;
  - `slug: 'preview'`;
  - `primaryDomain: 'preview.local'`;
  - `publicBaseUrl: 'https://preview.local'`;
  - `status: 'ready'`.
  - `errorMessage: null`;
  - `isUsingCachedData: false`.
- [x] Не импортировать `PortalPreviewFrame` в Task 01 tests. UI render and
      no-fetch preview assertions start in Task 02, where the frame exists.
- [x] Создать `createPreviewPublicBranding(draft)`, который возвращает
      `PublicBranding` без network-зависимостей.
- [x] Создать `createPreviewTenantIdentity(draft)`, который возвращает
      `TenantIdentityContextValue` со статусом `ready` и preview tenant data.
- [x] Создать `previewData.ts` с минимальными typed fixtures:
      `previewThread`, `previewMessages`, `previewSupportAvailability`,
      `previewThreadInfo`.
- [x] В `previewData.ts` использовать реальные текущие type shapes из
      `frontend/src/features/chat/types.ts`, включая `ChatWorkingHoursRow`:
      `openTime`, `closeTime`, `isOpenAllDay`, `isClosedAllDay`.
- [x] Keep `previewMessages` text-only: `attachments: []` for every message.

## Test Requirements

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/lib/previewBranding.test.ts --reporter verbose
pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json
```

Expected:

- helper unit tests pass;
- typecheck не падает на helper return shapes and sample data shapes.

## Review Checklist

- `previewBranding.ts` не импортирует admin API clients.
- `previewData.ts` не содержит real user secrets, Chatwoot IDs как authority
  или external URLs.
- Sample data достаточно для login/chat/info, но не тянет settings/notifications.
- Нет backend/runtime side effects.
