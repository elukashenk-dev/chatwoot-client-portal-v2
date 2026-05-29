# F-TEST-003 ChatPage Unit Suite Timeouts

- `status`: `open`
- `found_in`: PWA offline launch fix verification
- `risk`: `medium`
- `urgency`: before using full `pnpm --dir frontend test` as a required green
  gate for prod hotfix closure
- `area`: frontend tests, ChatPage runtime and composer scenarios
- `task`: `docs/superpowers/plans/2026-05-29-chatpage-test-suite-stabilization.md`
- `evidence`:
  - On branch `fix/pwa-offline-launch`, `pnpm --dir frontend test` fails in
    existing ChatPage unit tests while targeted boot tests pass.
  - `pnpm --dir frontend test src/features/chat/pages/ChatPage.runtime.test.tsx -- --runInBand`
    also fails on the unchanged production cleanup baseline
    `fix/no-legacy-cleanup-gate`, so this is not introduced by the PWA boot
    deadline change.
  - Current failures include 5s timeouts in runtime offline-state scenarios and
    composer actions rendered disabled where tests expect enabled file/send or
    microphone behavior.
- `fix_short`: Split investigation from the PWA boot hotfix. Reproduce the
  failing ChatPage tests in isolation, verify whether the test setup misses
  required runtime mocks or the component now correctly disables composer
  actions, then update the tests or fix the ChatPage runtime state root cause.
- `acceptance`:
  - `pnpm --dir frontend test src/features/chat/pages/ChatPage.runtime.test.tsx -- --runInBand`
    passes.
  - `pnpm --dir frontend test src/features/chat/pages/ChatPage.test.tsx -- --runInBand`
    passes or has any remaining unrelated failures split into separate findings.
  - Full `pnpm --dir frontend test` can be used as a reliable frontend closure
    gate again.
