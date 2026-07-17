# Product Version Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show a static product version from root package.json on the authenticated profile page.

**Architecture:** Root package.json version is a manually maintained informational value. Vite reads it at build configuration time and exposes one compile-time frontend constant. The existing profile page renders that constant; no backend or deployment subsystem participates.

**Tech Stack:** Node.js 24, pnpm 10, React 19, Vite 8, TypeScript 6, Vitest.

## Global Constraints

- Start with root package.json version 0.1.0.
- Before a future production release, the agent analyses the change and proposes patch, minor, or major; only after explicit user confirmation is root package.json version manually changed.
- Show exactly версия: X.Y.Z in the existing profile page.
- Do not change Git tags, release manifests, staged deployment, rollback, markers, GitHub Actions, backend API, database, or runtime requests.
- Do not add release history, release notes, settings UI, or an editable version field.
- Stop after Tasks 1 and 2 are complete.

---

### Task 1: Make root version available to frontend builds

**Files:**

- Modify: package.json
- Modify: frontend/vite.config.ts
- Test: pnpm --dir frontend build

**Interfaces:**

- Consumes root package.json version string 0.1.0.
- Produces compile-time constant import.meta.env.VITE_PRODUCT_VERSION for frontend code and Vitest.
- Does not create an endpoint, environment contract, release workflow, or deployment input.

- [x] **Step 1: Add root version**

  In root package.json, add one top-level field next to name/private:

  ```json
  "version": "0.1.0"
  ```

- [x] **Step 2: Hand the value to Vite**

  In frontend/vite.config.ts add the Node import:

  ```ts
  import { readFileSync } from 'node:fs'
  ```

  Before defineConfig, read only root package version:

  ```ts
  const rootPackage = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
  ```

  Add this define entry to returned Vite configuration:

  ```ts
  define: {
    'import.meta.env.VITE_PRODUCT_VERSION': JSON.stringify(rootPackage.version),
  },
  ```

  Keep existing build, plugins, server, and test configuration unchanged.

- [x] **Step 3: Run the focused build check**

  Run: pnpm --dir frontend build

  Expected: PASS. The build has read root package version and produced frontend assets without an external service.

- [x] **Step 4: Commit Task 1**

  ```bash
  git add package.json frontend/vite.config.ts
  git commit -m "feat(frontend): expose product version"
  ```

### Task 2: Render and test the profile version

**Files:**

- Modify: frontend/src/features/profile/pages/UserProfilePage.tsx
- Modify: frontend/src/features/profile/pages/UserProfilePage.test.tsx
- Test: frontend/src/features/profile/pages/UserProfilePage.test.tsx

**Interfaces:**

- Consumes import.meta.env.VITE_PRODUCT_VERSION from Task 1.
- Produces one read-only DetailRow in the existing profile definition list.
- Makes no profile-client call and changes no backend contract.

- [x] **Step 1: Write failing profile assertion**

  In first existing UserProfilePage rendering test, after contact-field assertions, add:

  ```ts
  expect(screen.getByText('версия:')).toBeInTheDocument()
  expect(screen.getByText('0.1.0')).toBeInTheDocument()
  ```

- [x] **Step 2: Run the focused test and verify failure**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run     src/features/profile/pages/UserProfilePage.test.tsx
  ```

  Expected: FAIL because profile page has no version row.

- [x] **Step 3: Render static build value**

  Add this existing-row-compatible JSX after Телефон inside UserProfilePage definition list:

  ```tsx
  <DetailRow label="версия:" value={import.meta.env.VITE_PRODUCT_VERSION} />
  ```

  Do not add state, effect, request, route, link, form control, or fallback value.

- [x] **Step 4: Run focused checks**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run     src/features/profile/pages/UserProfilePage.test.tsx
  pnpm --dir frontend build
  pnpm lint
  git diff --check
  ```

  Expected: every command exits 0.

- [x] **Step 5: Focused review and one feature commit**

  Review only package.json, frontend/vite.config.ts, UserProfilePage.tsx, and UserProfilePage.test.tsx for wrong version source, changed profile API behavior, extra request, or incorrect copy.

  Fix Critical/Important review findings in scope and rerun affected focused check. Report Minor observations without expanding scope.

  Then commit remaining Task 2 and closure changes:

  ```bash
  git add package.json frontend/vite.config.ts     frontend/src/features/profile/pages/UserProfilePage.tsx     frontend/src/features/profile/pages/UserProfilePage.test.tsx
  git commit -m "feat(profile): show product version"
  ```

## Plan Self-Review

- Scope: exactly two tasks; deployment, tags, manifests, rollback, GitHub, backend, and release workflow are absent.
- Coverage: Task 1 creates one root version and build-time handoff; Task 2 renders exact copy and proves it with a focused test.
- Interfaces: Vite produces import.meta.env.VITE_PRODUCT_VERSION and profile consumes the same name.
- Future release process: patch/minor/major recommendation and manual root version update are a human approval process, not an automated subsystem.
