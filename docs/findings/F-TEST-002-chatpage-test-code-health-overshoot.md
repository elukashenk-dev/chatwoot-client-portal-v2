# F-TEST-002 ChatPage Test Code-Health Overshoot

- `status`: `open`
- `found_in`: no-legacy cleanup gate verification
- `risk`: `low`
- `urgency`: before requiring `pnpm code-health` as a green closure gate for
  every feature slice
- `area`: frontend tests, chat page scenario coverage
- `evidence`:
  - `pnpm code-health` fails on
    `frontend/src/features/chat/pages/ChatPage.test.tsx`.
  - Current count is `1101` lines while the allowlist baseline is `1074`.
  - The code-health config already marks chat page test split by scenario as
    deferred, but the file has grown past that baseline.
- `fix_short`: Split `ChatPage.test.tsx` by scenario area, for example thread
  selection, optimistic send, runtime errors and navigation state, then lower or
  remove the allowlist entry.
- `acceptance`:
  - `frontend/src/features/chat/pages/ChatPage.test.tsx` is at or below its
    current allowlist baseline, or the scenario split removes the allowlist
    entry entirely.
  - `pnpm code-health` has no `ChatPage.test.tsx` failure.
  - Existing chat page tests still cover the same user-visible behaviors after
    the split.
