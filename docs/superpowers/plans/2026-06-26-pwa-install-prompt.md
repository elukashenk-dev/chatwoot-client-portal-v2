# PWA Install Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-blocking install prompt UX for the tenant-aware PWA using Chromium `beforeinstallprompt` when available and iOS/manual instructions as fallback.

**Architecture:** Keep installability state in `frontend/src/pwa` and expose it through a provider/hook mounted inside the tenant-scoped app. The chat page renders a small banner only after chat is ready, while the chat actions menu exposes the same install action when still relevant. Install prompt dismissal is stored per host and tenant with a TTL, and standalone/installed mode always suppresses install UI.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, browser PWA install events, localStorage.

---

### Task 1: PWA Install Runtime

**Files:**
- Create: `frontend/src/pwa/installPromptRuntime.tsx`
- Test: `frontend/src/pwa/installPromptRuntime.test.tsx`

- [ ] **Step 1: Write failing runtime tests**

Cover:
- `beforeinstallprompt` is prevented, stored and exposed as installable.
- calling install invokes the deferred prompt from a user action and hides the prompt after accepted/dismissed.
- `appinstalled` hides install UI.
- standalone display mode hides install UI.
- iOS Safari exposes manual instructions without a native prompt.
- dismissal is scoped by host and tenant slug and expires after the TTL.

Run:

```bash
pnpm --dir frontend test src/pwa/installPromptRuntime.test.tsx
```

Expected: fail because `installPromptRuntime.tsx` does not exist.

- [ ] **Step 2: Implement runtime**

Add:
- `PwaInstallPromptProvider`
- `usePwaInstallPrompt`
- `PwaInstallPromptState`
- helper functions for standalone detection, iOS Safari detection and dismissal keys.

The hook returns:

```ts
type PwaInstallPromptState =
  | { status: 'hidden'; reason: 'dismissed' | 'installed' | 'unsupported' | 'waiting' }
  | { status: 'available'; platform: 'native' | 'ios_manual' }
```

Actions:
- `install()`: calls native `prompt()` for Chromium or marks iOS instructions as viewed.
- `dismiss()`: records dismissal.

- [ ] **Step 3: Verify runtime tests pass**

Run:

```bash
pnpm --dir frontend test src/pwa/installPromptRuntime.test.tsx
```

Expected: pass.

### Task 2: Chat Install Banner

**Files:**
- Create: `frontend/src/pwa/PwaInstallBanner.tsx`
- Test: `frontend/src/pwa/PwaInstallBanner.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`

- [ ] **Step 1: Write failing banner tests**

Cover:
- no banner while state is hidden.
- native banner calls `install()`.
- iOS/manual banner opens concise instruction copy and supports `Понятно`.
- `Позже` calls `dismiss()`.

Run:

```bash
pnpm --dir frontend test src/pwa/PwaInstallBanner.test.tsx
```

Expected: fail because the component does not exist.

- [ ] **Step 2: Implement banner component**

Place it above the transcript region after `ChatRuntimeAlerts`, only when chat transcript is available. Use compact glass-style chat surface classes and concise copy:
- title: `Установите кабинет`
- body: `Чат будет быстрее открываться и останется доступен при плохой связи.`
- primary: `Установить`
- secondary: `Позже`

- [ ] **Step 3: Verify banner tests pass**

Run:

```bash
pnpm --dir frontend test src/pwa/PwaInstallBanner.test.tsx
```

Expected: pass.

### Task 3: Chat Menu Install Action

**Files:**
- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/chat-header/ChatHeaderActionsMenu.tsx`
- Test: `frontend/src/features/chat/components/ChatHeader.test.tsx`

- [ ] **Step 1: Write failing menu test**

Cover:
- when install state is available, actions menu includes `Установить приложение`.
- selecting the menu item invokes the install action and closes the menu.
- when install state is hidden, the menu item is absent.

Run:

```bash
pnpm --dir frontend test src/features/chat/components/ChatHeader.test.tsx
```

Expected: fail before the menu item exists.

- [ ] **Step 2: Implement menu action**

Use an existing icon from `frontend/src/shared/ui/icons.tsx` if suitable; otherwise add a small install/download icon there. Keep menu action under the `Аккаунт` group, after `Профиль`.

- [ ] **Step 3: Verify header tests pass**

Run:

```bash
pnpm --dir frontend test src/features/chat/components/ChatHeader.test.tsx
```

Expected: pass.

### Task 4: App Wiring And Regression Checks

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify if needed: `frontend/src/pwa/serviceWorkerRuntime.ts`

- [ ] **Step 1: Mount provider**

Wrap the tenant-scoped app content in `PwaInstallPromptProvider` so install state has tenant identity and is not mounted for public legal pages.

- [ ] **Step 2: Run targeted tests**

```bash
pnpm --dir frontend test src/pwa/installPromptRuntime.test.tsx src/pwa/PwaInstallBanner.test.tsx src/features/chat/components/ChatHeader.test.tsx src/features/chat/pages/ChatPage.test.tsx
```

Expected: pass.

- [ ] **Step 3: Run required frontend gates**

```bash
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check
```

Expected: pass.

- [ ] **Step 4: Review touched code**

Check that:
- no install UI appears in standalone mode;
- no prompt is invoked without a click;
- no iOS path attempts `beforeinstallprompt.prompt()`;
- dismissal is tenant/host scoped;
- auth/register routes are not blocked by install UX.
