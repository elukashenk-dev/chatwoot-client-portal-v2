# F-PWA-004: Offline retention/cardinality

- status: open
- found_in: Full application risk audit 2026-07-13; candidate FRONT-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Offline retention/cardinality
- confidence: high
- evidence: `frontend/src/features/offline/offlineStore.ts:431-497`; `frontend/src/features/chat/pages/offlineChatCache.ts:129-145`; `stages/05-frontend-pwa.md#front-002-retention-policy-is-dead-and-active-history-is-unbounded`
- failure_path: Production never invokes prune; cursor pages and markers accumulate without active-user record/byte caps until explicit removal, quota pressure or browser eviction
- counterevidence: Tenant/user/thread scoping, 50-message latest snapshots and explicit current-user removal hold
- load_impact: Production never invokes prune; cursor pages and markers accumulate without active-user record/byte caps until explicit removal, quota pressure or browser eviction
- fix_short: Schedule bounded idle cleanup; add per-user/thread byte/page and terminal-record limits; test 10x/100x history while preserving pending outbox work
- acceptance: Schedule bounded idle cleanup; add per-user/thread byte/page and terminal-record limits; test 10x/100x history while preserving pending outbox work Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
