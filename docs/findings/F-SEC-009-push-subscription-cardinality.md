# F-SEC-009: An authenticated user can create unbounded active push subscriptions and amplify storage and delivery work

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A10-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / resource-exhaustion
- confidence: high
- canonical_security_finding: SEC-STD-A10-004; generated writeup findings/sec-std-a10-004/sec-std-a10-004.md
- evidence: backend/src/modules/chat-notifications/routes.ts:298-318; backend/src/modules/chat-notifications/pushDeliveryService.ts:184-262; backend/src/modules/chat-notifications/repository.ts:164-176. Per-device and per-endpoint uniqueness prevents exact duplicates but does not cap devices/endpoints per user, rate-limit registration, or verify provider ownership at registration.
- failure_path: The authenticated route accepts a fresh endpoint/device pair each request. The repository upserts a new active row because neither unique key conflicts. Active rows are not age-pruned while they remain active. A later inbound message enumerates every row, records an attempt, and calls the provider sequentially.
- counterevidence: Input lengths/origins are bounded, exact endpoint and active device duplicates are constrained, and each network attempt has a five-second socket timeout. Distinct caller-chosen device/endpoint pairs remain unbounded.
- load_impact: The authenticated route accepts a fresh endpoint/device pair each request. The repository upserts a new active row because neither unique key conflicts. Active rows are not age-pruned while they remain active. A later inbound message enumerates every row, records an attempt, and calls the provider sequentially.
- fix_short: The invariant to restore is straightforward: a tenant/user may own at most a small, explicit number of active push subscriptions, and each message may attempt no more than that number. The check must be race-safe and shared across backend instances. A route-only `COUNT` followed by the existing insert is not sufficient because concurrent requests can all observe room below the limit.
- acceptance: Reproduce SEC-STD-A10-004, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
