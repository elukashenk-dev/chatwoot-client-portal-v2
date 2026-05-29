# ChatPage Test Suite Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the ChatPage unit test suite as a reliable frontend closure
gate after Offline-first PWA changes.

**Architecture:** This is a test-stabilization slice, not a product behavior
slice. First prove whether each failure is outdated test setup or a real
ChatPage runtime/composer bug, then update the smallest test helper or
component boundary needed. Keep application behavior aligned with the
Offline-first PWA MVP: text can use durable outbox, media and voice stay
online-only, and composer controls may be disabled when runtime state is not
ready.

**Tech Stack:** Vitest, React Testing Library, `@testing-library/user-event`,
fake-indexeddb, frontend ChatPage runtime/offline modules.

---

## Context

Related findings:

- `docs/findings/F-TEST-003-chatpage-unit-suite-timeouts.md`
- `docs/findings/F-TEST-002-chatpage-test-code-health-overshoot.md`

Current known symptom:

- `pnpm --dir frontend test` fails in existing ChatPage unit tests.
- The failures also reproduce on the unchanged production cleanup baseline
  `fix/no-legacy-cleanup-gate`, so they are not introduced by the PWA boot
  deadline hotfix.
- Failing groups include `ChatPage.runtime.test.tsx`,
  `ChatPage.test.tsx`, and one search-context attachment scenario where the
  composer is rendered disabled.

Do not remove tests to make the suite green. Either make the test setup match
current runtime requirements or fix a real ChatPage regression with a failing
test first.

## Files

- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.search-context-regression.test.tsx`
- Modify if needed: shared ChatPage test helpers in the same files or existing
  nearby helper modules.
- Modify only if a real product bug is proven:
  `frontend/src/features/chat/pages/ChatPage.tsx` and directly related
  frontend-domain modules.
- Delete after closure: `docs/findings/F-TEST-003-chatpage-unit-suite-timeouts.md`
- Optionally update/delete after closure:
  `docs/findings/F-TEST-002-chatpage-test-code-health-overshoot.md`

## Task 1: Reproduce And Classify Failures

- [ ] **Step 1: Run the runtime test file alone**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.runtime.test.tsx -- --runInBand
```

Expected now: FAIL in the known runtime hardening scenarios, or PASS if the
baseline changed before this task starts.

- [ ] **Step 2: Run the general ChatPage test file alone**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.test.tsx -- --runInBand
```

Expected now: FAIL in composer send/media/voice scenarios, or PASS if already
fixed.

- [ ] **Step 3: Run the search-context regression file alone**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.search-context-regression.test.tsx -- --runInBand
```

Expected now: FAIL in `returns from a history fragment when an attachment send starts`,
or PASS if already fixed.

- [ ] **Step 4: Classify each failure**

For each failing test, write a short local note before editing:

```text
<file>::<test name>
Observed state:
- composer text enabled? yes/no
- attachment button enabled? yes/no
- voice button enabled? yes/no
- visible runtime banner/copy:
- missing mock/API response:
Classification: outdated test setup | real product bug | duplicate coverage
```

Do not commit the note unless it becomes useful as code comments or finding
evidence.

## Task 2: Stabilize Runtime Offline-State Tests

- [ ] **Step 1: Inspect runtime test setup**

Read:

```bash
sed -n '1,240p' frontend/src/features/chat/pages/ChatPage.runtime.test.tsx
sed -n '240,640p' frontend/src/features/chat/pages/ChatPage.runtime.test.tsx
```

Expected: identify how tests mock `fetch`, `navigator.onLine`, browser events,
realtime responses and offline cache/outbox state.

- [ ] **Step 2: Fix the smallest runtime setup gap**

If failures are caused by missing current runtime prerequisites, update the
test helper in `ChatPage.runtime.test.tsx` so each scenario explicitly provides
the required startup data before asserting offline behavior. Keep scenario
assertions focused on user-visible runtime state.

If the component is genuinely stuck after valid setup, write the smallest
failing test in `ChatPage.runtime.test.tsx` first, then fix `ChatPage.tsx` or
the related runtime helper.

- [ ] **Step 3: Verify runtime tests**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.runtime.test.tsx -- --runInBand
```

Expected: PASS.

## Task 3: Stabilize Composer Send/Media/Voice Tests

- [ ] **Step 1: Inspect composer readiness expectations**

Read the failing sections:

```bash
sed -n '680,1045p' frontend/src/features/chat/pages/ChatPage.test.tsx
```

Expected: identify which tests expect text, attachment or voice controls to be
enabled and which current Offline-first PWA state disables them.

- [ ] **Step 2: Update tests according to current product rules**

Use these rules:

- Text send can be available through durable outbox when the chat has a valid
  tenant/auth/thread/user scope.
- Attachments and voice remain online-only.
- If a test is about successful attachment or voice send, the setup must keep
  the chat online and fully ready.
- If a test is about offline behavior, it must not expect attachment or voice
  submit controls to be enabled.

If the current component violates these rules, write or keep the failing test
and fix product code minimally.

- [ ] **Step 3: Verify general ChatPage tests**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.test.tsx -- --runInBand
```

Expected: PASS, or remaining unrelated failures are moved to a new finding.

## Task 4: Stabilize Search-Context Attachment Regression

- [ ] **Step 1: Inspect the failing scenario**

Read:

```bash
sed -n '640,770p' frontend/src/features/chat/pages/ChatPage.search-context-regression.test.tsx
```

Expected: identify why `Отправить файл` is not available after selecting an
attachment from a history fragment.

- [ ] **Step 2: Fix setup or product behavior**

If the test is missing online-ready setup, update the test helper. If a valid
online-ready user cannot send an attachment from the history-fragment state,
fix the product path that should return the chat from history fragment to the
latest transcript before attachment send.

- [ ] **Step 3: Verify search-context regression tests**

Run:

```bash
pnpm --dir frontend test src/features/chat/pages/ChatPage.search-context-regression.test.tsx -- --runInBand
```

Expected: PASS.

## Task 5: Full Frontend Closure

- [ ] **Step 1: Run targeted ChatPage files**

Run:

```bash
pnpm --dir frontend test \
  src/features/chat/pages/ChatPage.runtime.test.tsx \
  src/features/chat/pages/ChatPage.test.tsx \
  src/features/chat/pages/ChatPage.search-context-regression.test.tsx \
  -- --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run:

```bash
pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 3: Run static checks**

Run:

```bash
pnpm --dir frontend typecheck
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Close findings**

Delete `docs/findings/F-TEST-003-chatpage-unit-suite-timeouts.md` after the
acceptance criteria are met.

If `ChatPage.test.tsx` is split or reduced enough to close the oversize
finding, also delete `docs/findings/F-TEST-002-chatpage-test-code-health-overshoot.md`.
If not, leave `F-TEST-002` open.

- [ ] **Step 5: Checkpoint commit**

Commit only this test-stabilization scope.

Suggested message:

```bash
git add frontend/src/features/chat/pages docs/findings
git commit -m "test: stabilize chat page unit suite"
```
