# Task 02: Preview Frame And Login Screen

## Цель

Заменить mock body в `BrandingPreviewPane` на phone-sized preview frame с
переключателем `Вход`, `Чат`, `Инфо`, и реализовать первый экран `Вход`.

## Scope

Prerequisite:

- Task 01 completed.

Create:

- `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.tsx`
- `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`

Modify:

- `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx`
- `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

Do not include:

- `Настройки`;
- `Уведомления`;
- customer route mounting;
- `AuthSessionContext`.

## Implementation Steps

- [ ] В `PortalPreviewFrame.test.tsx` добавить test на screen selector:
      default selected tab is `Вход`; tabs exist only for `Вход`, `Чат`, `Инфо`.
- [ ] Для Task 02 сделать `Чат` и `Инфо` временными read-only placeholders,
      чтобы targeted tests task-а были green сразу после Task 02. Реальный content
      этих tab-ов добавляют Task 03 и Task 04.
- [ ] Добавить draft-update test: после `rerender` preview должен обновить
      auth heading, subtitle, logo URL и CSS variables.
- [ ] Реализовать `PortalPreviewFrame`:
  - local state `PreviewScreen = 'auth' | 'chat' | 'info'`;
  - `BrandingContext.Provider`;
  - `TenantIdentityContext.Provider`;
  - `.portal-branding-scope` со style из `createBrandingCssProperties`;
  - phone region с `role="region"` и
    `aria-label="Телефонный предпросмотр портала"`.
- [ ] Не добавлять `AuthSessionContext.Provider`: preview не должен зависеть от
      customer auth/session.
- [ ] Реализовать `AuthLoginPreview` через `TenantAuthShell`, а не bare
      `AuthShell`:
  - `title` и `description` из `branding.copy`;
  - brand name, logo, monogram и auth images должны приходить через
    `TenantAuthShell` + preview `BrandingContext`/`TenantIdentityContext`;
  - disabled email/password controls;
  - disabled button `Войти`;
  - reset/register controls render as static text/spans, not `Link`;
  - phone support renders as static text, not active `tel:` link;
  - footer helper block как static presentation.
- [ ] Заменить body `BrandingPreviewPane` на `PortalPreviewFrame`.
- [ ] Добавить read-only login assertions:
  - email/password controls disabled;
  - `Войти` disabled;
  - `Забыли пароль?` и `Создать аккаунт` are not links;
  - support phone is not an active `tel:` link.

## Test Requirements

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json
```

Expected:

- login assertions pass;
- screen selector tests pass with temporary read-only placeholders for
  `Чат` and `Инфо`.

## Review Checklist

- В frame нет customer API calls.
- В frame нет auth/session provider.
- Screen selector снаружи phone-frame; внутри phone-frame controls read-only.
- Login preview использует real auth shell classes, а не старую карточку.
- `Настройки` и `Уведомления` отсутствуют в tabs, tests and code.
