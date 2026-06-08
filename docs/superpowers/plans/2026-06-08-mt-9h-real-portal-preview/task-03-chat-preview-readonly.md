# Task 03: Chat Preview Read-Only Boundary

## Цель

Показать экран `Чат` похожим на настоящий мобильный чат, но без скрытой
интерактивности: без send, logout, menu navigation, message actions, retry and
reply behavior.

## Scope

Prerequisites:

- Task 01 completed.
- Task 02 completed.

Create:

- `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx`
- `frontend/src/features/admin-branding/components/portal-preview/ChatConversationPreview.tsx`

Modify:

- `frontend/src/features/chat/components/ChatTranscript.tsx`
- `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- `frontend/src/features/chat/components/ChatTranscript.test.tsx`
- `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

Do not use:

- real `ChatHeader`;
- `useNavigate`;
- `useAuthSession`;
- menu/dropdown components;
- send API clients.

## Implementation Steps

- [ ] Add `isReadOnly?: boolean` to `ChatTranscript`, default `false`.
- [ ] Pass `isReadOnly` into `MessageBubble`.
- [ ] In `ChatConversationPreview`, pass safe transcript props:
  - `hasMoreOlder={false}`;
  - `historyFragmentControls={null}` or omit it so default is null;
  - no-op callbacks;
  - text-only preview messages from Task 01.
- [ ] In `MessageBubble`:
  - add `isReadOnly?: boolean`;
  - set reply/action availability to false when read-only;
  - hide `Действия с сообщением ...` buttons when read-only;
  - suppress `RetryTextSend` when read-only;
  - do not render attachment links/players in read-only preview. The first
    implementation may enforce this by keeping preview messages text-only and
    adding tests that no attachments are present.
  - prevent swipe/context-menu reply paths when read-only.
- [ ] Add regression tests in `ChatTranscript.test.tsx`:
  - default runtime still exposes message actions and reply behavior;
  - `isReadOnly` hides action/retry controls and does not call reply handlers.
  - `isReadOnly` does not reveal actions through desktop context menu;
  - `isReadOnly` does not reveal actions through touch/tap behavior;
  - `isReadOnly` does not trigger swipe reply;
  - `isReadOnly` renders no message context menu.
- [ ] Create `ChatHeaderPreview` as presentational copy:
  - `span aria-hidden` for menu/more icons;
  - no buttons;
  - no router/session imports;
  - logo/avatar from branding logo or monogram.
- [ ] Create `ChatConversationPreview`:
  - `ChatHeaderPreview`;
  - `ChatTranscript isReadOnly`;
  - sample messages from `previewData`;
  - disabled composer controls.
- [ ] Add unit test for chat preview:
  - spy on `globalThis.fetch`;
  - click tab `Чат`;
  - heading `Личный чат`;
  - subtitle `Вы и поддержка`;
  - sample incoming/outgoing messages;
  - no history buttons such as loading older/return controls;
  - no `Открыть меню чата` or `Открыть навигацию` buttons;
  - no `Действия с сообщением ...` buttons;
  - no attachment links/media controls;
  - composer textarea and send button disabled.
  - `Настройки` and `Уведомления` are absent.
  - `fetchSpy` was not called while switching to/rendering the chat preview.

## Test Requirements

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/chat/components/ChatTranscript.test.tsx --reporter verbose
```

Expected:

- chat preview assertions pass;
- default customer transcript behavior remains covered.

## Review Checklist

- `ChatHeaderPreview` is pure presentation.
- `isReadOnly` is opt-in only; normal runtime default stays unchanged.
- No send/retry/reply/menu/navigation behavior is reachable from preview.
- Transcript still visually uses real message bubble primitives.
