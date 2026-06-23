# Chat Bubble Flat Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make only the existing chat message bubbles flatter: remove bubble shadows, keep current bubble geometry/markup, use a `#F7F7F7` incoming bubble with a soft `0.4` opacity border.

**Architecture:** This is a frontend-only CSS polish slice. The existing `MessageBubble` markup, grouping radii, widths, metadata placement, avatars, reply/menu behavior, transcript spacing, header, composer, admin preview components, backend APIs and persistence stay unchanged. The change is limited to semantic bubble surface classes in `frontend/src/index.css` and CSS regression coverage in `frontend/src/indexCss.test.ts`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 source CSS, Vitest text-based CSS regression test.

---

## Scope Lock

Modify only:

- `frontend/src/index.css`
- `frontend/src/indexCss.test.ts`

Do not modify:

- `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- `frontend/src/features/chat/components/ChatTranscript.tsx`
- `frontend/src/features/chat/components/MessageComposer.tsx`
- `frontend/src/features/chat/components/ChatHeader.tsx`
- `frontend/src/features/admin-branding/**`
- backend files, database schema, API contracts, tenant branding schema, docs baseline, work-log, assets or generated outputs.

Accepted visual target:

- current bubble radii stay as implemented by `getBubbleRadiusClass`:
  `rounded-[0.7rem]` with the current `rounded-br-[0.3rem]` /
  `rounded-tl-[0.3rem]` grouped corners;
- outgoing bubble keeps `background-color: var(--color-chat-outgoing)`;
- outgoing bubble has no shadow and no gradient;
- incoming bubble uses `background: #f7f7f7` in CSS, matching the accepted
  `#F7F7F7` color;
- incoming bubble uses `border-color: rgb(203 213 225 / 0.4)`;
- incoming bubble has no shadow, no gradient and no glass blur.

## File Structure

- `frontend/src/index.css` owns the reusable semantic surface classes:
  `.chat-outgoing-surface` and `.chat-incoming-surface`.
- `frontend/src/indexCss.test.ts` owns cheap regression checks for CSS source
  invariants that are easy to accidentally regress during visual work.
- `frontend/src/features/admin-branding/components/portal-preview/ChatConversationPreview.tsx`
  already renders the shared `ChatTranscript`, so the admin branding chat
  preview receives this bubble change through the same CSS classes. Do not edit
  admin preview files in this slice.

## Task 0: Branch And Preflight

**Files:**

- Read only: git status

- [ ] **Step 1: Confirm the worktree state**

Run:

```bash
git status --short --branch
```

Expected: current branch is `main` or a dedicated branch, and there are no unrelated modified tracked files. If there are unrelated changes, stop and clarify ownership before editing.

- [ ] **Step 2: Create the focused branch when still on `main`**

Run:

```bash
git switch -c fix/chat-bubble-flat-surfaces
```

Expected: branch switches to `fix/chat-bubble-flat-surfaces`.

Skip this step only if an appropriate focused branch already exists.

## Task 1: Lock The Bubble CSS Contract First

**Files:**

- Modify: `frontend/src/indexCss.test.ts`
- Test: `frontend/src/indexCss.test.ts`

- [ ] **Step 1: Update the outgoing bubble CSS test**

In `frontend/src/indexCss.test.ts`, replace the existing test named
`keeps outgoing chat bubbles flat without gradient overlays` with:

```ts
  it('keeps outgoing chat bubbles flat without shadows or gradient overlays', () => {
    const outgoingRule = getCssRule('.chat-outgoing-surface {')

    expect(outgoingRule).toContain(
      'background-color: var(--color-chat-outgoing);',
    )
    expect(outgoingRule).toContain('box-shadow: none;')
    expect(outgoingRule).not.toContain('background-image')
    expect(outgoingRule).not.toContain('linear-gradient')
  })
```

- [ ] **Step 2: Add the incoming bubble CSS test**

Immediately after the outgoing bubble test, add:

```ts
  it('keeps incoming chat bubbles light, flat, and softly outlined', () => {
    const incomingRule = getCssRuleBySelectors(['.chat-incoming-surface'])

    expect(incomingRule).toContain('background: #f7f7f7;')
    expect(incomingRule).toContain(
      'border-color: rgb(203 213 225 / 0.4);',
    )
    expect(incomingRule).toContain('box-shadow: none;')
    expect(incomingRule).not.toContain('linear-gradient')
    expect(incomingRule).not.toContain('backdrop-filter')
  })
```

- [ ] **Step 3: Run the targeted test and confirm it fails**

Run:

```bash
pnpm --dir frontend test -- indexCss.test.ts
```

Expected: FAIL. The failure should point to the current bubble CSS still having shadows and the incoming bubble still using gradient/glass styling.

If the test passes before implementation, re-check that the assertions were added to the correct file and are reading `frontend/src/index.css`.

## Task 2: Implement The Minimal Bubble CSS Change

**Files:**

- Modify: `frontend/src/index.css`
- Test: `frontend/src/indexCss.test.ts`

- [ ] **Step 1: Replace only the outgoing bubble surface rule**

In `frontend/src/index.css`, replace:

```css
.chat-outgoing-surface {
  background-color: var(--color-chat-outgoing);
  box-shadow: 0 8px 20px rgb(20 65 100 / 0.16);
}
```

with:

```css
.chat-outgoing-surface {
  background-color: var(--color-chat-outgoing);
  box-shadow: none;
}
```

- [ ] **Step 2: Replace only the incoming bubble surface rule**

In `frontend/src/index.css`, replace:

```css
.chat-incoming-surface {
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 0.88),
    rgb(255 255 255 / 0.72)
  );
  box-shadow:
    0 10px 26px rgb(20 65 100 / 0.08),
    inset 0 1px 0 rgb(255 255 255 / 0.76);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
```

with:

```css
.chat-incoming-surface {
  background: #f7f7f7;
  border-color: rgb(203 213 225 / 0.4);
  box-shadow: none;
}
```

Do not edit any other selector in `frontend/src/index.css`.

- [ ] **Step 3: Run the targeted CSS regression test**

Run:

```bash
pnpm --dir frontend test -- indexCss.test.ts
```

Expected: PASS.

## Task 3: Visual Smoke The Bubble-Only Change

**Files:**

- Read only: current browser/runtime surface
- Do not modify app files in this task

- [ ] **Step 1: Start the frontend dev server if one is not already running**

Run:

```bash
pnpm --dir frontend dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`.

If the port is already occupied by another expected frontend server, reuse the existing URL.

- [ ] **Step 2: Inspect the customer chat screen visually**

Open the authenticated chat runtime or the existing chat preview path used for local visual checks.

Acceptance:

- outgoing and incoming message bubble shadows are gone;
- outgoing bubble color remains the current `--color-chat-outgoing` value;
- incoming bubble uses `#F7F7F7`;
- incoming bubble has a visible but soft border equivalent to
  `rgb(203 213 225 / 0.4)`;
- current bubble radii/grouping are unchanged;
- header, composer, transcript spacing, date divider, avatars, action menu,
  reply gesture and layout were not changed by this slice.

- [ ] **Step 3: Inspect the admin branding chat preview visually**

Open `/admin/branding`, switch to the chat preview tab/screen, and inspect the
preview conversation.

Acceptance:

- admin branding chat preview bubbles match the customer runtime bubble surface:
  outgoing has no shadow, incoming uses `#F7F7F7`, incoming border is
  `rgb(203 213 225 / 0.4)`, and current bubble radii/grouping remain unchanged;
- admin preview header, composer, preview frame layout, controls and branding
  form are not changed by this slice;
- if admin preview does not pick up the shared CSS change, stop and revise the
  plan with the user before touching `frontend/src/features/admin-branding/**`.

- [ ] **Step 4: Stop only the dev server you started**

If this task started a new foreground dev server, stop it with `Ctrl+C`.

Do not stop unrelated user-owned dev services.

## Task 4: Closure Checks

**Files:**

- Check only changed tracked files

- [ ] **Step 1: Review the diff for scope creep**

Run:

```bash
git diff -- frontend/src/index.css frontend/src/indexCss.test.ts
```

Expected:

- diff only touches `.chat-outgoing-surface`, `.chat-incoming-surface` and the
  related CSS tests;
- no React component, admin preview, backend, docs baseline, generated output or asset changes are present.

- [ ] **Step 2: Run frontend lint**

Run:

```bash
pnpm --dir frontend lint
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Remove generated smoke artifacts before final status**

Remove only generated local smoke artifacts created during this task, such as
`.playwright-mcp/` and `admin-branding-chat-bubbles.png`.

Do not remove `.superpowers/brainstorm/**`; it is the visual companion state
and is ignored by git.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short --branch
```

Expected: only these implementation files are modified, plus this plan file if
the user wants to preserve the implementation plan:

```text
frontend/src/index.css
frontend/src/indexCss.test.ts
docs/superpowers/plans/2026-06-23-chat-bubble-flat-surfaces.md
```

Ignored `.superpowers/brainstorm/**` mockup files may exist locally and must not
be staged. Generated outputs, screenshots, `.playwright-mcp/`, `dist/`, and
other runtime artifacts must not be staged.

- [ ] **Step 7: Offer a checkpoint commit after closure**

If all checks pass and the user wants a commit, run:

```bash
git add frontend/src/index.css frontend/src/indexCss.test.ts docs/superpowers/plans/2026-06-23-chat-bubble-flat-surfaces.md
git commit -m "fix: flatten chat bubble surfaces"
```

Expected: one focused commit containing only the bubble CSS and CSS regression test.

## Self-Review

- Spec coverage: the plan implements only the accepted bubble design target:
  no shadows, `#F7F7F7` incoming bubble, `0.4` border opacity, existing
  markup/radii.
- Placeholder scan: no `TBD`, `TODO`, unspecified tests or broad “handle edge
  cases” steps remain.
- Type/name consistency: selectors match existing CSS and test helpers:
  `.chat-outgoing-surface`, `.chat-incoming-surface`, `getCssRule`.
- Scope check: no task touches chat header, composer, transcript spacing,
  React markup, backend, admin preview components, object storage, assets,
  work-log or stable architecture docs.
