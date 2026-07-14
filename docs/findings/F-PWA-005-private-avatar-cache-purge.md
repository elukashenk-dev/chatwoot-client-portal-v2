# F-PWA-005: Private avatar cache cleanup

- status: open
- found_in: Full application risk audit 2026-07-13; candidate FRONT-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded maintenance fix before this control is relied on as regression evidence.
- area: Private avatar cache cleanup
- confidence: high
- evidence: `frontend/public/sw.js:73-84,251-300`; `frontend/src/features/offline/offlineStore.ts:293-386`; `stages/05-frontend-pwa.md#front-003-device-data-removal-does-not-purge-private-avatar-bytes`
- failure_path: Device-data removal clears identity records but leaves private avatar responses in CacheStorage until revision activation/site clear; same identity can later reuse stale bytes
- counterevidence: Query keys include tenant/user and no active/signed-out identity can select the entry through normal runtime
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Add identity-scoped purge or separate private cache and test removal, same-user relogin and different-user isolation
- acceptance: Add identity-scoped purge or separate private cache and test removal, same-user relogin and different-user isolation Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
