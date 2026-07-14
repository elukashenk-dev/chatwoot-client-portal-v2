# F-AUTH-006: Frontend session lifecycle

- status: open
- found_in: Full application risk audit 2026-07-13; candidate FRONT-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Frontend session lifecycle
- confidence: high
- evidence: `frontend/src/features/auth/lib/AuthSessionProvider.tsx:360-456`; `frontend/src/features/auth/lib/offlineAuthSession.ts:70-80`; `frontend/src/features/admin-auth/lib/AdminSessionProvider.tsx:26-64`; `stages/05-frontend-pwa.md#front-001-open-shells-do-not-follow-the-declared-session-lifecycle`
- failure_path: An already-rendered customer/admin shell remains authenticated in React after declared expiry; offline data stays visible, and non-chat 401 paths leave a stuck protected shell
- counterevidence: Backend still rejects expired authority; cached startup rejects an already-expired snapshot; chat 401 paths explicitly refresh session
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Add expiry timer plus visibility/online checks and centralized protected-client 401 invalidation; test cached/online customer and admin schedules
- acceptance: Add expiry timer plus visibility/online checks and centralized protected-client 401 invalidation; test cached/online customer and admin schedules Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
