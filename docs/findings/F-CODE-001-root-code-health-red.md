status: open
found_in: notification-settings-simplify verification
risk: medium
urgency: before relying on root `pnpm lint` as a clean release gate
area: code-health / maintainability

# Root Code Health Gate Is Red

## Evidence

`pnpm lint` fails at the root `pnpm code-health` step before package eslint
can run. The current failing files are:

- `backend/src/modules/chat-messages/service.test.ts`: `1138` lines, test
  limit `1000`.
- `backend/src/modules/chat-messages/service.ts`: `1206` lines, allowlist
  baseline `1164`.
- `backend/src/modules/chat-threads/service.test.ts`: `1133` lines, test
  limit `1000`.
- `backend/src/modules/chatwoot-webhooks/service.ts`: `502` lines,
  production limit `500`.
- `frontend/src/features/chat/pages/ChatPage.tsx`: `552` lines, allowlist
  baseline `527`.
- `frontend/src/features/offline/offlineStore.ts`: `647` lines, production
  limit `500`.

The notification-settings slice briefly pushed
`frontend/src/pwa/serviceWorkerAsset.test.ts` over the test limit; that local
regression was fixed by splitting notification-option tests into a separate
file. The remaining failures are outside this slice.

## Fix Short

Create a dedicated maintenance slice that splits the listed oversized modules
or updates existing deferred split plans with code movement, not by growing the
allowlist.

## Acceptance

- `pnpm code-health` exits `0`.
- Root `pnpm lint` reaches and completes package eslint.
- No new allowlist growth is introduced without an explicit architecture
  decision.
