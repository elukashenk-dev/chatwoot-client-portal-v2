status: open
found_in: PWA offline-first debugging review, 2026-06-23
risk: medium
urgency: before positioning the portal as Telegram-like offline readable
area: offline auth, PWA startup, cached chat access

## Evidence

- `frontend/src/features/offline/types.ts` sets
  `OFFLINE_AUTH_GRACE_MS = 24 * 60 * 60 * 1000`.
- `frontend/src/features/auth/lib/offlineAuthSession.ts` calculates
  `offlineAccessUntil` as the minimum of backend session expiry and `now + 24h`.
- `frontend/src/features/offline/startupCache.ts` rejects startup auth when
  `offlineAccessUntil <= Date.now()`.
- Architecture decision D-022 says backend remains authority for session, send
  and freshness, but does not require a 24 hour offline read window.

The current implementation blocks read-only cached chat startup after one day
without a successful online auth refresh. That is a local policy decision, not
a PWA platform requirement.

## Fix Short

Revisit offline auth semantics. A likely split is: keep backend authority for
send/drain/freshness, but allow longer read-only access to previously cached
chat history on the same device, with explicit local-data removal and sign-out
markers still taking precedence.

## Acceptance

- Product policy defines how long read-only cached chat may open offline.
- Tests cover the chosen duration and expired-session behavior.
- Offline send/drain still requires backend reconciliation before canonical
  delivery.
