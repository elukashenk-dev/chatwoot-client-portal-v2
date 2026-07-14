# F-LOAD-006: Presence throttle state

- status: open
- found_in: Full application risk audit 2026-07-13; candidate LOAD-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Presence throttle state
- confidence: high
- evidence: `backend/src/app.ts:138-139`; `backend/src/modules/chat-presence/service.ts:118-206,208-310`
- failure_path: Successful read keys never expire and typing keys survive missing/failed off; maps grow for process lifetime, while alternating replicas bypass each local window
- counterevidence: Authorized successful keys only, repeats overwrite, frontend debounces and process restart clears memory
- load_impact: Successful read keys never expire and typing keys survive missing/failed off; maps grow for process lifetime, while alternating replicas bypass each local window
- fix_short: Add TTL/size-bounded eviction and decide shared/routed cross-replica throttling; test cardinality churn without per-request cleanup scans
- acceptance: Add TTL/size-bounded eviction and decide shared/routed cross-replica throttling; test cardinality churn without per-request cleanup scans Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
