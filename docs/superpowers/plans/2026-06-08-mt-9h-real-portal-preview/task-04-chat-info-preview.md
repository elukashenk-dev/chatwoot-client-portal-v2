# Task 04: Chat Info Preview

## Цель

Добавить экран `Инфо` как representative full-screen chat page. Этого хватает
для проверки похожих внутренних страниц, поэтому `Настройки` и `Уведомления`
не входят в scope.

## Scope

Create:

- `frontend/src/features/admin-branding/components/portal-preview/ChatInfoPreview.tsx`

Modify:

- `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.tsx`
- `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
- `frontend/src/features/chat/components/ChatInfoPage.tsx`
- `frontend/src/features/chat/components/ChatFullScreenPanel.test.tsx`
- `frontend/src/features/chat/components/ChatInfoPage.test.tsx`
- `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

## Implementation Steps

- [ ] Add `isBackActionReadOnly?: boolean` to `ChatFullScreenPanel`,
      default `false`.
- [ ] In normal mode keep current real back `<button>` unchanged.
- [ ] In read-only mode render visually identical
      `<span aria-hidden="true">` with the chevron icon:
      no `onClick`, no `type`, no role, no focusability.
- [ ] Add `isBackActionReadOnly?: boolean` to `ChatInfoPage` and pass it
      through to `ChatFullScreenPanel`.
- [ ] Add/extend focused tests:
  - default `ChatFullScreenPanel` still renders button
    `Вернуться к чату`;
  - read-only mode renders no button `Вернуться к чату`;
  - `ChatInfoPage` passes read-only mode correctly.
- [ ] Implement `ChatInfoPreview`:
  - use `ChatInfoPage`;
  - pass `isBackActionReadOnly`;
  - pass `previewThreadInfo` with `supportLabel` overridden from
    current draft branding;
  - pass `previewSupportAvailability`;
  - no API calls.
- [ ] Wire `ChatInfoPreview` into `PortalPreviewFrame` for tab `Инфо`.
- [ ] Add unit test:
  - tab `Инфо` shows draft `chatInfoTitle`;
  - shows `Личный чат`;
  - shows draft `supportLabel`;
  - shows `Часы работы`;
  - does not expose button `Вернуться к чату`.
- [ ] Add a no-fetch assertion around switching to `Инфо`:
  - spy on `globalThis.fetch`;
  - click tab `Инфо`;
  - assert expected info content;
  - assert `fetchSpy` was not called.
- [ ] For read-only back affordance tests, assert more than no button:
  - no accessible label `Вернуться к чату`;
  - no focusable element for the read-only chevron;
  - no `tabIndex` on the read-only affordance.

## Test Requirements

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/chat/components/ChatFullScreenPanel.test.tsx src/features/chat/components/ChatInfoPage.test.tsx --reporter verbose
```

Expected:

- info preview assertions pass;
- normal full-screen page back behavior stays covered.

## Review Checklist

- `Инфо` is representative enough for internal chat pages.
- No settings/notifications code is introduced.
- Back affordance is not focusable/clickable in preview mode.
- Normal customer runtime back button remains unchanged by default.
