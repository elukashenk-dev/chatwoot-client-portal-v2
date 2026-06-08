# Task 06: Verification, Review And Closure

## Цель

Закрыть implementation только после targeted checks, независимого review,
фикса findings и понятного checkpoint.

## Final Closure Checks

These checks are for final closure after all task-level targeted checks are
green. During task implementation use the smaller targeted checks listed in
each task file.

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/chat/components/ChatTranscript.test.tsx src/features/chat/components/ChatFullScreenPanel.test.tsx src/features/chat/components/ChatInfoPage.test.tsx --reporter verbose
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 pnpm test:e2e -- tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-assets.spec.ts tests/e2e/admin-branding-real-preview.spec.ts
pnpm lint
pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm build
git diff --check
```

## Independent Code Review

Ask read-only reviewer to inspect the implementation after tests:

- preview is truly read-only;
- no customer API/Chatwoot authority leaks into admin preview;
- `ChatTranscript isReadOnly` does not change normal chat runtime;
- `ChatFullScreenPanel isBackActionReadOnly` does not change normal chat
  runtime;
- visual coverage is enough for `Вход`, `Чат`, `Инфо`;
- settings/notifications were not added;
- tests cover draft updates, API boundaries, old admin flows and layout.

Fix Critical/Important findings before closure. If any finding is deferred,
write it to `docs/findings/` according to Findings Workflow.

## Docs Decision

Update stable docs only if implementation changes stable baseline:

- `docs/roadmap/work-log.md`
- `docs/roadmap/implementation-plan.md`
- `docs/architecture/overview.md`

Do not write transient test runs or review minutiae to work-log.

If `docs/roadmap/work-log.md` is updated, replace the existing final
`Recommended Next Step` block. Do not append a second next-step block.

If this is only a preview-parity fix inside MT-9H and MT-9H still has final
manual QA/deploy readiness, do not mark all MT-9H closed.

## Checkpoint Commit

After implementation, review, fixes and verification:

```bash
git status --short --branch
git add -A frontend/src tests/e2e docs/roadmap docs/architecture docs/superpowers/plans/2026-06-08-mt-9h-real-portal-preview.md docs/superpowers/plans/2026-06-08-mt-9h-real-portal-preview/
git commit -m "fix: show real portal screens in branding preview"
```

Do not push remote until branding is fully closed and the user approves.

## Closure Summary Required

Final response should include:

- branch;
- changed files;
- tests run and result;
- independent review result;
- whether docs/work-log changed;
- commit hash if checkpoint commit was created.
