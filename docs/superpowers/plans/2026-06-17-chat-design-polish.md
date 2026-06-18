# Chat Design Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the customer chat screen into the same visual language as the approved auth full-background design: light abstract business background, floating translucent rounded header, floating translucent rounded composer, and refined chat message surfaces.

**Architecture:** This is a frontend-only visual slice. It reuses the existing tenant branding CSS variables and already-uploaded chat background asset; it does not add backend fields, migrations, API contracts, or new admin controls. Work must stay incremental: Task 1 changes only the chat shell, then stops for visual approval before message bubbles and secondary states are touched.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, existing `frontend/src/index.css` branding variables, Vitest/Testing Library, Playwright-driven browser smoke/screenshots or an explicit documented blocker when a real device condition cannot be automated.

---

## Current Context

The accepted auth direction is a pale blue full-screen background with subtle abstract tech lines and a bottom fountain pen, using primary color `#144164`. The chat screen already consumes tenant chat background via `--portal-chat-background-image`, so this plan must not create a new background system.

Open related finding:

- `docs/findings/F-IOS-001-keyboard-textarea-viewport-pan.md` remains deferred. This plan must not try to close it implicitly, but it must verify that focused composer/keyboard-adjacent behavior is not worsened by the new floating footer. A real iOS keyboard regression check is required manually or must be recorded as a blocker if no device is available.

Current chat composition:

- Runtime page: `frontend/src/features/chat/pages/ChatPage.tsx`
- Header: `frontend/src/features/chat/components/ChatHeader.tsx`
- Composer/footer: `frontend/src/features/chat/components/MessageComposer.tsx`
- Transcript: `frontend/src/features/chat/components/ChatTranscript.tsx`
- Message bubbles: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Date divider: `frontend/src/features/chat/components/chat-transcript/DayDivider.tsx`
- Preview parity: `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx` and `ChatConversationPreview.tsx`
- Shared visual rules: `frontend/src/index.css`

## Hard Boundaries

- Do not change backend, database, API, tenant branding schema, object storage, auth/session, send, realtime, unread, read sync or offline queue behavior.
- Do not introduce a new chat background upload slot. The existing chat background image remains the source of truth.
- Do not change message ordering, scroll anchoring logic, typing sync, reply gestures, attachment upload, voice recording or notification menus.
- Do not restyle auth pages in this slice.
- Do not touch generated image files under `tmp/` or commit runtime artifacts.
- Keep the first implementation task small and visually reviewable.

## Target Visual Direction

- Header: floating rounded glass panel, not a full-width white bar.
- Composer: floating rounded glass panel above the bottom safe area, not a full-width white slab.
- Transcript: messages sit on the existing branded background with enough spacing so the floating shell never feels cramped.
- Outgoing messages: primary-color bubble with a subtle bottom/depth gradient.
- Incoming messages: white translucent glass bubble with thin border and readable dark text.
- Date dividers and empty states: subtle glass/pill elements, not heavy gray blocks.
- Admin preview: chat preview must match runtime shell and bubbles closely enough that branding admins do not see a different chat design in preview.

## Task 1: Floating Chat Shell Only

**Purpose:** Change only chat header, composer/footer and transcript spacing. Message bubbles, date dividers and empty states remain visually unchanged in this task.

**Files:**

- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/ChatConversationPreview.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/features/chat/components/ChatHeader.test.tsx`
- Test: `frontend/src/features/chat/components/MessageComposer.test.tsx`
- Test: `frontend/src/features/chat/components/ChatTranscript.test.tsx`
- Test: `frontend/src/features/chat/components/ChatTranscript.viewport.test.tsx`
- Test: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`
- Test: `tests/e2e/customer-branding-runtime.spec.ts`
- Test: `tests/e2e/admin-branding-real-preview.spec.ts`

- [ ] **Step 1: Add semantic shell classes to CSS**

  In `frontend/src/index.css`, add reusable shell classes near the existing chat visual classes:

  ```css
  .chat-floating-header-surface,
  .chat-floating-composer-surface {
    background-color: rgb(255 255 255 / 0.72);
    background-image: linear-gradient(
      180deg,
      rgb(255 255 255 / 0.86),
      rgb(255 255 255 / 0.66)
    );
    border-color: rgb(255 255 255 / 0.68);
    box-shadow:
      0 14px 34px rgb(20 65 100 / 0.12),
      inset 0 1px 0 rgb(255 255 255 / 0.72);
    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
  }

  .chat-floating-header-surface {
    color: var(--portal-chat-header-foreground, #0f172a);
  }

  .chat-floating-composer-surface {
    color: var(--portal-chat-text-color, #334155);
  }
  ```

  Do not use `--portal-chat-header-background-image` or `--portal-chat-background-image` inside the floating surfaces. The page background remains the only background image source; the header/composer are translucent overlays above it.

  Keep the existing `.chat-header-background` class in place for full-screen panels and existing branded header semantics until Task 4 decides whether to move those panels to the floating class.

- [ ] **Step 2: Refactor `ChatHeader` into transparent safe-area wrapper plus floating inner panel**

  Replace the full-width visual header with this structure:

  ```tsx
  <header className="app-safe-top relative z-30 bg-transparent px-3 pb-2 text-[color:var(--portal-chat-header-foreground,#0f172a)] sm:px-6 sm:pb-3">
    <div className="chat-floating-header-surface mx-auto flex min-h-14 w-full max-w-[620px] items-center gap-3 rounded-[1.35rem] border px-3 py-2 sm:min-h-[3.75rem] sm:px-4">
      {/* existing header controls, avatar, title, presence and menus stay here */}
    </div>
  </header>
  ```

  Move the existing header children into the inner `<div>`. Keep all existing button refs, menu refs, ARIA attributes, `ChatAvatar`, `ChatHeaderPresence`, menu behavior and navigation behavior unchanged.

- [ ] **Step 3: Refactor `MessageComposer` footer into transparent wrapper plus floating inner panel**

  Replace the current white full-width footer wrapper:

  ```tsx
  <footer
    className={cn(
      'border-t border-slate-200/70 bg-white px-4 pt-3 sm:px-6',
      isVisualKeyboardOpen
        ? 'pb-1.5'
        : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
    )}
  >
    <div className="mx-auto w-full max-w-[620px]">
  ```

  with:

  ```tsx
  <footer
    className={cn(
      'relative z-20 bg-transparent px-3 pt-2 sm:px-6',
      isVisualKeyboardOpen
        ? 'pb-1.5'
        : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
    )}
  >
    <div className="chat-floating-composer-surface mx-auto w-full max-w-[620px] rounded-[1.35rem] border px-3 py-2">
  ```

  Keep attachment preview, reply preview, voice recording panel, textarea, side controls and send behavior inside the same inner surface.

- [ ] **Step 4: Apply the same shell-only treatment to admin chat preview**

  In `ChatHeaderPreview.tsx`, mirror the Task 1 header structure:

  ```tsx
  <header className="app-safe-top relative z-30 bg-transparent px-3 pb-2 text-[color:var(--portal-chat-header-foreground,#0f172a)]">
    <div className="chat-floating-header-surface mx-auto flex min-h-14 w-full items-center gap-3 rounded-[1.35rem] border px-3 py-2">
      {/* existing preview header controls, avatar, title and presence stay here */}
    </div>
  </header>
  ```

  In `ChatConversationPreview.tsx`, mirror the Task 1 footer structure:

  ```tsx
  <footer className="relative z-20 bg-transparent px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
    <div className="chat-floating-composer-surface mx-auto w-full rounded-[1.35rem] border px-3 py-2">
      {/* existing disabled preview composer controls stay here */}
    </div>
  </footer>
  ```

  Keep the preview read-only and keep all preview buttons disabled.

- [ ] **Step 5: Adjust transcript padding for the new floating shell**

  In `ChatTranscript`, change the scroll section classes from:

  ```tsx
  className="chat-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
  ```

  to:

  ```tsx
  className="chat-scroll flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5"
  ```

  The header and composer are still in normal document flow, so no fixed-position overlay padding is needed in Task 1.

- [ ] **Step 6: Update shell-focused tests**

  In `ChatHeader.test.tsx`, update the semantic-header test so it expects:

  ```ts
  expect(screen.getByRole('banner')).toHaveClass('app-safe-top')
  expect(screen.getByRole('banner')).not.toHaveClass('chat-header-background')
  expect(
    screen.getByRole('banner').querySelector('.chat-floating-header-surface'),
  ).not.toBeNull()
  ```

  Keep the existing expectations for `chat-header-icon-button` and `chat-header-menu-button`.

  In `MessageComposer.test.tsx`, keep the behavior tests and add:

  ```ts
  expect(
    screen.getByRole('textbox', { name: 'Сообщение' }).closest(
      '.chat-floating-composer-surface',
    ),
  ).not.toBeNull()
  ```

  In `ChatPage.test.tsx`, update only assertions that directly expect `chat-header-background` on the runtime banner.

  In `PortalPreviewFrame.test.tsx`, add shell parity assertions:

  ```ts
  expect(container.querySelector('.chat-floating-header-surface')).not.toBeNull()
  expect(container.querySelector('.chat-floating-composer-surface')).not.toBeNull()
  ```

- [ ] **Step 7: Extend Playwright shell visual smoke**

  Extend `tests/e2e/customer-branding-runtime.spec.ts`. Do not create a separate e2e spec for this slice; the required commands below intentionally run the existing customer branding/runtime spec. The test must reuse mocked tenant, branding and ready-chat routes and must:

  - set viewport `390x844`, open authenticated `/app/chat`, and assert `.chat-floating-header-surface` and `.chat-floating-composer-surface` are visible;
  - verify both floating surfaces are narrower than the viewport and not full-width;
  - focus the composer textbox and assert the composer remains visible and usable;
  - repeat the shell visibility check at `440x956`;
  - capture screenshots to an ignored local path such as `tmp/playwright-chat-design-polish/` for human review, or attach screenshots through Playwright test info.

  Extend `tests/e2e/admin-branding-real-preview.spec.ts` so the Chat preview tab asserts:

  - `.chat-floating-header-surface` and `.chat-floating-composer-surface` are present inside the phone preview;
  - the phone preview bottom fits within a `1440x900` viewport;
  - no customer runtime API requests are made.

- [ ] **Step 8: Run targeted tests**

  Run:

  ```bash
  pnpm --dir frontend test -- ChatHeader.test.tsx MessageComposer.test.tsx ChatTranscript.test.tsx ChatTranscript.viewport.test.tsx ChatPage.test.tsx PortalPreviewFrame.test.tsx
  pnpm test:e2e -- customer-branding-runtime.spec.ts admin-branding-real-preview.spec.ts
  ```

  Expected: all targeted tests pass.

- [ ] **Step 9: Visual approval gate**

  Start the frontend dev server only if needed:

  ```bash
  pnpm --dir frontend dev -- --host 127.0.0.1
  ```

  Capture with Playwright or manually inspect the Playwright screenshots for:

  - `390x844`
  - `440x956`
  - `/admin/branding` chat preview at `1440x900`

  Acceptance:

  - header is rounded, translucent and not full-width;
  - composer is rounded, translucent and not full-width;
  - messages remain unchanged;
  - no content is hidden by header/composer;
  - admin preview shows the same shell direction;
  - focused composer remains visible and usable;
  - mobile safe-area spacing still works;
  - if no real iOS device is available for keyboard smoke, record that as a blocker and do not claim `F-IOS-001` is closed.

  Stop here and ask the user to approve the shell before Task 2.

## Task 2: Message Bubbles, Date Dividers And Empty State

**Purpose:** After shell approval, make transcript content match the new background without touching send/realtime behavior.

**Files:**

- Modify: `frontend/src/index.css`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: `frontend/src/features/chat/components/chat-transcript/DayDivider.tsx`
- Modify: `frontend/src/features/chat/components/chat-transcript/EmptyTranscriptState.tsx`
- Modify: `frontend/src/features/chat/components/AgentTypingIndicator.tsx`
- Test: `frontend/src/features/chat/components/ChatTranscript.test.tsx`
- Test: `frontend/src/features/chat/components/AgentTypingIndicator.test.tsx`

- [ ] **Step 1: Update outgoing bubble surface**

  Replace `.chat-outgoing-surface` with a primary-color depth treatment:

  ```css
  .chat-outgoing-surface {
    background-color: var(--color-chat-outgoing);
    background-image:
      linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(0 0 0 / 0.08)),
      linear-gradient(135deg, rgb(255 255 255 / 0.04), rgb(0 0 0 / 0.12));
    box-shadow: 0 8px 20px rgb(20 65 100 / 0.16);
  }
  ```

- [ ] **Step 2: Update incoming bubble surface**

  Replace `.chat-incoming-surface` with a glass surface:

  ```css
  .chat-incoming-surface {
    background:
      linear-gradient(180deg, rgb(255 255 255 / 0.88), rgb(255 255 255 / 0.72));
    box-shadow:
      0 10px 26px rgb(20 65 100 / 0.08),
      inset 0 1px 0 rgb(255 255 255 / 0.76);
    backdrop-filter: blur(12px);
  }
  ```

  Keep message text color controlled by `--portal-chat-text-color`.

- [ ] **Step 3: Update incoming bubble border classes**

  In `MessageBubble.tsx`, keep the existing outgoing classes and change incoming border emphasis to a softer glass border:

  ```tsx
  : `${radiusClassName} chat-incoming-surface flow-root break-words border border-white/65 px-4 py-2.5 text-chat-message text-slate-700`
  ```

- [ ] **Step 4: Restyle date divider**

  In `DayDivider.tsx`, make lines and label softer:

  ```tsx
  <div className="h-px flex-1 bg-white/55" />
  <span className="chat-muted-text rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-normal shadow-sm shadow-slate-900/[0.04] backdrop-blur-md">
    {label}
  </span>
  <div className="h-px flex-1 bg-white/55" />
  ```

- [ ] **Step 5: Restyle empty state**

  In `EmptyTranscriptState.tsx`, replace the dashed gray block with a glass card:

  ```tsx
  <div className="chat-muted-text rounded-[1.25rem] border border-white/65 bg-white/70 px-5 py-8 text-center text-[14px] leading-6 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md">
  ```

- [ ] **Step 6: Restyle typing indicator dots**

  In `AgentTypingIndicator.tsx`, keep layout and ARIA unchanged, but use primary/muted chat colors:

  ```tsx
  className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-chat-outgoing,#465a72)] opacity-70 motion-safe:animate-bounce"
  ```

- [ ] **Step 7: Update transcript tests**

  In `ChatTranscript.test.tsx`, update class assertions that expect old incoming/outgoing/date divider classes. Keep behavior assertions for:

  - author avatars;
  - status labels;
  - reply actions;
  - copy actions;
  - swipe-to-reply;
  - scroll anchoring.

- [ ] **Step 8: Run targeted tests**

  Run:

  ```bash
  pnpm --dir frontend test -- ChatTranscript.test.tsx AgentTypingIndicator.test.tsx
  ```

  Expected: all targeted tests pass.

- [ ] **Step 9: Visual approval gate**

  Inspect `390x844` and `440x956`.

  Acceptance:

  - outgoing bubbles read as primary brand action;
  - incoming bubbles remain readable over the background;
  - date dividers are visible but quiet;
  - empty state uses the new glass card style instead of the old dashed gray block.

  Stop and ask the user to approve transcript styling before Task 3.

## Task 3: Composer Control Polish

**Purpose:** Keep the new footer surface but refine the input controls so attachment, microphone, textarea and send button feel native to the new design.

**Files:**

- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerTextarea.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerSendButton.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/VoiceRecordingPanel.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerAttachmentPreview.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerReplyPreview.tsx`
- Modify: `frontend/src/features/chat/components/message-composer/ComposerFeedback.tsx`
- Test: `frontend/src/features/chat/components/MessageComposer.test.tsx`
- Test: `frontend/src/features/chat/components/message-composer/ComposerTextarea.test.tsx`

- [ ] **Step 1: Keep textarea transparent and readable**

  In `ComposerTextarea.tsx`, keep `bg-transparent`, preserve `min-h-10`, and only update placeholder tone if needed:

  ```tsx
  placeholder:text-[color:var(--portal-chat-muted-text-color,#64748b)]
  ```

  Do not add a bordered input wrapper inside the floating composer.

- [ ] **Step 2: Refine side icon hover states**

  In `MessageComposer.tsx`, update attachment and voice button hover backgrounds to white glass:

  ```tsx
  hover:bg-white/55 hover:text-chat-outgoing/90
  ```

  Keep disabled behavior and collapse behavior unchanged.

- [ ] **Step 3: Refine send button states**

  In `ComposerSendButton.tsx`, keep enabled send on `bg-chat-outgoing`, but make disabled state match the new glass surface:

  ```tsx
  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chat-control bg-chat-outgoing text-white shadow-sm shadow-slate-900/10 transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-white/80 disabled:shadow-none"
  ```

- [ ] **Step 4: Keep reply, attachment, voice and feedback panels inside the glass system**

  Update panel backgrounds to the same glass family:

  - reply preview: `bg-white/60 border-white/65 backdrop-blur-md`;
  - attachment preview: `bg-white/60 border-white/65 backdrop-blur-md`;
  - voice recording panel: `bg-white/60 border-white/65 backdrop-blur-md`;
  - feedback error: keep red semantics, but use translucent background.

- [ ] **Step 5: Run composer tests**

  Run:

  ```bash
  pnpm --dir frontend test -- MessageComposer.test.tsx ComposerTextarea.test.tsx
  ```

  Expected: all targeted tests pass.

- [ ] **Step 6: Visual approval gate**

  Manually verify:

  - empty composer;
  - draft text typed;
  - too-long text error;
  - reply preview;
  - selected attachment preview;
  - disabled/offline send;
  - voice recording panel if microphone permissions are available.

  Stop and ask the user to approve composer states before Task 4.

## Task 4: Header Menus And Auxiliary Chat Pages

**Purpose:** Ensure menu surfaces and chat-adjacent pages do not feel detached from the new header/footer style.

**Files:**

- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
- Modify: `frontend/src/features/chat/components/ChatInfoPage.tsx`
- Modify: `frontend/src/features/chat/components/ChatMediaPage.tsx`
- Modify: `frontend/src/features/chat/components/ChatSearchPage.tsx`
- Modify: `frontend/src/features/chat/components/ChatNotificationsPage.tsx`
- Test: `frontend/src/features/chat/components/ChatHeader.test.tsx`
- Test: `frontend/src/features/chat/components/ChatFullScreenPanel.test.tsx`
- Test: `frontend/src/features/chat/components/ChatInfoPage.test.tsx`
- Test: `frontend/src/features/chat/components/ChatMediaPage.test.tsx`
- Test: `frontend/src/features/chat/components/ChatSearchPage.test.tsx`
- Test: `frontend/src/features/chat/components/ChatNotificationsPage.test.tsx`

- [ ] **Step 1: Keep dropdown menus functionally unchanged**

  Keep `portal-menu-surface` and existing menu item layout for the left thread menu and right chat menu. Do not redesign dropdown contents in this task. Update tests only if the runtime header wrapper changes query structure.

- [ ] **Step 2: Update `ChatFullScreenPanel` header to the floating shell**

  Replace the current full-width flat header in `ChatFullScreenPanel.tsx` with the same floating header wrapper used by `ChatHeader`:

  ```tsx
  <header className="app-safe-top relative z-30 bg-transparent px-3 pb-2 sm:px-6 sm:pb-3">
    <div className="chat-floating-header-surface mx-auto flex min-h-14 w-full max-w-[620px] items-center gap-3 rounded-[1.35rem] border px-3 py-2 sm:px-4">
      {/* existing back affordance and title stay here */}
    </div>
  </header>
  ```

  Keep back buttons, titles and panel routing unchanged.

- [ ] **Step 3: Update only repeated body surfaces that remain visibly flat**

  In info/media/search/notifications pages, limit changes to repeated card/search/empty-state surfaces that currently use `border-slate-200`, `bg-white`, `bg-slate-50`, or `bg-slate-100`. Use this class pattern:

  ```tsx
  border-white/65 bg-white/70 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md
  ```

  Preserve semantic status colors for amber/green/red warnings and toggles. Do not restyle notification switches beyond their containing cards.

  Do not change data loading, forms, toggles, notification state or search behavior.

- [ ] **Step 4: Run targeted tests**

  Run:

  ```bash
  pnpm --dir frontend test -- ChatHeader.test.tsx ChatFullScreenPanel.test.tsx ChatInfoPage.test.tsx ChatMediaPage.test.tsx ChatSearchPage.test.tsx ChatNotificationsPage.test.tsx
  ```

  Expected: all targeted tests pass.

- [ ] **Step 5: Visual approval gate**

  Verify menus and auxiliary pages from the real chat screen:

  - left thread menu;
  - right chat menu;
  - profile navigation still works;
  - search page;
  - media/files page;
  - info page;
  - notifications page.

  Stop and ask the user to approve the secondary screens before Task 5.

## Task 5: Admin Branding Preview Final Parity

**Purpose:** After runtime shell, bubbles and composer are approved, verify `/admin/branding` chat preview still matches the runtime chat design closely enough for branding decisions.

**Files:**

- Modify: `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/ChatConversationPreview.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`
- Test: `tests/e2e/admin-branding-real-preview.spec.ts`

- [ ] **Step 1: Verify shell parity from Task 1 remains intact**

  Confirm `ChatHeaderPreview.tsx` and `ChatConversationPreview.tsx` still contain `.chat-floating-header-surface` and `.chat-floating-composer-surface` after Tasks 2-4. If a later task moved runtime classes, update preview classes to the same names and structure.

- [ ] **Step 2: Align static preview composer controls with runtime composer controls**

  Mirror the final runtime button/input classes from `MessageComposer.tsx`, `ComposerTextarea.tsx` and `ComposerSendButton.tsx` in the read-only preview. Keep all preview buttons disabled and no runtime actions.

- [ ] **Step 3: Update preview tests**

  In `PortalPreviewFrame.test.tsx`, update expectations to confirm:

  ```ts
  expect(screen.getByRole('banner')).toHaveClass('app-safe-top')
  expect(container.querySelector('.chat-floating-header-surface')).not.toBeNull()
  expect(container.querySelector('.chat-floating-composer-surface')).not.toBeNull()
  ```

  Keep existing assertions that the preview is read-only and does not call customer runtime APIs.

- [ ] **Step 4: Run preview tests**

  Run:

  ```bash
  pnpm --dir frontend test -- PortalPreviewFrame.test.tsx
  pnpm test:e2e -- admin-branding-real-preview.spec.ts
  ```

  Expected: all preview tests pass.

- [ ] **Step 5: Visual approval gate**

  Inspect `/admin/branding` chat preview at desktop width.

  Acceptance:

  - preview phone shows the same floating header/composer language;
  - bottom of phone preview remains visible at `1440x900`;
  - preview remains read-only;
  - changing chat background/primary color still updates the preview.

## Task 6: Final Verification And Checkpoint

**Purpose:** Close the slice with targeted automated checks, visual smoke and a clean checkpoint.

**Files:**

- Modify only if needed: `docs/roadmap/work-log.md`

- [ ] **Step 1: Run frontend targeted suite**

  Run:

  ```bash
  pnpm --dir frontend test -- ChatHeader.test.tsx MessageComposer.test.tsx ChatTranscript.test.tsx AgentTypingIndicator.test.tsx ChatFullScreenPanel.test.tsx PortalPreviewFrame.test.tsx
  ```

  Expected: all targeted tests pass.

- [ ] **Step 2: Run full frontend test suite**

  Run:

  ```bash
  pnpm --dir frontend test
  ```

  Expected: all frontend tests pass.

- [ ] **Step 3: Run lint, build and diff checks**

  Run:

  ```bash
  pnpm lint
  pnpm build
  git diff --check
  ```

  Expected: lint/code-health pass, build passes and `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Browser visual smoke with screenshots**

  Run the Playwright visual smoke tests added/updated in this plan:

  ```bash
  pnpm test:e2e -- customer-branding-runtime.spec.ts admin-branding-real-preview.spec.ts
  ```

  Inspect Playwright-driven screenshots or manually captured screenshots for:

  - `390x844`;
  - `440x956`;
  - desktop admin preview at `1440x900`.

  Required visual checks:

  - header/composer are translucent and rounded;
  - background remains visible but text stays readable;
  - composer is usable with typed draft;
  - long messages do not overflow;
  - menus are reachable;
  - date dividers are readable;
  - admin preview matches runtime direction.
  - focused composer remains visible and usable after focusing the textbox.

  If no real iOS device is available, explicitly state that `F-IOS-001` remains deferred and was not closed by this visual polish slice.

- [ ] **Step 5: Update work log only if this becomes accepted product baseline**

  If the user accepts the final chat redesign as the new baseline, append one short bullet to `docs/roadmap/work-log.md` under `Current Baseline` and refresh `Recommended Next Step`. Do not list test details in the work log.

- [ ] **Step 6: Request final review**

  Request independent review of the final diff before commit. Fix Critical/Important findings before checkpoint.

- [ ] **Step 7: Checkpoint commit**

  After review, fixes and checks:

  ```bash
  git status --short
  git add frontend/src/features/chat frontend/src/features/admin-branding/components/portal-preview frontend/src/index.css docs/roadmap/work-log.md tests/e2e/customer-branding-runtime.spec.ts tests/e2e/admin-branding-real-preview.spec.ts
  git commit -m "feat: polish branded chat UI"
  ```

  The plan artifact is committed separately before implementation and remains as the committed execution record. Include `docs/superpowers/plans/2026-06-17-chat-design-polish.md` in this final feature commit only if implementation updated checklist/status lines after that docs-only checkpoint.

  Exclude generated screenshots, `tmp/`, `dist`, `test-results`, `playwright-report`, `.env` and other runtime artifacts.

## Manual Test Cases

- Open chat with the accepted uploaded background and verify the floating header/composer do not cover content.
- Open chat with no chat background image and verify the fallback still looks readable.
- Send a short text message and verify the draft clears.
- Type a long multiline message and verify composer height and layout stay stable.
- Open attachment picker, cancel it, then select a file and verify preview styling.
- Trigger too-long text validation and verify error text is readable inside the glass composer.
- Open left thread menu and right chat menu.
- Open search, media/files, info and notification settings pages.
- Verify offline/cached chat state still shows connection warnings and disabled composer state.
- Verify `/admin/branding` chat preview remains read-only and updates from unsaved branding draft values.

## Plan Checkpoint Before Implementation

Before implementation starts:

- independent plan review must return `ready`, or all Critical/Important findings must be fixed and re-reviewed;
- run `git diff --check`;
- commit this docs-only plan artifact separately:

```bash
git add docs/superpowers/plans/2026-06-17-chat-design-polish.md
git commit -m "docs: add chat design polish plan"
```

Implementation starts only after the docs-only checkpoint commit is complete. The plan is not deleted at feature completion; future cleanup or removal of completed `docs/superpowers/` execution artifacts requires the docs-preservation audit from `AGENTS.md`.

## Review Checklist For The Independent Reviewer

- The plan keeps Task 1 small and stops before message bubbles.
- The plan does not introduce backend/schema/API changes.
- The plan keeps runtime behavior untouched: send, realtime, offline queue, read sync, typing, menus and route navigation.
- The plan includes admin preview parity.
- The plan includes mobile checks for `390x844` and `440x956`.
- The plan includes regression tests for changed chat components.
- The plan avoids committing generated images or runtime artifacts.
